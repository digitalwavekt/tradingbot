const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const AuditLog = require('../../models/AuditLog');

const SECRET_KEYS = ['access-token', 'authorization', 'DHAN_ACCESS_TOKEN'];

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => {
    if (SECRET_KEYS.some(secret => key.toLowerCase().includes(secret.toLowerCase()))) {
      return [key, '[REDACTED]'];
    }
    return [key, val && typeof val === 'object' ? redact(val) : val];
  }));
}

class DhanApiClient {
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl || process.env.DHAN_API_BASE_URL || 'https://api.dhan.co/v2';
    this.clientId = config.clientId || process.env.DHAN_CLIENT_ID;
    this.accessToken = config.accessToken || process.env.DHAN_ACCESS_TOKEN;
    this.timeoutMs = Number(config.timeoutMs || process.env.DHAN_TIMEOUT_MS || 10000);

    this.http = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  assertConfigured() {
  if (!this.clientId) throw new Error('DHAN_CLIENT_ID is required');

  if (process.env.ENABLE_DHAN_AUTO_TOKEN !== 'true' && !this.accessToken) {
    throw new Error('DHAN_ACCESS_TOKEN is required when ENABLE_DHAN_AUTO_TOKEN is not true');
  }
}

async getAccessToken() {
  this.assertConfigured();

  if (process.env.ENABLE_DHAN_AUTO_TOKEN === 'true') {
    const dhanTokenService = require('./DhanTokenService');
    return dhanTokenService.getValidToken();
  }

  return this.accessToken;
}

async headers(extra = {}) {
  const token = await this.getAccessToken();

  return {
    'access-token': token,
    ...extra
  };
}

  async request(method, url, data, options = {}) {
    const requestId = options.requestId || crypto.randomUUID();
    const startedAt = Date.now();

    try {
      const response = await this.http.request({
        method,
        url,
        data,
        params: options.params,
        headers: await this.headers(options.headers)
      });

      await this.audit('BROKER_RESPONSE', {
        requestId,
        method,
        url,
        statusCode: response.status,
        latencyMs: Date.now() - startedAt
      });
      return response.data;
    } catch (error) {
      const statusCode = error.response?.status;
      const details = {
        requestId,
        method,
        url,
        statusCode,
        latencyMs: Date.now() - startedAt,
        response: redact(error.response?.data)
      };
      await this.audit('ERROR', details, statusCode && statusCode >= 500 ? 'CRITICAL' : 'WARNING');
      logger.warn(`Dhan API ${method.toUpperCase()} ${url} failed`, details);
      const message = error.response?.data?.message || error.response?.data?.remarks || error.message;
      const wrapped = new Error(`Dhan API error: ${message}`);
      wrapped.statusCode = statusCode;
      wrapped.details = details;
      throw wrapped;
    }
  }

  async audit(action, details, severity = 'INFO') {
    try {
      await AuditLog.create({
        action,
        details: {
          ...details,
          broker: 'dhan'
        },
        severity
      });
    } catch (error) {
      logger.debug(`Dhan audit write skipped: ${error.message}`);
    }
  }
}

module.exports = DhanApiClient;
