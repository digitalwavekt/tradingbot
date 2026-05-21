const logger = require('../../utils/logger');
const { CandleData } = require('../../models');

class TechnicalAnalysisEngine {
  constructor() {
    this.indicators = {};
  }

  async analyze(pair, timeframes = ['1m', '5m', '15m', '1h', '4h', '1D']) {
    try {
      const results = {};

      for (const tf of timeframes) {
        const candles = await this.getCandles(pair, tf, 200);
        if (candles.length < 50) {
          logger.warn(`Insufficient candles for ${pair} ${tf}: ${candles.length}`);
          continue;
        }

        results[tf] = {
          ema: this.calculateEMAs(candles),
          rsi: this.calculateRSI(candles),
          macd: this.calculateMACD(candles),
          atr: this.calculateATR(candles),
          bollinger: this.calculateBollingerBands(candles),
          structure: this.analyzeMarketStructure(candles),
          supportResistance: this.findSupportResistance(candles),
          fibonacci: this.calculateFibonacci(candles),
          trend: this.determineTrend(candles),
          momentum: this.calculateMomentum(candles),
          volatility: this.calculateVolatility(candles),
          liquidity: this.findLiquidityZones(candles),
          smc: this.analyzeSMC(candles)
        };
      }

      // Multi-timeframe alignment
      const alignment = this.checkTimeframeAlignment(results);

      return {
        pair,
        timeframes: results,
        alignment,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error(`Technical analysis error for ${pair}: ${error.message}`);
      throw error;
    }
  }

  async getCandles(pair, timeframe, limit = 200) {
    return await CandleData.find({ pair, timeframe })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  calculateEMAs(candles, periods = [20, 50, 200]) {
    const closes = candles.map(c => c.close).reverse();
    const result = {};

    for (const period of periods) {
      if (closes.length < period) continue;

      const k = 2 / (period + 1);
      let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

      for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }

      result[`ema${period}`] = Math.round(ema * 100000) / 100000;
    }

    return result;
  }

  calculateRSI(candles, period = 14) {
    const closes = candles.map(c => c.close).reverse();
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return Math.round(rsi * 100) / 100;
  }

  calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
    const closes = candles.map(c => c.close).reverse();
    if (closes.length < slow + signal) return null;

    const ema = (data, period) => {
      const k = 2 / (period + 1);
      let result = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const emas = [result];

      for (let i = period; i < data.length; i++) {
        result = data[i] * k + result * (1 - k);
        emas.push(result);
      }
      return emas;
    };

    const fastEMA = ema(closes, fast);
    const slowEMA = ema(closes, slow);

    const macdLine = fastEMA.slice(fastEMA.length - slowEMA.length).map((v, i) => v - slowEMA[i]);
    const signalLine = ema(macdLine, signal);

    const histogram = macdLine.slice(macdLine.length - signalLine.length).map((v, i) => v - signalLine[i]);

    return {
      macd: Math.round(macdLine[macdLine.length - 1] * 100000) / 100000,
      signal: Math.round(signalLine[signalLine.length - 1] * 100000) / 100000,
      histogram: Math.round(histogram[histogram.length - 1] * 100000) / 100000,
      crossover: macdLine[macdLine.length - 1] > signalLine[signalLine.length - 1] && 
                macdLine[macdLine.length - 2] <= signalLine[signalLine.length - 2]
    };
  }

  calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);

      trs.push(Math.max(tr1, tr2, tr3));
    }

    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }

    return Math.round(atr * 100000) / 100000;
  }

  calculateBollingerBands(candles, period = 20, stdDev = 2) {
    const closes = candles.map(c => c.close).reverse();
    if (closes.length < period) return null;

    const recent = closes.slice(-period);
    const sma = recent.reduce((a, b) => a + b, 0) / period;

    const variance = recent.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: Math.round((sma + stdDev * std) * 100000) / 100000,
      middle: Math.round(sma * 100000) / 100000,
      lower: Math.round((sma - stdDev * std) * 100000) / 100000,
      bandwidth: Math.round((4 * std / sma) * 100000) / 100000
    };
  }

  analyzeMarketStructure(candles) {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    let higherHighs = 0;
    let higherLows = 0;
    let lowerHighs = 0;
    let lowerLows = 0;

    for (let i = 2; i < Math.min(candles.length, 20); i++) {
      if (highs[i] > highs[i-1] && highs[i-1] > highs[i-2]) higherHighs++;
      if (lows[i] > lows[i-1] && lows[i-1] > lows[i-2]) higherLows++;
      if (highs[i] < highs[i-1] && highs[i-1] < highs[i-2]) lowerHighs++;
      if (lows[i] < lows[i-1] && lows[i-1] < lows[i-2]) lowerLows++;
    }

    let structure = 'NEUTRAL';
    if (higherHighs >= 2 && higherLows >= 2) structure = 'BULLISH';
    else if (lowerHighs >= 2 && lowerLows >= 2) structure = 'BEARISH';
    else if (higherHighs >= 2) structure = 'BULLISH_BIAS';
    else if (lowerLows >= 2) structure = 'BEARISH_BIAS';

    return {
      structure,
      higherHighs,
      higherLows,
      lowerHighs,
      lowerLows,
      isTrending: higherHighs >= 2 || lowerLows >= 2
    };
  }

  findSupportResistance(candles, lookback = 50) {
    const recent = candles.slice(0, Math.min(lookback, candles.length));
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    // Simple pivot detection
    const pivots = { supports: [], resistances: [] };
    const tolerance = 0.001; // 10 pips for most pairs

    for (let i = 2; i < recent.length - 2; i++) {
      // Support pivot
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        pivots.supports.push(lows[i]);
      }
      // Resistance pivot
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        pivots.resistances.push(highs[i]);
      }
    }

    // Cluster nearby levels
    const clusterLevels = (levels, tolerance) => {
      if (levels.length === 0) return [];
      levels.sort((a, b) => a - b);
      const clusters = [[levels[0]]];

      for (let i = 1; i < levels.length; i++) {
        if (Math.abs(levels[i] - clusters[clusters.length - 1][0]) < tolerance) {
          clusters[clusters.length - 1].push(levels[i]);
        } else {
          clusters.push([levels[i]]);
        }
      }

      return clusters.map(c => Math.round(c.reduce((a, b) => a + b, 0) / c.length * 100000) / 100000);
    };

    return {
      supports: clusterLevels(pivots.supports, tolerance).slice(0, 5),
      resistances: clusterLevels(pivots.resistances, tolerance).slice(0, 5),
      nearestSupport: pivots.supports.length > 0 ? Math.min(...pivots.supports) : null,
      nearestResistance: pivots.resistances.length > 0 ? Math.max(...pivots.resistances) : null
    };
  }

  calculateFibonacci(candles) {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const high = Math.max(...highs.slice(0, 100));
    const low = Math.min(...lows.slice(0, 100));
    const range = high - low;

    const levels = {
      '0': high,
      '23.6': Math.round((high - range * 0.236) * 100000) / 100000,
      '38.2': Math.round((high - range * 0.382) * 100000) / 100000,
      '50': Math.round((high - range * 0.5) * 100000) / 100000,
      '61.8': Math.round((high - range * 0.618) * 100000) / 100000,
      '78.6': Math.round((high - range * 0.786) * 100000) / 100000,
      '100': low
    };

    return levels;
  }

  determineTrend(candles) {
    const closes = candles.map(c => c.close).reverse();
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);

    if (!ema20 || !ema50) return 'NEUTRAL';

    const currentPrice = closes[closes.length - 1];

    if (currentPrice > ema20 && ema20 > ema50) return 'STRONG_UPTREND';
    if (currentPrice > ema20 && ema20 < ema50) return 'WEAK_UPTREND';
    if (currentPrice < ema20 && ema20 < ema50) return 'STRONG_DOWNTREND';
    if (currentPrice < ema20 && ema20 > ema50) return 'WEAK_DOWNTREND';
    return 'NEUTRAL';
  }

  calculateEMA(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateMomentum(candles) {
    const closes = candles.map(c => c.close).reverse();
    if (closes.length < 10) return 'NEUTRAL';

    const change10 = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;

    if (change10 > 1) return 'STRONG_BULLISH';
    if (change10 > 0.3) return 'BULLISH';
    if (change10 < -1) return 'STRONG_BEARISH';
    if (change10 < -0.3) return 'BEARISH';
    return 'NEUTRAL';
  }

  calculateVolatility(candles) {
    const closes = candles.map(c => c.close).reverse();
    if (closes.length < 20) return { regime: 'UNKNOWN', value: 0 };

    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.abs((closes[i] - closes[i-1]) / closes[i-1]) * 100);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const currentReturn = returns[returns.length - 1];

    let regime = 'NORMAL';
    if (currentReturn > avgReturn * 3) regime = 'EXTREME';
    else if (currentReturn > avgReturn * 2) regime = 'HIGH';
    else if (currentReturn < avgReturn * 0.5) regime = 'LOW';

    return {
      regime,
      value: Math.round(currentReturn * 10000) / 10000,
      average: Math.round(avgReturn * 10000) / 10000
    };
  }

  findLiquidityZones(candles) {
    const recent = candles.slice(0, 50);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    const highLiquidity = Math.max(...highs);
    const lowLiquidity = Math.min(...lows);

    return {
      above: highLiquidity,
      below: lowLiquidity,
      sweepAbove: recent[0].high > highLiquidity,
      sweepBelow: recent[0].low < lowLiquidity
    };
  }

  analyzeSMC(candles) {
    const recent = candles.slice(0, 30);
    const orderBlocks = [];
    const fvgs = [];

    // Order Blocks detection
    for (let i = 2; i < recent.length; i++) {
      const c = recent[i];
      const c1 = recent[i-1];
      const c2 = recent[i-2];

      // Bullish Order Block: strong bearish candle before bullish move
      if (c1.close < c1.open && c.close > c.open && c.close > c1.high) {
        orderBlocks.push({
          type: 'BULLISH',
          high: c1.high,
          low: c1.low,
          open: c1.open,
          close: c1.close,
          index: i
        });
      }

      // Bearish Order Block: strong bullish candle before bearish move
      if (c1.close > c1.open && c.close < c.open && c.close < c1.low) {
        orderBlocks.push({
          type: 'BEARISH',
          high: c1.high,
          low: c1.low,
          open: c1.open,
          close: c1.close,
          index: i
        });
      }
    }

    // Fair Value Gaps
    for (let i = 2; i < recent.length; i++) {
      const c = recent[i];
      const c2 = recent[i-2];

      // Bullish FVG: current low > previous previous high
      if (c.low > c2.high) {
        fvgs.push({
          type: 'BULLISH',
          top: c.low,
          bottom: c2.high,
          index: i
        });
      }

      // Bearish FVG: current high < previous previous low
      if (c.high < c2.low) {
        fvgs.push({
          type: 'BEARISH',
          top: c2.low,
          bottom: c.high,
          index: i
        });
      }
    }

    // Break of Structure (BOS)
    const structure = this.analyzeMarketStructure(recent);
    const bos = structure.higherHighs >= 2 || structure.lowerLows >= 2;

    // Change of Character (CHoCH)
    const choch = (structure.higherHighs >= 1 && structure.lowerLows >= 1) ||
                  (structure.higherLows >= 1 && structure.lowerHighs >= 1);

    return {
      orderBlocks: orderBlocks.slice(0, 5),
      fvgs: fvgs.slice(0, 5),
      bos,
      choch,
      liquiditySweep: this.findLiquidityZones(recent).sweepAbove || this.findLiquidityZones(recent).sweepBelow
    };
  }

  checkTimeframeAlignment(results) {
    const tfTrends = {};

    for (const [tf, data] of Object.entries(results)) {
      if (data && data.trend) {
        tfTrends[tf] = data.trend;
      }
    }

    const trendValues = Object.values(tfTrends);
    const bullishCount = trendValues.filter(t => t.includes('UP') || t.includes('BULLISH')).length;
    const bearishCount = trendValues.filter(t => t.includes('DOWN') || t.includes('BEARISH')).length;

    let alignment = 'NEUTRAL';
    if (bullishCount >= 4) alignment = 'STRONG_BULLISH';
    else if (bullishCount >= 3) alignment = 'BULLISH';
    else if (bearishCount >= 4) alignment = 'STRONG_BEARISH';
    else if (bearishCount >= 3) alignment = 'BEARISH';

    return {
      alignment,
      timeframes: tfTrends,
      bullishCount,
      bearishCount,
      aligned: bullishCount >= 3 || bearishCount >= 3
    };
  }
}

module.exports = new TechnicalAnalysisEngine();