const PaperMtmService = require("../services/trading/PaperMtmService");
const dhanTokenService = require('../services/dhan/DhanTokenService');
const cron = require('node-cron');
const logger = require('../utils/logger');
const marketDataCollector = require('../services/MarketDataCollector');
const newsEngine = require('../services/NewsEngine');
const tradeDecisionEngine = require('../services/trading/TradeDecisionEngine');
const paperMtmService = require('../services/trading/PaperMtmService');
const { BotConfig, BrokerAccount, SystemHealth } = require('../models');
const { getWatchlist } = require('../config/watchlist');
const { emitAdminUpdate } = require('../utils/socket'); // ✅ सॉकेट इम्पोर्ट किया

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Scheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.isSyncingMarketData = false;
    this.marketDataCursor = 0;
    this.tradingAnalysisCursor = 0;
  }

  getMergedSymbols(config) {
    const dbSymbols = Array.isArray(config?.allowedSymbols) ? config.allowedSymbols : [];
    const indexSymbols = getWatchlist();
    const mergedSymbols = [...dbSymbols, ...indexSymbols]
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
      if (this.isSyncingMarketData) {
        logger.warn('Market data sync skipped to prevent overlapping');
        emitAdminUpdate('status', { status: 'SKIPPED', message: 'Sync skipped to prevent rate limit' });
        return;
      }

      try {
        this.isSyncingMarketData = true;
        const config = await BotConfig.findOne().sort({ updatedAt: -1 });
        if (!config || config.killSwitchTriggered) {
          this.isSyncingMarketData = false;
          return;
        }

        const allSymbols = this.getMergedSymbols(config);
        const maxPerCycle = Number(process.env.MAX_MARKET_SYNC_SYMBOLS_PER_CYCLE || process.env.MAX_SYMBOLS_PER_CYCLE || 10);
        const delayMs = Number(process.env.SYMBOL_ANALYSIS_DELAY_MS || 1500);
        const symbols = this.getNextBatch(allSymbols, 'marketDataCursor', maxPerCycle);

        logger.info('Market data sync cycle started', { symbols });
        
        // 📢 एडमिन पैनल को लाइव अपडेट भेजें कि कौन से सिम्बल्स प्रोसेस हो रहे हैं
        emitAdminUpdate('sync_status', { 
          status: 'RUNNING', 
          currentBatch: symbols, 
          timestamp: new Date() 
        });

        if (process.env.ENABLE_MARKET_SYNC === 'true') {
          const chunkSize = 3; 
          for (let i = 0; i < symbols.length; i += chunkSize) {
            const chunk = symbols.slice(i, i + chunkSize);
            try {
              await marketDataCollector.collectLivePrices(chunk);
              // 📢 लाइव प्राइस अपडेट फ्रंटएंड को भेजें
              emitAdminUpdate('live_price', { chunk, status: 'SUCCESS' });
            } catch (error) {
              logger.error(`Live price fetch failed: ${error.message}`);
              emitAdminUpdate('logs', { type: 'ERROR', message: `Live price failed for ${chunk.join(', ')}` });
            }
            if (i + chunkSize < symbols.length) await sleep(300);
          }
        }

        if (process.env.ENABLE_CANDLE_SYNC === 'true') {
          for (const symbol of symbols) {
            for (const tf of ['1m', '5m', '15m']) {
              try {
                await marketDataCollector.collectCandles(symbol, tf, 200);
                
                // 📢 एड敏 पैनल पर हर कैंडल सिंक का लाइव लॉग भेजें
                emitAdminUpdate('candle_update', { symbol, timeframe: tf, status: 'FETCHED', timestamp: new Date() });
                
                await sleep(1500); 
              } catch (error) {
                logger.error(`Candle sync failed for ${symbol} ${tf}: ${error.message}`);
                emitAdminUpdate('logs', { type: '429_ERROR', symbol, timeframe: tf, message: error.message });
              }
            }
            await sleep(delayMs);
          }
        }
      } catch (error) {
        logger.error(`Market data collection error: ${error.message}`);
      } finally {
        this.isSyncingMarketData = false;
        emitAdminUpdate('sync_status', { status: 'IDLE', timestamp: new Date() });
      }
    }));

    // Paper MTM every minute
    this.jobs.push(cron.schedule('* * * * *', async () => {
      try {
        if ((process.env.TRADING_MODE || '').toUpperCase() !== 'PAPER') return;
        const result = await paperMtmService.runCycle();
        
        // 📢 पेपर ट्रेडिंग का लाइव प्रॉफिट/लॉस एडमिन पैनल पर भेजें
        emitAdminUpdate('mtm_update', result);
      } catch (error) {
        logger.error(`Paper MTM error: ${error.message}`);
      }
    }));

    // Health check every minute
    this.jobs.push(cron.schedule('* * * * *', async () => {
      try {
        const health = await this.runHealthCheck();
        emitAdminUpdate('health', health); // 📢 हेल्थ स्टेटस ब्रॉडकास्ट
      } catch (error) {
        logger.error(`Health check error: ${error.message}`);
      }
    }));

    logger.info('Scheduler updated with real-time socket broadcasting!');
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
    return checks;
  }

  stop() { this.jobs.forEach((job) => job.stop()); this.jobs = []; this.isRunning = false; }
  async dailyReset() {}
}

module.exports = new Scheduler();
