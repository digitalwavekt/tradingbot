const mongoose = require('mongoose');

const systemHealthSchema = new mongoose.Schema({
  component: {
    type: String,
    required: true,
    enum: ['API', 'DATABASE', 'REDIS', 'WEBSOCKET', 'BROKER', 'AI_SERVICE', 'MARKET_DATA', 'NEWS_FEED', 'RISK_ENGINE', 'TRADE_EXECUTOR', 'BACKTEST_ENGINE']
  },
  status: {
    type: String,
    enum: ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'DOWN'],
    default: 'HEALTHY'
  },
  latencyMs: Number,
  errorRate: Number,
  lastCheck: {
    type: Date,
    default: Date.now
  },
  lastError: String,
  lastErrorAt: Date,
  uptime: Number,
  memoryUsage: Number,
  cpuUsage: Number,

  details: mongoose.Schema.Types.Mixed,

  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

systemHealthSchema.index({ component: 1, createdAt: -1 });

module.exports = mongoose.model('SystemHealth', systemHealthSchema);