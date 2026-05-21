const mongoose = require('mongoose');

const newsEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  currency: {
    type: String,
    required: true
  },
  impact: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: true
  },
  impactScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  sentiment: {
    type: String,
    enum: ['BULLISH', 'BEARISH', 'NEUTRAL'],
    default: 'NEUTRAL'
  },
  sentimentConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  scheduledTime: {
    type: Date,
    required: true,
    index: true
  },
  actual: String,
  forecast: String,
  previous: String,
  source: {
    type: String,
    enum: ['EXCHANGE_CALENDAR', 'SEBI_RBI', 'CUSTOM', 'AI_DETECTED']
  },
  category: {
    type: String,
    enum: ['CPI', 'PPI', 'GDP', 'NFP', 'UNEMPLOYMENT', 'INTEREST_RATE', 'CENTRAL_BANK', 'FOMC', 'ECB', 'BOE', 'BOJ', 'GEOPOLITICAL', 'WAR', 'SANCTIONS', 'CRISIS', 'USD_STRENGTH', 'OTHER']
  },
  isProcessed: {
    type: Boolean,
    default: false
  },
  isStale: {
    type: Boolean,
    default: false
  },
  duplicates: [String],
  aiAnalysis: {
    summary: String,
    marketImpact: String,
    affectedPairs: [String],
    recommendation: {
      type: String,
      enum: ['TRADE_CAUTIOUSLY', 'AVOID_TRADING', 'NO_IMPACT', 'OPPORTUNITY']
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

newsEventSchema.index({ scheduledTime: 1, impact: 1 });
newsEventSchema.index({ currency: 1, scheduledTime: -1 });

module.exports = mongoose.model('NewsEvent', newsEventSchema);
