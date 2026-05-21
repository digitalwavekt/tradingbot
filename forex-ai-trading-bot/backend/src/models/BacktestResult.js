const mongoose = require('mongoose');

const backtestResultSchema = new mongoose.Schema({
  backtestId: {
    type: String,
    unique: true,
    required: true
  },
  strategyName: {
    type: String,
    required: true
  },
  pair: {
    type: String,
    required: true
  },
  timeframe: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },

  parameters: {
    riskPerTrade: Number,
    minRiskReward: Number,
    maxOpenTrades: Number,
    timeframes: [String],
    indicators: [String],
    newsFilter: Boolean,
    spread: Number,
    slippage: Number,
    commission: Number
  },

  results: {
    totalTrades: Number,
    winningTrades: Number,
    losingTrades: Number,
    winRate: Number,
    profitFactor: Number,
    grossProfit: Number,
    grossLoss: Number,
    netProfit: Number,
    netProfitPercent: Number,
    maxDrawdown: Number,
    maxDrawdownPercent: Number,
    sharpeRatio: Number,
    sortinoRatio: Number,
    averageRiskReward: Number,
    averageWinPips: Number,
    averageLossPips: Number,
    bestTrade: Number,
    worstTrade: Number,
    averageTrade: Number,
    maxConsecutiveWins: Number,
    maxConsecutiveLosses: Number,
    totalCommission: Number,
    totalSlippage: Number,
    totalSwap: Number,
    monthlyReturns: [{
      month: String,
      return: Number,
      trades: Number
    }],
    equityCurve: [{
      date: Date,
      equity: Number
    }],
    trades: [{
      entryTime: Date,
      exitTime: Date,
      direction: String,
      entryPrice: Number,
      exitPrice: Number,
      pnl: Number,
      pips: Number,
      riskReward: Number
    }]
  },

  validation: {
    isOverfitted: Boolean,
    sampleSizeAdequate: Boolean,
    profitFactorAcceptable: Boolean,
    drawdownAcceptable: Boolean,
    worksInMultipleConditions: Boolean,
    rejected: Boolean,
    rejectionReasons: [String]
  },

  status: {
    type: String,
    enum: ['RUNNING', 'COMPLETED', 'FAILED', 'REJECTED'],
    default: 'RUNNING'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('BacktestResult', backtestResultSchema);