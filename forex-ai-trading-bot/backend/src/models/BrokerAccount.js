const mongoose = require('mongoose');

const brokerAccountSchema = new mongoose.Schema({
  broker: {
    type: String,
    enum: ['DHAN', 'PAPER'],
    required: true
  },
  accountId: String,
  accountType: {
    type: String,
    enum: ['PAPER', 'LIVE'],
    default: 'PAPER'
  },

  // Credentials (encrypted)
  apiKey: {
    type: String,
    encrypted: true
  },
  apiSecret: {
    type: String,
    encrypted: true
  },
  accessToken: {
    type: String,
    encrypted: true
  },
  refreshToken: {
    type: String,
    encrypted: true
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
    default: false
  },
  lastConnectedAt: Date,
  lastError: String,
  lastErrorAt: Date,
  healthCheckStatus: {
    type: String,
    enum: ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'DISCONNECTED'],
    default: 'DISCONNECTED'
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
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('BrokerAccount', brokerAccountSchema);
