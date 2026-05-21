const express = require('express');
const router = express.Router();
const { Signal } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const tradeDecisionEngine = require('../services/trading/TradeDecisionEngine');
const brokerLayer = require('../services/broker/BrokerAbstractionLayer');
const logger = require('../utils/logger');

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, pair, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (pair) query.pair = pair;

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Signal.countDocuments(query);
    res.json({ signals, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

router.get('/pending-approval', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const signals = await Signal.find({ status: 'PENDING' })
      .sort({ createdAt: -1 });
    res.json({ signals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending signals' });
  }
});

router.post('/analyze/:pair', authenticate, async (req, res) => {
  try {
    const { pair } = req.params;
    const decision = await tradeDecisionEngine.analyzeAndDecide(pair);
    res.json(decision);
  } catch (error) {
    logger.error(`Manual analysis error: ${error.message}`);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.post('/approve/:signalId', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const { signalId } = req.params;
    const signal = await Signal.findOne({ signalId });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    if (signal.status !== 'PENDING') return res.status(400).json({ error: 'Signal not pending' });

    signal.status = 'APPROVED';
    signal.approvedBy = req.user._id;
    signal.approvedAt = new Date();
    await signal.save();

    // Execute if approved
    if (signal.direction === 'BUY' || signal.direction === 'SELL') {
      const decision = {
        decision: signal.direction,
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'Manually approved',
        signalId: signal.signalId
      };
      await tradeDecisionEngine.executeApprovedTrade(decision);
    }

    logger.info(`Signal ${signalId} approved by ${req.user.email}`);
    res.json({ message: 'Signal approved', signal });
  } catch (error) {
    logger.error(`Approve signal error: ${error.message}`);
    res.status(500).json({ error: 'Failed to approve signal' });
  }
});

router.post('/reject/:signalId', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const { signalId } = req.params;
    const { reason } = req.body;
    const signal = await Signal.findOne({ signalId });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });

    signal.status = 'REJECTED';
    signal.rejectedBy = req.user._id;
    signal.rejectedAt = new Date();
    signal.rejectionReason = reason || 'Manually rejected';
    await signal.save();

    logger.info(`Signal ${signalId} rejected by ${req.user.email}`);
    res.json({ message: 'Signal rejected', signal });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject signal' });
  }
});

module.exports = router;