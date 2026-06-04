const logger = require('../utils/logger');
const { CandleData, MarketData } = require('../models');
const { getTradingSession } = require('../utils/helpers');

let dhanHistoricalDataService = null;

function getDhanHistoricalDataService() {
  if (!dhanHistoricalDataService) {
    const ExportedService = require('./dhan/DhanHistoricalDataService');
    dhanHistoricalDataService = typeof ExportedService === 'function'
      ? new ExportedService()
      : ExportedService;
  }

  return dhanHistoricalDataService;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDateRangeForTimeframe(timeframe, count = 200) {
  const now = new Date();
  const toDate = formatDate(now);
  const from = new Date(now);

  const tf = String(timeframe || '').toLowerCase();

  if (tf === '1d' || tf === 'day' || tf === 'daily') {
    const days = Math.max(Number(count || 200) + 20, 90);
    from.setDate(from.getDate() - days);
    return { fromDate: formatDate(from), toDate };
  }

  // Dhan intraday gives recent intraday candles. Keep range small and safe.
  // For 1m/5m/15m/60m, last 5 trading days are enough for paper analysis.
  from.setDate(from.getDate() - 7);
  return { fromDate: formatDate(from), toDate };
}

function normalizeTimestamp(value) {
  if (!value) return null;

  if (typeof value === 'number') {
    return new Date(value < 1000000000000 ? value * 1000 : value);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCandle(raw, pair, timeframe) {
  if (!raw) return null;

  const timestamp = normalizeTimestamp(raw.timestamp || raw.time || raw.date || raw.datetime);
  const open = toNumber(raw.open);
  const high = toNumber(raw.high);
  const low = toNumber(raw.low);
  const close = toNumber(raw.close);
  const volume = toNumber(raw.volume || raw.vol || 0);

  if (!timestamp || open == null || high == null || low == null || close == null) {
    return null;
  }

  return {
    pair,
    timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume: volume || 0,
    tickVolume: volume || 0,
    spread: 0,
    source: 'DHAN'
  };
}

function isIndianEquitySymbol(pair) {
  return !String(pair || '').includes('/') && !String(pair || '').includes(':');
}

function isBadIndianEquityCandle(pair, candle) {
  return isIndianEquitySymbol(pair) && candle && Number(candle.close) > 0 && Number(candle.close) < 20;
}

function normalizeTimeframeForDhan(timeframe) {
  const tf = String(timeframe || '').trim().toLowerCase();

  if (tf === '1d' || tf === 'day' || tf === 'daily') return '1D';
  if (tf === '1h' || tf === '60m' || tf === '60') return '60m';
  if (['1m', '5m', '15m', '25m'].includes(tf)) return tf;

  if (tf === '4h') {
    throw new Error('Dhan does not provide native 4h candles. Use 1h and resample later, or remove 4h from required timeframes.');
  }

  return timeframe;
}

class MarketDataCollector {
  constructor() {
    this.sources = ['DHAN'];
    this.activeSource = 'DHAN';
  }

  async initialize() {
    logger.info('Market Data Collector initialized');
  }

  async collectLivePrices(pairs = []) {
    const results = [];
    const uniquePairs = [...new Set((pairs || []).filter(Boolean))];

    for (const pair of uniquePairs) {
      try {
        const data = await this.fetchPrice(pair);

        const marketData = await MarketData.create({
          pair,
          bid: data.bid,
          ask: data.ask,
          spread: data.ask - data.bid,
          spreadPips: this.calculateSpreadPips(data.ask - data.bid, pair),
          timestamp: new Date(),
          session: getTradingSession(),
          volatility: data.volatility || 0,
          volatilityRegime: this.classifyVolatility(data.volatility || 0),
          liquidity: this.classifyLiquidity(data.volume || 0),
          source: this.activeSource,
          latencyMs: data.latency || 0
        });

        results.push(marketData);
      } catch (error) {
        logger.error(`Price fetch error for ${pair}: ${error.message}`);
      }
    }

    return results;
  }

  async fetchPrice(pair) {
    const latest = await MarketData.findOne({ pair }).sort({ timestamp: -1 }).lean();

    if (latest && Number.isFinite(Number(latest.bid)) && Number.isFinite(Number(latest.ask))) {
      return {
        bid: Number(latest.bid),
        ask: Number(latest.ask),
        volatility: Number(latest.volatility || 0),
        volume: Number(latest.volume || 0),
        latency: Number(latest.latencyMs || 0)
      };
    }

    throw new Error(`No real live price available for ${pair}. Enable Dhan quote sync before PAPER execution.`);
  }

  async collectCandles(pair, timeframe, count = 200) {
    try {
      const candles = await this.fetchCandles(pair, timeframe, count);

      let saved = 0;
      let skipped = 0;

      for (const candle of candles) {
        if (!candle || isBadIndianEquityCandle(pair, candle)) {
          skipped += 1;
          logger.warn(`Skipping invalid/synthetic candle for ${pair} ${timeframe}`, {
            close: candle?.close,
            timestamp: candle?.timestamp
          });
          continue;
        }

        await CandleData.findOneAndUpdate(
          { pair, timeframe: candle.timeframe, timestamp: candle.timestamp },
          candle,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        saved += 1;
      }

      logger.info(`Collected candles for ${pair} ${timeframe}`, {
        requested: count,
        fetched: candles.length,
        saved,
        skipped
      });

      return candles;
    } catch (error) {
      logger.error(`Candle fetch error for ${pair} ${timeframe}: ${error.message}`);
      return [];
    }
  }

  async fetchCandles(pair, timeframe, count = 200) {
    if (process.env.ENABLE_DHAN_HISTORICAL_SYNC !== 'true') {
      throw new Error(`Real Dhan historical sync disabled for ${pair} ${timeframe}. Set ENABLE_DHAN_HISTORICAL_SYNC=true`);
    }

    const dhanTimeframe = normalizeTimeframeForDhan(timeframe);
    const { fromDate, toDate } = getDateRangeForTimeframe(dhanTimeframe, count);

    const service = getDhanHistoricalDataService();

    if (typeof service.fetchOHLC !== 'function') {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service))
        .concat(Object.keys(service))
        .filter((key, index, arr) => typeof service[key] === 'function' && arr.indexOf(key) === index);

      throw new Error(`DhanHistoricalDataService.fetchOHLC not found. Available methods: ${methods.join(', ')}`);
    }

    const rawCandles = await service.fetchOHLC(pair, dhanTimeframe, {
      count,
      fromDate,
      toDate
    });

    if (!Array.isArray(rawCandles)) {
      throw new Error(`DhanHistoricalDataService returned non-array candles for ${pair} ${timeframe}`);
    }

    const normalized = rawCandles
      .map(candle => normalizeCandle(candle, pair, timeframe))
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-Number(count || 200));

    if (!normalized.length) {
      throw new Error(`No real Dhan candles returned for ${pair} ${timeframe}`);
    }

    const bad = normalized.find(candle => isBadIndianEquityCandle(pair, candle));
    if (bad) {
      throw new Error(`Dhan returned suspicious Indian equity candle for ${pair}: close=${bad.close}`);
    }

    return normalized;
  }

  calculateSpreadPips(spread, pair) {
    if (isIndianEquitySymbol(pair)) {
      return Math.round(Number(spread || 0) * 100) / 100;
    }

    const multiplier = pair.includes('JPY') ? 100 : 10000;
    return Math.round(spread * multiplier * 10) / 10;
  }

  classifyVolatility(volatility) {
    if (volatility > 2) return 'EXTREME';
    if (volatility > 1) return 'HIGH';
    if (volatility < 0.3) return 'LOW';
    return 'NORMAL';
  }

  classifyLiquidity(volume) {
    if (volume > 8000) return 'HIGH';
    if (volume < 2000) return 'LOW';
    return 'NORMAL';
  }

  async getHistoricalData(pair, timeframe, startDate, endDate) {
    return await CandleData.find({
      pair,
      timeframe,
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: 1 });
  }
}

module.exports = new MarketDataCollector();
