const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  tradeId: {
    type: String,
    unique: true,
    required: true
  },
  signalId: {
    type: String,
    ref: 'Signal'
  },
  pair: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },

  // Entry Details
  entryPrice: {
    type: Number,
    required: true
  },
  entryTime: {
    type: Date,
    default: Date.now
  },
  entrySpread: Number,
  entrySlippage: Number,

  // Exit Details
  exitPrice: Number,
  exitTime: Date,
  exitSpread: Number,
  exitSlippage: Number,
  exitReason: {
    type: String,
    enum: ['TP_HIT', 'SL_HIT', 'TRAILING_STOP', 'MANUAL_CLOSE', 'KILL_SWITCH', 'MARGIN_CALL', 'TIME_EXPIRED', 'SYSTEM_ERROR', 'BREAKEVEN']
  },

  // Risk Parameters
  stopLoss: {
    type: Number,
    required: true
  },
  takeProfit: {
    type: Number,
    required: true
  },
  riskReward: Number,
  riskPercent: Number,
  positionSize: {
    type: Number,
    required: true
  },
  lotSize: Number,
  leverage: Number,
  marginUsed: Number,

  // P&L
  currentPrice: Number,
  unrealizedPnl: Number,
  realizedPnl: Number,
  pipsGained: Number,
  monetaryPnl: Number,
  pnlPercent: Number,
  commission: Number,
  swap: Number,

  // Status
  status: {
    type: String,
    enum: ['PENDING', 'OPEN', 'PARTIAL_CLOSE', 'CLOSED', 'CANCELLED', 'ERROR'],
    default: 'PENDING'
  },

  // Partial Closes
  partialCloses: [{
    price: Number,
    time: Date,
    size: Number,
    pnl: Number,
    reason: String
  }],

  // Trailing Stop
  trailingStopActive: {
    type: Boolean,
    default: false
  },
  trailingStopDistance: Number,
  trailingStopCurrent: Number,

  // Breakeven
  breakevenActivated: {
    type: Boolean,
    default: false
  },
  breakevenPrice: Number,

  // Broker Details
  broker: String,
  brokerOrderId: String,
  brokerTicket: String,

  mtmSource: String,
  mtmCandleTime: Date,

  // Mode
  mode: {
    type: String,
    enum: ['PAPER', 'DEMO', 'LIVE'],
    required: true
  },

  // Audit
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: Date,
  logs: [{
    timestamp: Date,
    action: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, { timestamps: true });

tradeSchema.index({ pair: 1, status: 1, createdAt: -1 });
tradeSchema.index({ status: 1, mode: 1 });
tradeSchema.index({ createdAt: -1 });
tradeSchema.index(
  { pair: 1, mode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      mode: 'PAPER',
      status: { $in: ['OPEN', 'PENDING'] }
    }
  }
);

module.exports = mongoose.model('Trade', tradeSchema);
