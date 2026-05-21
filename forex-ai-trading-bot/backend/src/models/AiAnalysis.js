const mongoose = require('mongoose');

const aiAnalysisSchema = new mongoose.Schema({
  analysisId: {
    type: String,
    unique: true,
    required: true
  },
  type: {
    type: String,
    enum: ['MARKET_SUMMARY', 'TECHNICAL', 'FUNDAMENTAL', 'NEWS', 'TRADE_THESIS', 'RISK_ASSESSMENT', 'FULL_ANALYSIS'],
    required: true
  },
  pair: String,

  prompt: String,
  rawResponse: String,

  parsedResult: {
    marketSummary: String,
    technicalExplanation: String,
    fundamentalExplanation: String,
    newsImpactExplanation: String,
    tradeThesis: String,
    reasonToEnter: String,
    reasonToAvoid: String,
    confidencePercentage: Number,
    riskWarning: String,
    finalRecommendation: {
      type: String,
      enum: ['BUY', 'SELL', 'WAIT', 'NO_TRADE']
    },
    sentiment: {
      type: String,
      enum: ['BULLISH', 'BEARISH', 'NEUTRAL']
    },
    keyLevels: [Number],
    riskFactors: [String],
    opportunityFactors: [String]
  },

  tokensUsed: Number,
  costUsd: Number,
  latencyMs: Number,
  model: String,

  validated: {
    type: Boolean,
    default: false
  },
  validationErrors: [String],

  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('AiAnalysis', aiAnalysisSchema);