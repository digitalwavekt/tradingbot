const PaperMtmService = require("../services/trading/PaperMtmService");
const dhanTokenService = require('../services/dhan/DhanTokenService');
const cron = require('node-cron');
const logger = require('../utils/logger');
const marketDataCollector = require('../services/MarketDataCollector');
const newsEngine = require('../services/NewsEngine');
const tradeDecisionEngine = require('../services/trading/TradeDecisionEngine');
const { BotConfig, BrokerAccount, SystemHealth } = require('../models');
const { getWatchlist } = require('../config/watchlist');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Scheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.marketDataCursor = 0;
    this.tradingAnalysisCursor = 0;
  }

  getMergedSymbols(config) {
    const dbSymbols = Array.isArray(config?.allowedSymbols)
      ? config.allowedSymbols
      : [];

    const indexSymbols = getWatchlist();

    const mergedSymbols = [
      ...dbSymbols,
      ...indexSymbols
    ]
      .filter(Boolean)
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter(Boolean);

    const uniqueSymbols = [...new Set(mergedSymbols)];

    if (uniqueSymbols.length) return uniqueSymbols;

    return ['RELIANCE', 'TCS', 'INFY'];
  }

  getNextBatch(symbols, cursorName, maxPerCycle) {
    if (!Array.isArray(symbols) || symbols.length === 0) return [];

    const safeMaxPerCycle = Math.max(1, Math.min(Number(maxPerCycle || 10), symbols.length));
    const batch = [];

    for (let i = 0; i < safeMaxPerCycle; i += 1) {
      batch.push(symbols[this[cursorName]]);
      this[cursorName] = (this[cursorName] + 1) % symbols.length;
    }

    return [...new Set(batch)];
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

        const allSymbols = this.getMergedSymbols(config);
        const maxPerCycle = Number(process.env.MAX_MARKET_SYNC_SYMBOLS_PER_CYCLE || process.env.MAX_SYMBOLS_PER_CYCLE || 15);
        const delayMs = Number(process.env.SYMBOL_ANALYSIS_DELAY_MS || 1500);
        const symbols = this.getNextBatch(allSymbols, 'marketDataCursor', maxPerCycle);

        logger.info('Market data sync cycle started', {
          totalSymbols: allSymbols.length,
          selectedThisCycle: symbols.length,
          symbols
        });

        if (process.env.ENABLE_MARKET_SYNC === 'true') {
          await marketDataCollector.collectLivePrices(symbols);
        }

        if (process.env.ENABLE_CANDLE_SYNC === 'true') {
          for (const symbol of symbols) {
            for (const tf of ['1m', '5m', '15m']) {
              try {
                await marketDataCollector.collectCandles(symbol, tf, 200);
              } catch (error) {
                logger.error(`Candle sync failed for ${symbol} ${tf}: ${error.message}`);
              }
            }

            await sleep(delayMs);
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
        if (!config || config.killSwitchTriggered) return;

        const allowLearningAnalysis = process.env.ENABLE_LEARNING_ANALYSIS !== 'false';

        if (config.mode === 'LEARNING' && !allowLearningAnalysis) {
          logger.info('Trading analysis skipped because bot is in LEARNING mode and ENABLE_LEARNING_ANALYSIS=false');
          return;
        }

        const allSymbols = this.getMergedSymbols(config);
        const maxPerCycle = Number(process.env.MAX_ANALYSIS_SYMBOLS_PER_CYCLE || process.env.MAX_SYMBOLS_PER_CYCLE || 15);
        const symbols = this.getNextBatch(allSymbols, 'tradingAnalysisCursor', maxPerCycle);

        logger.info('Trading analysis cycle started', {
          mode: config.mode,
          totalSymbols: allSymbols.length,
          selectedThisCycle: symbols.length,
          symbols
        });

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


  setInterval(async () => {
    try {
      await PaperMtmService.runOnce();
    } catch (error) {
      logger.error("Paper MTM scheduler failed", {
        message: error.message,
        stack: error.stack
      });
    }
  }, 60 * 1000);

  logger.info("Paper MTM scheduler started", { intervalMs: 60000 });

    logger.info('Scheduler started with all jobs');
  }

  stop() {
    this.jobs.forEach((job) => job.stop());
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

    const accounts = await BrokerAccount.find({ isActive: true });

    for (const account of accounts) {
      account.paperTradingDays += 1;
      await account.save();
    }
  }
}

module.exports = new Scheduler();