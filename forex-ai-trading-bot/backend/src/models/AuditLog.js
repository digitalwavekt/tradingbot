const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['LOGIN', 'LOGOUT', 'CONFIG_CHANGE', 'TRADE_EXECUTE', 'TRADE_CLOSE', 'TRADE_MODIFY', 'KILL_SWITCH', 'MODE_CHANGE', 'LIVE_TRADING_ENABLED', 'LIVE_TRADING_DISABLED', 'APPROVE_TRADE', 'REJECT_TRADE', 'BROKER_CONNECT', 'BROKER_DISCONNECT', 'BROKER_REQUEST', 'BROKER_RESPONSE', 'INSTRUMENT_SYNC', 'MARKET_DATA_SYNC', 'ORDER_PLACE', 'ORDER_MODIFY', 'ORDER_CANCEL', 'AI_ANALYSIS', 'RISK_CHECK', 'SIGNAL_CREATE', 'BACKTEST_RUN', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'API_KEY_UPDATE', 'SYSTEM_START', 'SYSTEM_STOP', 'ERROR']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userEmail: String,
  userRole: String,
  ipAddress: String,
  userAgent: String,

  details: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    reason: String,
    tradeId: String,
    signalId: String,
    pair: String,
    symbol: String,
    broker: String,
    requestId: String,
    statusCode: Number,
    amount: Number,
    mode: String
  },

  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    default: 'INFO'
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
