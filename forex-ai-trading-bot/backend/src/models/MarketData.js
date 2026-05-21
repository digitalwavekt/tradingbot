const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  pair: {
    type: String,
    index: true
  },
  symbol: { type: String, uppercase: true, trim: true, index: true },
  securityId: String,
  exchangeSegment: { type: String, default: 'NSE_EQ' },
  price: Number,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  bid: {
    type: Number
  },
  ask: {
    type: Number
  },
  spread: {
    type: Number,
    default: 0
  },
  spreadPips: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  session: {
    type: String,
    enum: ['NSE', 'BSE', 'MCX', 'OFF_HOURS', 'TOKYO', 'LONDON', 'NEW_YORK', 'OVERLAP']
  },
  volatility: {
    type: Number,
    default: 0
  },
  volatilityRegime: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'EXTREME']
  },
  liquidity: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH']
  },
  source: String,
  latencyMs: Number
}, { timestamps: true });

marketDataSchema.index({ pair: 1, timestamp: -1 });
marketDataSchema.index({ symbol: 1, timestamp: -1 });

module.exports = mongoose.model('MarketData', marketDataSchema);
