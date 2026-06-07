const { CandleData } = require('../../models');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function sortAscending(candles) {
  return [...(candles || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

class IndicatorService {
  async getCandles(pair, timeframe, limit = 200) {
    return CandleData.find({ pair: String(pair || '').toUpperCase(), timeframe })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .then(sortAscending);
  }

  validateCandles(candles, min = 1) {
    if (!Array.isArray(candles) || candles.length < min) return false;
    return candles.every((c) => (
      isFiniteNumber(c.open) &&
      isFiniteNumber(c.high) &&
      isFiniteNumber(c.low) &&
      isFiniteNumber(c.close) &&
      Number(c.high) >= Number(c.low) &&
      Number(c.close) > 0
    ));
  }

  calculateEMA(values, period = 9) {
    const data = (values || []).map(toNumber).filter((v) => v !== null);
    if (data.length < period) return [];

    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    const result = Array(period - 1).fill(null);
    result.push(ema);

    for (let i = period; i < data.length; i += 1) {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }

    return result;
  }

  calculateRSI(candlesOrValues, period = 14) {
    const values = (candlesOrValues || []).map((v) => (
      typeof v === 'object' ? toNumber(v.close) : toNumber(v)
    ));
    if (values.length < period + 1 || values.some((v) => v === null)) return [];

    const result = Array(period).fill(null);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i += 1) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

    for (let i = period + 1; i < values.length; i += 1) {
      const change = values[i] - values[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }

    return result;
  }

  calculateVWAP(candles) {
    if (!this.validateCandles(candles, 1)) return null;

    let pv = 0;
    let volumeSum = 0;

    for (const candle of candles) {
      const volume = Number(candle.volume || candle.tickVolume || 0);
      if (!Number.isFinite(volume) || volume <= 0) continue;
      const typicalPrice = (Number(candle.high) + Number(candle.low) + Number(candle.close)) / 3;
      pv += typicalPrice * volume;
      volumeSum += volume;
    }

    if (volumeSum <= 0) return null;
    return pv / volumeSum;
  }

  calculateATR(candles, period = 14) {
    if (!this.validateCandles(candles, period + 1)) return [];
    const trs = [];

    for (let i = 1; i < candles.length; i += 1) {
      const high = Number(candles[i].high);
      const low = Number(candles[i].low);
      const prevClose = Number(candles[i - 1].close);
      trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }

    let atr = trs.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    const result = Array(period).fill(null);
    result.push(atr);

    for (let i = period; i < trs.length; i += 1) {
      atr = ((atr * (period - 1)) + trs[i]) / period;
      result.push(atr);
    }

    return result;
  }

  averageVolume(candles, period = 20) {
    const recent = (candles || []).slice(-period);
    if (!recent.length) return null;
    const volumes = recent.map((c) => Number(c.volume || c.tickVolume || 0)).filter((v) => Number.isFinite(v) && v > 0);
    if (!volumes.length) return null;
    return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
  }

  getCandleTrend(candles, lookback = 3) {
    if (!this.validateCandles(candles, lookback)) return 'NEUTRAL';
    const recent = candles.slice(-lookback);
    const first = Number(recent[0].close);
    const last = Number(recent[recent.length - 1].close);
    if (last > first) return 'BULLISH';
    if (last < first) return 'BEARISH';
    return 'NEUTRAL';
  }

  getOpeningRange(candles, date = new Date()) {
    if (!this.validateCandles(candles, 1)) return null;
    const istDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    const rangeCandles = candles.filter((c) => {
      const ist = new Date(new Date(c.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const minutes = ist.getHours() * 60 + ist.getMinutes();
      return (
        ist.getFullYear() === istDate.getFullYear() &&
        ist.getMonth() === istDate.getMonth() &&
        ist.getDate() === istDate.getDate() &&
        minutes >= 9 * 60 + 15 &&
        minutes < 9 * 60 + 45
      );
    });

    if (!rangeCandles.length) return null;

    return {
      high: Math.max(...rangeCandles.map((c) => Number(c.high))),
      low: Math.min(...rangeCandles.map((c) => Number(c.low))),
      candles: rangeCandles.length
    };
  }

  latestFinite(values) {
    for (let i = values.length - 1; i >= 0; i -= 1) {
      if (Number.isFinite(Number(values[i]))) return Number(values[i]);
    }
    return null;
  }
}

module.exports = new IndicatorService();
