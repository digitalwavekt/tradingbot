const mongoose = require('mongoose');

const candleSchema = new mongoose.Schema({
  pair: {
    type: String,
    required: true,
    index: true
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'],
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  open: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    default: 0
  },
  tickVolume: {
    type: Number,
    default: 0
  },
  spread: {
    type: Number,
    default: 0
  },
  source: {
    type: String,
    enum: ['DHAN', 'BACKTEST'],
    default: 'DHAN'
  }
}, { timestamps: true });

candleSchema.index({ pair: 1, timeframe: 1, timestamp: -1 }, { unique: true });
candleSchema.index({ pair: 1, timeframe: 1, timestamp: 1 });

module.exports = mongoose.model('CandleData', candleSchema);
