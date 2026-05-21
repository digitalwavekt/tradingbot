const mongoose = require('mongoose');

const candleSchema = new mongoose.Schema({
  broker: { type: String, enum: ['dhan'], default: 'dhan', index: true },
  symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
  securityId: { type: String, required: true, index: true },
  exchangeSegment: { type: String, default: 'NSE_EQ', index: true },
  instrument: { type: String, default: 'EQUITY' },
  timeframe: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, index: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, default: 0 },
  openInterest: { type: Number, default: 0 }
}, { timestamps: true });

candleSchema.index({ broker: 1, securityId: 1, timeframe: 1, timestamp: 1 }, { unique: true });

module.exports = mongoose.model('Candle', candleSchema);
