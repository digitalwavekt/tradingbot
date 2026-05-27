const mongoose = require('mongoose');

const botConfigSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['LEARNING', 'PAPER', 'LIVE_MANUAL', 'LIVE_AUTO'],
    default: 'LEARNING'
  },

  isLiveTradingEnabled: {
    type: Boolean,
    default: false
  },

  liveTradingApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  liveTradingApprovedAt: Date,

  paperTradingDaysRequired: {
    type: Number,
    default: 30
  },

  minPaperTradingProfitPercent: {
    type: Number,
    default: 2.0
  },

  riskPerTradePercent: {
    type: Number,
    default: 0.5,
    min: 0.1,
    max: 1.0
  },

  maxRiskPerTradePercent: {
    type: Number,
    default: 1.0,
    min: 0.1,
    max: 2.0
  },

  dailyMaxLossPercent: {
    type: Number,
    default: 2.0,
    min: 0.5,
    max: 5.0
  },

  weeklyMaxLossPercent: {
    type: Number,
    default: 5.0,
    min: 1.0,
    max: 10.0
  },

  monthlyMaxLossPercent: {
    type: Number,
    default: 10.0,
    min: 2.0,
    max: 20.0
  },

  maxOpenTrades: {
    type: Number,
    default: 3,
    min: 1,
    max: 10
  },

  maxCorrelatedTrades: {
    type: Number,
    default: 2,
    min: 1,
    max: 5
  },

  minRiskReward: {
    type: Number,
    default: 2.0,
    min: 1.0,
    max: 5.0
  },

  maxDrawdownPercent: {
    type: Number,
    default: 10.0,
    min: 5.0,
    max: 25.0
  },

  maxMarginUsagePercent: {
    type: Number,
    default: 50.0,
    min: 10.0,
    max: 80.0
  },

  allowedSymbols: {
    type: [String],
    default: ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY']
  },

  allowedSegments: {
    type: [String],
    default: ['NSE_EQ', 'BSE_EQ', 'NSE_FNO']
  },

  maxCapitalPerTradePercent: {
    type: Number,
    default: 10,
    min: 1,
    max: 25
  },

  newsImpactThreshold: {
    type: Number,
    default: 70,
    min: 0,
    max: 100
  },

  newsBufferMinutesBefore: {
    type: Number,
    default: 30,
    min: 5,
    max: 120
  },

  newsBufferMinutesAfter: {
    type: Number,
    default: 60,
    min: 15,
    max: 240
  },

  timeframes: {
    type: [String],
    default: ['1m', '5m', '15m', '1h', '4h', '1D']
  },

  minConfidenceScore: {
    type: Number,
    default: 65,
    min: 0,
    max: 100
  },

  killSwitchEnabled: {
    type: Boolean,
    default: true
  },

  killSwitchTriggered: {
    type: Boolean,
    default: false
  },

  killSwitchReason: String,

  killSwitchTriggeredAt: Date,

  killSwitchTriggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  activeBroker: {
    type: String,
    enum: ['DHAN', 'PAPER'],
    default: 'PAPER'
  },

  brokerApiKey: {
    type: String,
    encrypted: true
  },

  brokerApiSecret: {
    type: String,
    encrypted: true
  },

  brokerAccountId: String,

  brokerEnvironment: {
    type: String,
    enum: ['practice', 'live'],
    default: 'practice'
  },

  aiProvider: {
    type: String,
    enum: ['openai', 'gemini'],
    default: 'gemini'
  },

  openaiModel: {
    type: String,
    default: 'gpt-4o-mini'
  },

  geminiModel: {
    type: String,
    default: 'gemini-2.0-flash'
  },

  aiEnabled: {
    type: Boolean,
    default: true
  },

  aiMaxTokens: {
    type: Number,
    default: 2000
  },

  aiTemperature: {
    type: Number,
    default: 0.1,
    min: 0,
    max: 1
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('BotConfig', botConfigSchema);