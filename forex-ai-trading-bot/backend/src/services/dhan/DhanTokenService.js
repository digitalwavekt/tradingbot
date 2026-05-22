const axios = require('axios');
const { authenticator } = require('otplib');
const { BrokerAccount } = require('../../models');
const logger = require('../../utils/logger');

class DhanTokenService {
  constructor() {
    this.clientId = process.env.DHAN_CLIENT_ID;
    this.pin = process.env.DHAN_PIN;
    this.totpSecret = process.env.DHAN_TOTP_SECRET;
    this.apiBaseUrl = process.env.DHAN_API_BASE_URL || 'https://api.dhan.co/v2';
    this.authBaseUrl = process.env.DHAN_AUTH_BASE_URL || 'https://auth.dhan.co/app';
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

    // accessToken has select:false in BrokerAccount model,
    // so we must explicitly select it.
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
      return this.generateTokenWithTotp();
    }

    const expiresAt = new Date(account.tokenExpiry).getTime();
    const now = Date.now();

    if (Number.isNaN(expiresAt) || expiresAt <= now) {
      logger.warn('Stored Dhan token is expired/invalid. Generating token with TOTP.');
      return this.generateTokenWithTotp();
    }

    // Renew 90 minutes before expiry
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

    try {
      return await this.renewToken(account.accessToken);
    } catch (error) {
      logger.warn(`Dhan token renew failed. Trying TOTP generation: ${error.message}`);
      return this.generateTokenWithTotp();
    }
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

    const totp = authenticator.generate(this.totpSecret);

    const url =
      `${this.authBaseUrl}/generateAccessToken` +
      `?dhanClientId=${encodeURIComponent(this.clientId)}` +
      `&pin=${encodeURIComponent(this.pin)}` +
      `&totp=${encodeURIComponent(totp)}`;

    const response = await axios.post(url, null, {
      timeout: 15000
    });

    const { accessToken, expiryTime } = response.data;

    if (!accessToken || !expiryTime) {
      throw new Error('Invalid Dhan generateAccessToken response');
    }

    await this.saveToken(accessToken, expiryTime, 'TOTP');

    logger.info('Dhan token generated successfully using TOTP');

    return accessToken;
  }

  async saveToken(accessToken, expiryTime, source) {
    const expiryDate = new Date(expiryTime);

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