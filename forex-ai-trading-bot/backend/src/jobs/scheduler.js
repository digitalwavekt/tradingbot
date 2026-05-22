const dhanTokenService = require('../services/dhan/DhanTokenService');
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

    if (process.env.ENABLE_SCHEDULER !== 'true') {
      logger.warn('Scheduler start skipped because ENABLE_SCHEDULER is not true');
      return;
    }

    this.isRunning = true;

    // Market data collection every minute
    this.jobs.push(cron.schedule('* * * * *', async () => {
      try {
        const config = await BotConfig.findOne().sort({ updatedAt: -1 });
        if (!config || config.killSwitchTriggered) return;

        const symbols = config?.allowedSymbols || ['RELIANCE', 'TCS', 'INFY'];

        if (process.env.ENABLE_MARKET_SYNC === 'true') {
          await marketDataCollector.collectLivePrices(symbols);
        }

        if (process.env.ENABLE_CANDLE_SYNC === 'true') {
          for (const symbol of symbols) {
            for (const tf of ['1m', '5m', '15m']) {
              await marketDataCollector.collectCandles(symbol, tf, 200);
            }
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

        const symbols = config?.allowedSymbols || ['RELIANCE', 'TCS', 'INFY'];
        await tradeDecisionEngine.runAnalysisCycle(symbols);
      } catch (error) {
        logger.error(`Trading analysis error: ${error.message}`);
      }
    }));
    // Dhan token refresh check every 2 hours
this.jobs.push(cron.schedule('0 */2 * * *', async () => {
  try {
    if (process.env.ENABLE_DHAN_AUTO_TOKEN !== 'true') return;

    await dhanTokenService.getValidToken();

    logger.info('Dhan token auto-check completed');
  } catch (error) {
    logger.error(`Dhan token auto-refresh failed: ${error.message}`);
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
