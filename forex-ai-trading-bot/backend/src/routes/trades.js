const express = require('express');
const router = express.Router();
const { Trade, Signal, RiskLog } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const tradeDecisionEngine = require('../services/trading/TradeDecisionEngine');
const brokerLayer = require('../services/broker/BrokerAbstractionLayer');
const logger = require('../utils/logger');

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, pair, mode, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (pair) query.pair = pair;
    if (mode) query.mode = mode;

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Trade.countDocuments(query);

    res.json({ trades, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error(`Get trades error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

router.get('/open', authenticate, async (req, res) => {
  try {
    const trades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } })
      .sort({ createdAt: -1 });
    res.json({ trades });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch open trades' });
  }
});

router.get('/performance', authenticate, async (req, res) => {
  try {
    const closedTrades = await Trade.find({ status: 'CLOSED' });
    const winning = closedTrades.filter(t => t.monetaryPnl > 0);
    const losing = closedTrades.filter(t => t.monetaryPnl < 0);

    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);
    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (winning.length / totalTrades) * 100 : 0;
    const grossProfit = winning.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);
    const grossLoss = Math.abs(losing.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    res.json({
      totalTrades,
      winningTrades: winning.length,
      losingTrades: losing.length,
      winRate: Math.round(winRate * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      averageWin: winning.length > 0 ? Math.round((grossProfit / winning.length) * 100) / 100 : 0,
      averageLoss: losing.length > 0 ? Math.round((grossLoss / losing.length) * 100) / 100 : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

router.post('/close/:tradeId', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { reason = 'MANUAL_CLOSE' } = req.body;

    const trade = await Trade.findOne({ tradeId });
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status !== 'OPEN' && trade.status !== 'PENDING') {
      return res.status(400).json({ error: 'Trade is not open' });
    }

    const result = await brokerLayer.closeTrade(tradeId, trade.mode, reason);

    trade.status = 'CLOSED';
    trade.exitPrice = result.exitPrice;
    trade.exitTime = new Date();
    trade.exitReason = reason;
    trade.monetaryPnl = result.pnl;
    trade.closedAt = new Date();
    await trade.save();

    logger.info(`Trade ${tradeId} manually closed by ${req.user.email}`);
    res.json({ message: 'Trade closed', trade });
  } catch (error) {
    logger.error(`Close trade error: ${error.message}`);
    res.status(500).json({ error: 'Failed to close trade' });
  }
});

router.post('/close-all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { reason = 'MANUAL_CLOSE_ALL' } = req.body;
    const openTrades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } });

    const results = [];
    for (const trade of openTrades) {
      try {
        const result = await brokerLayer.closeTrade(trade.tradeId, trade.mode, reason);
        trade.status = 'CLOSED';
        trade.exitPrice = result.exitPrice;
        trade.exitTime = new Date();
        trade.exitReason = reason;
        trade.monetaryPnl = result.pnl;
        trade.closedAt = new Date();
        await trade.save();
        results.push({ tradeId: trade.tradeId, success: true });
      } catch (err) {
        results.push({ tradeId: trade.tradeId, success: false, error: err.message });
      }
    }

    logger.info(`All trades closed by ${req.user.email}`);
    res.json({ message: 'Close all trades executed', results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close all trades' });
  }
});

module.exports = router;