const express = require('express');
const router = express.Router();
const { Trade, Signal, BotConfig, BrokerAccount, MarketData, NewsEvent, RiskLog, SystemHealth } = require('../models');
const { authenticate } = require('../middleware/auth');

router.get('/overview', authenticate, async (req, res) => {
  try {
    const config = await BotConfig.findOne().sort({ updatedAt: -1 });
    const account = await BrokerAccount.findOne({ isActive: true });

    const openTrades = await Trade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await Trade.find({ createdAt: { $gte: today } });
    const todayPnl = todayTrades.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);

    const totalSignals = await Signal.countDocuments();
    const pendingSignals = await Signal.countDocuments({ status: 'PENDING' });

    const recentNews = await NewsEvent.find({ isStale: false })
      .sort({ scheduledTime: 1 })
      .limit(5);

    const health = await SystemHealth.find().sort({ createdAt: -1 }).limit(10);

    res.json({
      botMode: config?.mode || 'LEARNING',
      currentMode: config?.mode || 'LEARNING',
      killSwitchActive: config?.killSwitchTriggered || false,
      killSwitchReason: config?.killSwitchReason || null,
      isLiveEnabled: config?.isLiveTradingEnabled || false,
      account: {
        balance: config?.mode === 'PAPER' ? account?.paperBalance : account?.balance,
        equity: config?.mode === 'PAPER' ? account?.paperEquity : account?.equity,
        marginUsed: account?.marginUsed || 0,
        openPositions: openTrades,
        paperTradingDays: account?.paperTradingDays || 0,
        paperTotalReturn: account?.paperTotalReturn || 0
      },
      today: {
        trades: todayTrades.length,
        pnl: Math.round(todayPnl * 100) / 100
      },
      signals: {
        total: totalSignals,
        pending: pendingSignals
      },
      recentNews,
      systemHealth: health
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

router.get('/market-overview', authenticate, async (req, res) => {
  try {
    const config = await BotConfig.findOne().sort({ updatedAt: -1 });
    const symbols = config?.allowedSymbols || ['RELIANCE', 'TCS', 'INFY', 'NIFTY', 'BANKNIFTY'];
    const marketData = [];

    for (const symbol of symbols) {
      const latest = await MarketData.findOne({
        $or: [{ symbol }, { pair: symbol }]
      }).sort({ timestamp: -1 });
      if (latest) marketData.push(latest);
    }

    res.json({ marketData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch market overview' });
  }
});

router.get('/performance-chart', authenticate, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trades = await Trade.find({
      status: 'CLOSED',
      closedAt: { $gte: startDate }
    }).sort({ closedAt: 1 });

    const dailyData = {};
    for (const trade of trades) {
      const date = trade.closedAt.toISOString().split('T')[0];
      if (!dailyData[date]) dailyData[date] = { date, pnl: 0, trades: 0 };
      dailyData[date].pnl += trade.monetaryPnl || 0;
      dailyData[date].trades += 1;
    }

    res.json({ data: Object.values(dailyData) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch performance chart' });
  }
});

module.exports = router;
