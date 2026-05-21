const mongoose = require('mongoose');

const instrumentSchema = new mongoose.Schema({
  broker: { type: String, enum: ['dhan'], default: 'dhan', index: true },
  securityId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
  tradingSymbol: { type: String, uppercase: true, trim: true, index: true },
  displayName: String,
  exchangeSegment: { type: String, default: 'NSE_EQ', index: true },
  instrument: { type: String, default: 'EQUITY', index: true },
  isin: String,
  lotSize: Number,
  tickSize: Number,
  expiryDate: Date,
  strikePrice: Number,
  optionType: String,
  isActive: { type: Boolean, default: true },
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

instrumentSchema.index({ broker: 1, securityId: 1 }, { unique: true });
instrumentSchema.index({ broker: 1, symbol: 1, exchangeSegment: 1 });

module.exports = mongoose.model('Instrument', instrumentSchema);
