const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  pair: {
    type: String,
    required: true,
    index: true
  },
  bid: {
    type: Number,
    required: true
  },
  ask: {
    type: Number,
    required: true
  },
  spread: {
    type: Number,
    required: true
  },
  spreadPips: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  session: {
    type: String,
    enum: ['TOKYO', 'LONDON', 'NEW_YORK', 'OVERLAP', 'OFF_HOURS']
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

module.exports = mongoose.model('MarketData', marketDataSchema);