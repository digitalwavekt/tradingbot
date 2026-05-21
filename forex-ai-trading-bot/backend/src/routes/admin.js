const express = require('express');
const router = express.Router();
const { BotConfig, Trade, RiskLog, AuditLog, BrokerAccount, SystemHealth, User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const riskEngine = require('../services/risk/RiskEngine');
const logger = require('../utils/logger');

router.get('/config', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const config = await BotConfig.findOne().sort({ updatedAt: -1 });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

router.put('/config', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const updates = req.body;
    let config = await BotConfig.findOne().sort({ updatedAt: -1 });

    if (!config) {
      config = new BotConfig({ ...updates, updatedBy: req.user._id });
    } else {
      Object.assign(config, updates, { updatedBy: req.user._id, updatedAt: new Date() });
    }

    await config.save();

    await AuditLog.create({
      action: 'CONFIG_CHANGE',
      userId: req.user._id,
      userEmail: req.user.email,
      details: { before: config.toObject(), after: updates },
      severity: 'CRITICAL',
      ipAddress: req.ip
    });

    res.json({ message: 'Configuration updated', config });
  } catch (error) {
    logger.error(`Config update error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

router.post('/mode', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { mode } = req.body;
    const validModes = ['LEARNING', 'PAPER', 'DEMO', 'HUMAN_APPROVAL', 'LIVE_AUTO'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    // Extra validation for LIVE_AUTO
    if (mode === 'LIVE_AUTO') {
      const account = await BrokerAccount.findOne({ isActive: true });
      const config = await BotConfig.findOne().sort({ updatedAt: -1 });

      if (!config?.isLiveTradingEnabled) {
        return res.status(403).json({ error: 'Live trading not enabled. Enable in config first.' });
      }

      if (!account || account.paperTradingDays < (config?.paperTradingDaysRequired || 30)) {
        return res.status(403).json({ 
          error: `Minimum ${config?.paperTradingDaysRequired || 30} days paper trading required` 
        });
      }
    }

    const config = await BotConfig.findOne().sort({ updatedAt: -1 });
    const oldMode = config.mode;
    config.mode = mode;
    config.updatedBy = req.user._id;
    await config.save();

    await AuditLog.create({
      action: 'MODE_CHANGE',
      userId: req.user._id,
      userEmail: req.user.email,
      details: { from: oldMode, to: mode },
      severity: 'CRITICAL',
      ipAddress: req.ip
    });

    logger.info(`Mode changed from ${oldMode} to ${mode} by ${req.user.email}`);
    res.json({ message: `Mode changed to ${mode}`, mode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change mode' });
  }
});

router.post('/enable-live', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { enable } = req.body;
    const config = await BotConfig.findOne().sort({ updatedAt: -1 });

    if (enable) {
      // Validate prerequisites
      const account = await BrokerAccount.findOne({ isActive: true });
      if (!account || !account.isConnected) {
        return res.status(400).json({ error: 'Broker not connected' });
      }

      if (account.paperTradingDays < config.paperTradingDaysRequired) {
        return res.status(400).json({ 
          error: `Need ${config.paperTradingDaysRequired} days paper trading. Current: ${account.paperTradingDays}` 
        });
      }

      if (account.paperTotalReturn < config.minPaperTradingProfitPercent) {
        return res.status(400).json({ 
          error: `Need ${config.minPaperTradingProfitPercent}% paper profit. Current: ${account.paperTotalReturn}%` 
        });
      }
    }

    config.isLiveTradingEnabled = enable;
    config.liveTradingApprovedBy = enable ? req.user._id : null;
    config.liveTradingApprovedAt = enable ? new Date() : null;
    await config.save();

    await AuditLog.create({
      action: enable ? 'LIVE_TRADING_ENABLED' : 'LIVE_TRADING_DISABLED',
      userId: req.user._id,
      userEmail: req.user.email,
      details: { enabled: enable },
      severity: 'CRITICAL',
      ipAddress: req.ip
    });

    res.json({ message: `Live trading ${enable ? 'enabled' : 'disabled'}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle live trading' });
  }
});

router.post('/kill-switch', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await riskEngine.triggerKillSwitch(reason || 'Manual kill switch', req.user._id);
    res.json({ message: 'Kill switch activated', ...result });
  } catch (error) {
    res.status(500).json({ error: 'Kill switch failed' });
  }
});

router.post('/reset-kill-switch', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await riskEngine.resetKillSwitch(req.user._id);
    res.json({ message: 'Kill switch reset' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset kill switch' });
  }
});

router.get('/audit-logs', authenticate, authorize(['admin', 'auditor']), async (req, res) => {
  try {
    const { page = 1, limit = 100, action, severity } = req.query;
    const query = {};
    if (action) query.action = action;
    if (severity) query.severity = severity;

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('userId', 'email name');

    const total = await AuditLog.countDocuments(query);
    res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/risk-logs', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const { level, type, page = 1, limit = 100 } = req.query;
    const query = {};
    if (level) query.level = level;
    if (type) query.type = type;

    const logs = await RiskLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await RiskLog.countDocuments(query);
    res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch risk logs' });
  }
});

router.get('/users', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;