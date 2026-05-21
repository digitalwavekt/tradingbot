const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  signalId: {
    type: String,
    unique: true,
    required: true
  },
  pair: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['BUY', 'SELL', 'WAIT', 'NO_TRADE'],
    required: true
  },
  entryPrice: Number,
  stopLoss: Number,
  takeProfit: Number,
  riskReward: Number,
  riskPercent: Number,
  positionSize: Number,
  confidence: {
    type: Number,
    min: 0,
    max: 100
  },

  // Analysis Results
  technicalAnalysis: {
    trend: String,
    structure: String,
    ema20: Number,
    ema50: Number,
    ema200: Number,
    rsi: Number,
    macd: Number,
    macdSignal: Number,
    atr: Number,
    bollingerUpper: Number,
    bollingerLower: Number,
    supportLevels: [Number],
    resistanceLevels: [Number],
    fibLevels: {
      '0': Number,
      '23.6': Number,
      '38.2': Number,
      '50': Number,
      '61.8': Number,
      '78.6': Number,
      '100': Number
    },
    isBreakout: Boolean,
    isFakeBreakout: Boolean,
    momentum: String,
    volatilityRegime: String,
    liquidityZone: String,
    smcOrderBlocks: [Object],
    smcFVGs: [Object],
    smcLiquiditySweep: Boolean,
    smcBOS: Boolean,
    smcCHoCH: Boolean
  },

  fundamentalAnalysis: {
    interestRateDirection: String,
    inflationTrend: String,
    employmentStrength: String,
    gdpGrowth: String,
    centralBankTone: String,
    currencyStrengthMatrix: Object,
    usdIndexCorrelation: Number,
    goldCorrelation: Number,
    riskSentiment: String
  },

  newsAnalysis: {
    upcomingEvents: [Object],
    recentEvents: [Object],
    newsImpactScore: Number,
    newsSafe: Boolean,
    newsWarnings: [String]
  },

  aiAnalysis: {
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
    }
  },

  // Risk Check Results
  riskCheck: {
    passed: Boolean,
    checks: [{
      name: String,
      passed: Boolean,
      value: mongoose.Schema.Types.Mixed,
      threshold: mongoose.Schema.Types.Mixed,
      message: String
    }],
    rejectionReasons: [String]
  },

  // Multi-timeframe alignment
  timeframeAlignment: {
    '1m': String,
    '5m': String,
    '15m': String,
    '1h': String,
    '4h': String,
    '1D': String,
    aligned: Boolean
  },

  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING'
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: Date
}, { timestamps: true });

signalSchema.index({ pair: 1, status: 1, createdAt: -1 });
signalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Signal', signalSchema);