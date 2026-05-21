const axios = require('axios');
const logger = require('../utils/logger');
const { CandleData, MarketData } = require('../models');
const { getTradingSession } = require('../utils/helpers');

class MarketDataCollector {
  constructor() {
    this.sources = ['DHAN'];
    this.activeSource = 'DHAN';
  }

  async initialize() {
    logger.info('Market Data Collector initialized');
  }

  async collectLivePrices(pairs) {
    const results = [];

    for (const pair of pairs) {
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
    // In production, fetch from actual broker API
    // Mock implementation for development

    const basePrices = {
      'EUR/USD': { bid: 1.0850, ask: 1.0852 },
      'GBP/USD': { bid: 1.2650, ask: 1.2653 },
      'USD/JPY': { bid: 148.50, ask: 148.52 },
      'AUD/USD': { bid: 0.6550, ask: 0.6552 },
      'USD/CHF': { bid: 0.8850, ask: 0.8853 },
      'USD/CAD': { bid: 1.3550, ask: 1.3553 },
      'NZD/USD': { bid: 0.6050, ask: 0.6052 },
      'EUR/GBP': { bid: 0.8580, ask: 0.8583 }
    };

    const base = basePrices[pair] || { bid: 1.0000, ask: 1.0002 };

    // Add small random movement
    const movement = (Math.random() - 0.5) * 0.001;

    return {
      bid: Math.round((base.bid + movement) * 100000) / 100000,
      ask: Math.round((base.ask + movement) * 100000) / 100000,
      volatility: Math.random() * 2,
      volume: Math.random() * 10000,
      latency: Math.random() * 100
    };
  }

  async collectCandles(pair, timeframe, count = 200) {
    try {
      const candles = await this.fetchCandles(pair, timeframe, count);

      // Save to database
      for (const candle of candles) {
        await CandleData.findOneAndUpdate(
          { pair, timeframe, timestamp: candle.timestamp },
          candle,
          { upsert: true, new: true }
        );
      }

      return candles;
    } catch (error) {
      logger.error(`Candle fetch error for ${pair} ${timeframe}: ${error.message}`);
      return [];
    }
  }

  async fetchCandles(pair, timeframe, count) {
    // Mock candle generation for development
    const candles = [];
    const now = new Date();

    let intervalMs;
    switch(timeframe) {
      case '1m': intervalMs = 60 * 1000; break;
      case '5m': intervalMs = 5 * 60 * 1000; break;
      case '15m': intervalMs = 15 * 60 * 1000; break;
      case '1h': intervalMs = 60 * 60 * 1000; break;
      case '4h': intervalMs = 4 * 60 * 60 * 1000; break;
      case '1D': intervalMs = 24 * 60 * 60 * 1000; break;
      default: intervalMs = 60 * 60 * 1000;
    }

    const basePrices = {
      'EUR/USD': 1.0850,
      'GBP/USD': 1.2650,
      'USD/JPY': 148.50,
      'AUD/USD': 0.6550,
      'USD/CHF': 0.8850,
      'USD/CAD': 1.3550,
      'NZD/USD': 0.6050,
      'EUR/GBP': 0.8580
    };

    let price = basePrices[pair] || 1.0;

    for (let i = count; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * intervalMs);

      // Generate realistic price movement
      const trend = Math.sin(i / 20) * 0.01;
      const noise = (Math.random() - 0.5) * 0.002;
      const change = trend + noise;

      price = price * (1 + change);

      const open = price;
      const close = price * (1 + (Math.random() - 0.5) * 0.001);
      const high = Math.max(open, close) * (1 + Math.random() * 0.0005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.0005);

      candles.push({
        pair,
        timeframe,
        timestamp,
        open: Math.round(open * 100000) / 100000,
        high: Math.round(high * 100000) / 100000,
        low: Math.round(low * 100000) / 100000,
        close: Math.round(close * 100000) / 100000,
        volume: Math.floor(Math.random() * 1000) + 100,
        tickVolume: Math.floor(Math.random() * 500) + 50,
        spread: 0.0002,
        source: this.activeSource
      });
    }

    return candles;
  }

  calculateSpreadPips(spread, pair) {
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
