const mongoose = require('mongoose');

const riskDecisionSchema = new mongoose.Schema({
  signal: { type: mongoose.Schema.Types.ObjectId, ref: 'Signal', index: true },
  symbol: { type: String, uppercase: true, trim: true, index: true },
  mode: { type: String, enum: ['LEARNING', 'PAPER', 'HUMAN_APPROVAL', 'LIVE_AUTO'], default: 'PAPER' },
  approved: { type: Boolean, required: true },
  requiresHumanApproval: { type: Boolean, default: false },
  rules: [{
    name: String,
    passed: Boolean,
    severity: { type: String, enum: ['INFO', 'WARNING', 'BLOCKER'], default: 'INFO' },
    message: String,
    context: mongoose.Schema.Types.Mixed
  }],
  positionSize: Number,
  maxRiskAmount: Number,
  riskReward: Number
}, { timestamps: true });

module.exports = mongoose.model('RiskDecision', riskDecisionSchema);
