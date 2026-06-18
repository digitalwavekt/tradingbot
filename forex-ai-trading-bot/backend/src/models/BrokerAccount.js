const mongoose = require('mongoose');

const brokerAccountSchema = new mongoose.Schema({
  broker: {
    type: String,
    enum: ['DHAN', 'PAPER'],
    required: true,
    index: true
  },

  // For DHAN this should be DHAN_CLIENT_ID
  // For PAPER this can be "paper-default"
  accountId: {
    type: String,
    index: true
  },

  accountType: {
    type: String,
    enum: ['PAPER', 'LIVE'],
    default: 'PAPER',
    index: true
  },

  // Credentials / tokens
  // NOTE: "encrypted: true" is only metadata unless you have an encryption plugin.
  // Do not assume Mongoose encrypts this automatically.
  apiKey: {
    type: String,
    encrypted: true,
    select: false
  },

  apiSecret: {
    type: String,
    encrypted: true,
    select: false
  },

  accessToken: {
    type: String,
    encrypted: true,
    select: false
  },

  refreshToken: {
    type: String,
    encrypted: true,
    select: false
  },

  // Dhan token lifecycle
  tokenExpiry: {
    type: Date,
    index: true
  },

  authMode: {
    type: String,
    enum: ['MANUAL', 'TOTP', 'RENEW', 'API_KEY'],
    default: 'MANUAL'
  },

  lastTokenSource: {
    type: String,
    enum: ['ENV', 'MANUAL', 'TOTP', 'RENEW', 'API_KEY'],
    default: 'ENV'
  },

  lastRenewedAt: Date,
  lastTokenCheckAt: Date,

  tokenStatus: {
    type: String,
    enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'INVALID', 'UNKNOWN'],
    default: 'UNKNOWN',
    index: true
  },

  // Account Metrics
  balance: {
    type: Number,
    default: 0
  },

  equity: {
    type: Number,
    default: 0
  },

  marginUsed: {
    type: Number,
    default: 0
  },

  freeMargin: {
    type: Number,
    default: 0
  },

  marginLevel: {
    type: Number,
    default: 0
  },

  openPositions: {
    type: Number,
    default: 0
  },

  unrealizedPnl: {
    type: Number,
    default: 0
  },

  // Health
  isConnected: {
    type: Boolean,
    default: false,
    index: true
  },

  lastConnectedAt: Date,
  lastError: String,
  lastErrorAt: Date,

  healthCheckStatus: {
    type: String,
    enum: ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'DISCONNECTED'],
    default: 'DISCONNECTED',
    index: true
  },

  apiLatencyMs: Number,

  // Limits
  maxLeverage: Number,
  minLotSize: Number,
  maxLotSize: Number,
  lotStep: Number,

  // Paper Trading Balance
  paperBalance: {
    type: Number,
    default: 100000
  },

  paperEquity: {
    type: Number,
    default: 100000
  },

  paperStartDate: {
    type: Date,
    default: Date.now
  },

  paperTradingDays: {
    type: Number,
    default: 0
  },

  paperTotalReturn: {
    type: Number,
    default: 0
  },

  paperMaxDrawdown: {
    type: Number,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// One active account per broker + accountId
brokerAccountSchema.index(
  { broker: 1, accountId: 1 },
  { unique: true, sparse: true }
);

// Helper: token expiry check
brokerAccountSchema.methods.isTokenValid = function () {
  if (!this.tokenExpiry) return false;
  return new Date(this.tokenExpiry).getTime() > Date.now();
};

// Helper: token expiry soon check
brokerAccountSchema.methods.isTokenExpiringSoon = function (minutes = 90) {
  if (!this.tokenExpiry) return true;

  const expiresAt = new Date(this.tokenExpiry).getTime();
  const thresholdMs = minutes * 60 * 1000;

  return expiresAt - Date.now() <= thresholdMs;
};

// Important because accessToken has select:false
brokerAccountSchema.statics.findActiveDhanAccountWithToken = function (accountId) {
  return this.findOne({
    broker: 'DHAN',
    accountId,
    isActive: true
  }).select('+accessToken +refreshToken +apiKey +apiSecret');
};

/**
 * Applies a realized P&L from a closed PAPER trade to the active paper
 * trading account: updates paperBalance, paperEquity, and recomputes
 * paperTotalReturn relative to the original PAPER_TRADING_BALANCE.
 *
 * This MUST be called whenever a paper trade transitions to CLOSED,
 * otherwise the dashboard's "Account Balance" / "Today's P&L" / "Paper
 * Return" figures stay frozen at their initial values forever, even
 * though Trade History shows real wins/losses.
 */
brokerAccountSchema.statics.applyPaperRealizedPnl = async function (realizedPnl) {
  const pnl = Number(realizedPnl);
  if (!Number.isFinite(pnl) || pnl === 0) return null;

  const account = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (!account) return null;

  const startingBalance = Number(process.env.PAPER_TRADING_BALANCE || 100000);

  account.paperBalance = Number((Number(account.paperBalance || startingBalance) + pnl).toFixed(2));
  account.paperEquity = Number((Number(account.paperEquity || startingBalance) + pnl).toFixed(2));

  if (startingBalance > 0) {
    account.paperTotalReturn = Number(
      (((account.paperBalance - startingBalance) / startingBalance) * 100).toFixed(2)
    );
  }

  if (account.paperBalance < (account.paperLowestBalance ?? account.paperBalance)) {
    const drawdown = ((startingBalance - account.paperBalance) / startingBalance) * 100;
    account.paperMaxDrawdown = Math.max(Number(account.paperMaxDrawdown || 0), drawdown);
  }

  await account.save();
  return account;
};

module.exports = mongoose.model('BrokerAccount', brokerAccountSchema);