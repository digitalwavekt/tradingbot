const axios = require('axios');
const speakeasy = require('speakeasy');
const { BrokerAccount } = require('../../models');
const logger = require('../../utils/logger');

class DhanTokenService {
  constructor() {
    this.clientId = process.env.DHAN_CLIENT_ID;
    this.pin = process.env.DHAN_PIN;
    this.totpSecret = process.env.DHAN_TOTP_SECRET;
    this.apiBaseUrl = process.env.DHAN_API_BASE_URL || 'https://api.dhan.co/v2';
    this.authBaseUrl = process.env.DHAN_AUTH_BASE_URL || 'https://auth.dhan.co/app';

    // In-flight token generation/renewal promise. Prevents concurrent
    // callers (e.g. parallel candle fetches for many symbols) from each
    // triggering their own TOTP/renew request — Dhan rate-limits
    // generateAccessToken to once every 2 minutes, so a "thundering herd"
    // of simultaneous requests causes most of them to fail with
    // "Invalid Dhan generateAccessToken response".
    this._pendingTokenPromise = null;
  }

  validateBaseConfig() {
    if (!this.clientId) {
      throw new Error('DHAN_CLIENT_ID is required');
    }
  }

  validateTotpConfig() {
    this.validateBaseConfig();

    if (!this.pin) {
      throw new Error('DHAN_PIN is required for TOTP token generation');
    }

    if (!this.totpSecret) {
      throw new Error('DHAN_TOTP_SECRET is required for TOTP token generation');
    }
  }

  async getStoredAccount() {
    this.validateBaseConfig();

    if (typeof BrokerAccount.findActiveDhanAccountWithToken === 'function') {
      return BrokerAccount.findActiveDhanAccountWithToken(this.clientId);
    }

    return BrokerAccount.findOne({
      broker: 'DHAN',
      accountId: this.clientId,
      isActive: true
    }).select('+accessToken +refreshToken +apiKey +apiSecret');
  }

  async getValidToken() {
    const account = await this.getStoredAccount();

    if (!account || !account.accessToken || !account.tokenExpiry) {
      logger.warn('No stored Dhan token found. Generating token with TOTP.');
      return this._getOrCreateTokenPromise(() => this.generateTokenWithTotp());
    }

    const expiresAt = new Date(account.tokenExpiry).getTime();
    const now = Date.now();

    if (Number.isNaN(expiresAt) || expiresAt <= now) {
      logger.warn('Stored Dhan token is expired/invalid. Generating token with TOTP.');
      return this._getOrCreateTokenPromise(() => this.generateTokenWithTotp());
    }

    const renewBeforeMs = 90 * 60 * 1000;

    if (expiresAt - now > renewBeforeMs) {
      await BrokerAccount.updateOne(
        { _id: account._id },
        {
          tokenStatus: 'VALID',
          lastTokenCheckAt: new Date(),
          lastError: null
        }
      );

      return account.accessToken;
    }

    await BrokerAccount.updateOne(
      { _id: account._id },
      {
        tokenStatus: 'EXPIRING_SOON',
        lastTokenCheckAt: new Date()
      }
    );

    return this._getOrCreateTokenPromise(async () => {
      try {
        return await this.renewToken(account.accessToken);
      } catch (error) {
        logger.warn(`Dhan token renew failed. Trying TOTP generation: ${error.message}`);
        return this.generateTokenWithTotp();
      }
    });
  }

  /**
   * Single-flight guard: if a token generation/renewal is already in
   * progress, all concurrent callers await the SAME promise instead of
   * each firing their own request against Dhan's rate-limited
   * generateAccessToken/RenewToken endpoints (limited to once every
   * 2 minutes). The first caller's result is shared with everyone.
   */
  async _getOrCreateTokenPromise(factory) {
    if (this._pendingTokenPromise) {
      return this._pendingTokenPromise;
    }

    const promise = (async () => {
      try {
        return await factory();
      } finally {
        this._pendingTokenPromise = null;
      }
    })();

    this._pendingTokenPromise = promise;
    return promise;
  }

  async renewToken(currentToken) {
    this.validateBaseConfig();

    if (!currentToken) {
      throw new Error('Current Dhan token is required for RenewToken');
    }

    const response = await axios.get(`${this.apiBaseUrl}/RenewToken`, {
      headers: {
        'access-token': currentToken,
        dhanClientId: this.clientId
      },
      timeout: 15000
    });

    const accessToken = response.data.accessToken || response.data.token;
    const expiryTime = response.data.expiryTime;

    if (!accessToken || !expiryTime) {
      throw new Error('Invalid Dhan RenewToken response');
    }

    await this.saveToken(accessToken, expiryTime, 'RENEW');

    logger.info('Dhan token renewed successfully');

    return accessToken;
  }

