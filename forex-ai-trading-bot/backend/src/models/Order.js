const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  broker: { type: String, enum: ['dhan', 'paper'], required: true, index: true },
  brokerOrderId: { type: String, index: true },
  correlationId: { type: String, required: true, unique: true, index: true },
  signal: { type: mongoose.Schema.Types.ObjectId, ref: 'Signal' },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  securityId: { type: String, required: true },
  exchangeSegment: { type: String, default: 'NSE_EQ' },
  transactionType: { type: String, enum: ['BUY', 'SELL'], required: true },
  productType: { type: String, enum: ['CNC', 'INTRADAY', 'MARGIN', 'MTF', 'CO', 'BO'], default: 'INTRADAY' },
  orderType: { type: String, enum: ['LIMIT', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_MARKET'], default: 'LIMIT' },
  quantity: { type: Number, required: true },
  price: { type: Number, default: 0 },
  triggerPrice: { type: Number, default: 0 },
  status: {
    type: String,
    enum: [
      'INTENT_CREATED',
      'RISK_CHECK_PASSED',
      'APPROVAL_PENDING',
      'APPROVED',
      'SENT_TO_BROKER',
      'OPEN',
      'PARTIALLY_FILLED',
      'FILLED',
      'CANCELLED',
      'EXIT_PENDING',
      'EXITED',
      'REJECTED',
      'FAILED'
    ],
    default: 'INTENT_CREATED',
    index: true
  },
  mode: { type: String, enum: ['LEARNING', 'PAPER', 'LIVE_MANUAL', 'LIVE_AUTO'], default: 'PAPER' },
  averagePrice: Number,
  filledQuantity: { type: Number, default: 0 },
  remainingQuantity: Number,
  brokerErrorCode: String,
  brokerMessage: String,
  failedReason: String,
  retryEligible: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  lastSubmittedAt: Date,
  lastReconciledAt: Date,
  stateHistory: [{
    from: String,
    to: String,
    at: Date,
    reason: String
  }],
  rawRequest: mongoose.Schema.Types.Mixed,
  rawResponse: mongoose.Schema.Types.Mixed,
  error: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
