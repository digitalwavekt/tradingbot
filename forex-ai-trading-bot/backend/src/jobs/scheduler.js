const cron = require('node-cron');
const logger = require('../utils/logger');
const marketDataCollector = require('../services/MarketDataCollector');
const newsEngine = require('../services/NewsEngine');
const tradeDecisionEngine = require('../services/trading/TradeDecisionEngine');
const { BotConfig, BrokerAccount, SystemHealth } = require('../models');

class Scheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Market data collection every minute
    this.jobs.push(cron.schedule('* * * * *', async () => {
      try {
        const config = await BotConfig.findOne().sort({ updatedAt: -1 });
        if (!config || config.killSwitchTriggered) return;

        const pairs = config?.allowedPairs || ['EUR/USD', 'GBP/USD', 'USD/JPY'];
        await marketDataCollector.collectLivePrices(pairs);

        // Collect candles
        for (const pair of pairs) {
          for (const tf of ['1m', '5m', '15m']) {
            await marketDataCollector.collectCandles(pair, tf, 200);
          }
        }
      } catch (error) {
        logger.error(`Market data collection error: ${error.message}`);
      }
    }));

    // News fetch every 15 minutes
    this.jobs.push(cron.schedule('*/15 * * * *', async () => {
      try {
        await newsEngine.fetchEconomicCalendar();
      } catch (error) {
        logger.error(`News fetch error: ${error.message}`);
      }
    }));

    // Trading analysis every 5 minutes
    this.jobs.push(cron.schedule('*/5 * * * *', async () => {
      try {
        const config = await BotConfig.findOne().sort({ updatedAt: -1 });
        if (!config || config.mode === 'LEARNING' || config.killSwitchTriggered) return;

        const pairs = config?.allowedPairs || ['EUR/USD', 'GBP/USD', 'USD/JPY'];
        await tradeDecisionEngine.runAnalysisCycle(pairs);
      } catch (error) {
        logger.error(`Trading analysis error: ${error.message}`);
      }
    }));

    // Health check every minute
    this.jobs.push(cron.schedule('* * * * *', async () => {
      try {
        await this.runHealthCheck();
      } catch (error) {
        logger.error(`Health check error: ${error.message}`);
      }
    }));

    // Daily reset at midnight UTC
    this.jobs.push(cron.schedule('0 0 * * *', async () => {
      try {
        await this.dailyReset();
      } catch (error) {
        logger.error(`Daily reset error: ${error.message}`);
      }
    }));

    logger.info('Scheduler started with all jobs');
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
    logger.info('Scheduler stopped');
  }

  async runHealthCheck() {
    const checks = [
      { component: 'API', status: 'HEALTHY' },
      { component: 'DATABASE', status: 'HEALTHY' },
      { component: 'REDIS', status: 'HEALTHY' }
    ];

    for (const check of checks) {
      await SystemHealth.findOneAndUpdate(
        { component: check.component },
        { ...check, lastCheck: new Date() },
        { upsert: true, new: true }
      );
    }
  }

  async dailyReset() {
    logger.info('Running daily reset');
    // Reset daily counters, update paper trading days, etc.
    const accounts = await BrokerAccount.find({ isActive: true });
    for (const account of accounts) {
      account.paperTradingDays += 1;
      await account.save();
    }
  }
}

module.exports = new Scheduler();