  async generateTokenWithTotp() {
    this.validateTotpConfig();

    const cleanSecret = String(this.totpSecret)
      .replace(/\s+/g, '')
      .toUpperCase();

    const totp = speakeasy.totp({
      secret: cleanSecret,
      encoding: 'base32',
      digits: 6,
      step: 30
    });

    if (!totp) {
      throw new Error('Failed to generate TOTP code');
    }

    const url =
      `${this.authBaseUrl}/generateAccessToken` +
      `?dhanClientId=${encodeURIComponent(this.clientId)}` +
      `&pin=${encodeURIComponent(this.pin)}` +
      `&totp=${encodeURIComponent(totp)}`;

    const response = await axios.post(url, null, {
      timeout: 15000
    });

    const { accessToken, expiryTime, message, status } = response.data;

    if (!accessToken || !expiryTime) {
      if (status === 'error' && message) {
        throw new Error(`Dhan generateAccessToken rejected: ${message}`);
      }
      throw new Error('Invalid Dhan generateAccessToken response');
    }

    await this.saveToken(accessToken, expiryTime, 'TOTP');

    logger.info('Dhan token generated successfully using TOTP');

    return accessToken;
  }

  /**
   * Dhan's generateAccessToken/RenewToken responses return `expiryTime` as a
   * timestamp string WITHOUT timezone info (e.g. "2026-06-13 12:39:40"),
   * which actually represents IST (UTC+5:30) — Dhan's local time.
   *
   * `new Date("2026-06-13 12:39:40")` on a UTC server parses this as UTC,
   * which is WRONG by +5:30. That bug caused tokens to appear "valid" for
   * 5.5 hours after they had actually already expired (DH-901 errors).
   *
   * This helper detects whether the string already carries explicit
   * timezone info (Z / +HH:MM / -HH:MM) or is a pure epoch number — if so,
   * it trusts the standard Date parser. Otherwise it assumes IST and
   * converts to the correct UTC instant.
   */
  parseDhanExpiry(expiryTime) {
    if (expiryTime === null || expiryTime === undefined || expiryTime === '') {
      return new Date(NaN);
    }

    if (typeof expiryTime === 'number' || /^\d+$/.test(String(expiryTime).trim())) {
      const num = Number(expiryTime);
      const ms = String(expiryTime).trim().length <= 10 ? num * 1000 : num;
      return new Date(ms);
    }

    const str = String(expiryTime).trim();

    if (/Z$|[+-]\d{2}:?\d{2}$/.test(str)) {
      return new Date(str);
    }

    const istMatch = str.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
    );

    if (istMatch) {
      const [, year, month, day, hour, minute, second] = istMatch.map(Number);
      const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
      const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
      return new Date(asUtcMs - istOffsetMs);
    }

    return new Date(str);
  }

  async saveToken(accessToken, expiryTime, source) {
    const expiryDate = this.parseDhanExpiry(expiryTime);

    if (Number.isNaN(expiryDate.getTime())) {
      throw new Error(`Invalid Dhan token expiry time: ${expiryTime}`);
    }

    await BrokerAccount.findOneAndUpdate(
      {
        broker: 'DHAN',
        accountId: this.clientId
      },
      {
        broker: 'DHAN',
        accountId: this.clientId,
        accountType: 'LIVE',

        accessToken,
        tokenExpiry: expiryDate,
        authMode: source === 'TOTP' ? 'TOTP' : 'RENEW',
        lastTokenSource: source,
        tokenStatus: 'VALID',
        lastTokenCheckAt: new Date(),
        lastRenewedAt: new Date(),

        isActive: true,
        isConnected: true,
        lastConnectedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
        healthCheckStatus: 'HEALTHY'
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
  }

  async markTokenError(error) {
    await BrokerAccount.findOneAndUpdate(
      {
        broker: 'DHAN',
        accountId: this.clientId
      },
      {
        broker: 'DHAN',
        accountId: this.clientId,
        accountType: 'LIVE',
        isActive: true,
        isConnected: false,
        tokenStatus: 'INVALID',
        lastError: error.message,
        lastErrorAt: new Date(),
        healthCheckStatus: 'UNHEALTHY'
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
  }
}

module.exports = new DhanTokenService();
