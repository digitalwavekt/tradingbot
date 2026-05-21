const mongoose = require('mongoose');

const riskLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['TRADE_CHECK', 'DAILY_LIMIT', 'WEEKLY_LIMIT', 'MONTHLY_LIMIT', 'DRAWDOWN', 'MARGIN', 'VOLATILITY', 'SPREAD', 'SLIPPAGE', 'NEWS', 'API_LATENCY', 'BROKER_HEALTH', 'POSITION_SIZE', 'CORRELATION', 'KILL_SWITCH'],
    required: true
  },
  level: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL', 'BLOCKED'],
    required: true
  },
  pair: String,
  tradeId: String,
  signalId: String,

  details: {
    checkName: String,
    value: mongoose.Schema.Types.Mixed,
    threshold: mongoose.Schema.Types.Mixed,
    passed: Boolean,
    message: String
  },

  accountSnapshot: {
    balance: Number,
    equity: Number,
    marginUsed: Number,
    freeMargin: Number,
    marginLevel: Number,
    openTrades: Number,
    dailyPnl: Number,
    weeklyPnl: Number,
    monthlyPnl: Number,
    totalDrawdown: Number,
    maxDrawdown: Number
  },

  actionTaken: String,
  requiresApproval: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

riskLogSchema.index({ type: 1, level: 1, createdAt: -1 });
riskLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RiskLog', riskLogSchema);