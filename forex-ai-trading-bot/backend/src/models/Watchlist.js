const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, default: 'Default' },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  securityId: { type: String, required: true },
  exchangeSegment: { type: String, default: 'NSE_EQ' },
  instrument: { type: String, default: 'EQUITY' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

watchlistSchema.index({ user: 1, symbol: 1, exchangeSegment: 1 }, { unique: true });

module.exports = mongoose.model('Watchlist', watchlistSchema);
