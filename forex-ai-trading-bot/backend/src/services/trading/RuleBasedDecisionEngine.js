const logger = require('../../utils/logger');
const { generateId, roundToDecimals } = require('../../utils/helpers');
const { BrokerAccount, BotConfig } = require('../../models');
const indicators = require('../analysis/IndicatorService');

const MIN_VALID_INDIAN_EQUITY_PRICE = 10;
const DEFAULT_CAPITAL = 100000;

function nowIst(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function getIstMinutes(date = new Date()) {
  const ist = nowIst(date);
  return ist.getHours() * 60 + ist.getMinutes();
}

function validNumber(value) {
  return Number.isFinite(Number(value));
}

function validPrice(price) {
  return validNumber(price) && Number(price) >= MIN_VALID_INDIAN_EQUITY_PRICE;
}

function roundPrice(price) {
  return roundToDecimals(price, Number(price) >= 100 ? 2 : 4);
}

class RuleBasedDecisionEngine {
  constructor() {
    this.strategy = process.env.DEFAULT_STRATEGY || 'MULTI_CONFIRMATION';
  }

  isEntryWindow(date = new Date()) {
    const ist = nowIst(date);
    const day = ist.getDay();
    const minutes = getIstMinutes(date);
    return day !== 0 && day !== 6 && minutes >= 9 * 60 + 20 && minutes <= 15 * 60;
  }

  isOrbWindow(date = new Date()) {
    return getIstMinutes(date) >= 9 * 60 + 45 && getIstMinutes(date) <= 15 * 60;
  }

  noTrade(pair, reason, extra = {}) {
    return {
      decision: 'NO_TRADE',
      pair,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: 0,
      riskPercent: 0,
      positionSize: 0,
      confidence: 0,
      reason,
      rejectionReason: reason,
      strategy: this.strategy,
      indicators: extra.indicators || {},
      votes: extra.votes || [],
      signalId: extra.signalId || generateId()
    };
  }

  async analyze(pair) {
    const normalizedPair = String(pair || '').toUpperCase();
    const signalId = generateId();

    if (!this.isEntryWindow()) {
      return this.noTrade(normalizedPair, 'Outside NSE new-entry window 09:20-15:00 IST', { signalId });
    }

    const [candles5m, candles15m, candles1h] = await Promise.all([
      indicators.getCandles(normalizedPair, '5m', 200),
      indicators.getCandles(normalizedPair, '15m', 200),
      indicators.getCandles(normalizedPair, '1h', 100)
    ]);

    if (!indicators.validateCandles(candles5m, 35)) {
      return this.noTrade(normalizedPair, 'Insufficient valid 5m candles', { signalId });
    }

    const latest = candles5m[candles5m.length - 1];
    const entry = Number(latest.close);
    const latestVolume = Number(latest.volume || latest.tickVolume || 0);

    if (!validPrice(entry)) {
      return this.noTrade(normalizedPair, `Invalid Indian equity price ${entry}`, { signalId });
    }

    if (!Number.isFinite(latestVolume) || latestVolume <= 0) {
      return this.noTrade(normalizedPair, 'Invalid or missing candle volume', { signalId });
    }

    const closes = candles5m.map((c) => Number(c.close));
    const rsiSeries = indicators.calculateRSI(closes, 14);
    const ema9 = indicators.calculateEMA(closes, 9);
    const ema21 = indicators.calculateEMA(closes, 21);
    const atrSeries = indicators.calculateATR(candles5m, 14);
    const vwap = indicators.calculateVWAP(candles5m.slice(-75));
    const avgVolume = indicators.averageVolume(candles5m, 20);
    const atr = indicators.latestFinite(atrSeries) || entry * 0.01;

    const currentRsi = indicators.latestFinite(rsiSeries);
    const previousRsi = indicators.latestFinite(rsiSeries.slice(0, -1));

    if (![vwap, currentRsi, previousRsi, atr, avgVolume].every((v) => Number.isFinite(Number(v))) || atr <= 0) {
      return this.noTrade(normalizedPair, 'One or more indicators are not calculable', { signalId });
    }

    const context = {
      pair: normalizedPair,
      entry,
      latest,
      candles5m,
      candles15m,
      candles1h,
      currentRsi,
      previousRsi,
      ema9,
      ema21,
      atr,
      vwap,
      avgVolume,
      latestVolume
    };

    const votes = [
      this.momentumVote(context),
      this.emaVote(context),
      this.orbVote(context)
    ];

    const actionableVotes = votes.filter((v) => ['BUY', 'SELL'].includes(v.decision));
    const buyVotes = actionableVotes.filter((v) => v.decision === 'BUY');
    const sellVotes = actionableVotes.filter((v) => v.decision === 'SELL');
    const agreeingVotes = buyVotes.length >= sellVotes.length ? buyVotes : sellVotes;
    const direction = agreeingVotes[0]?.decision;

    const confidence = agreeingVotes.length >= 3 ? 85 : agreeingVotes.length >= 2 ? 70 : 0;

    const outputIndicators = {
      rsi: roundToDecimals(currentRsi, 2),
      previousRsi: roundToDecimals(previousRsi, 2),
      ema9: roundToDecimals(indicators.latestFinite(ema9), 2),
      previousEma9: roundToDecimals(indicators.latestFinite(ema9.slice(0, -1)), 2),
      ema21: roundToDecimals(indicators.latestFinite(ema21), 2),
      previousEma21: roundToDecimals(indicators.latestFinite(ema21.slice(0, -1)), 2),
      vwap: roundPrice(vwap),
      atr: roundPrice(atr),
      avgVolume: Math.round(avgVolume),
      latestVolume
    };

    if (!direction || agreeingVotes.length < 2 || confidence < 60) {
      const reason = agreeingVotes.length === 1
        ? `Only one strategy agreed: ${agreeingVotes[0].strategy}`
        : 'No two rule strategies agree';
      return this.noTrade(normalizedPair, reason, { signalId, indicators: outputIndicators, votes });
    }

    const levels = await this.buildRiskLevels({ pair: normalizedPair, direction, entry, atr });
    if (!levels.valid) {
      return this.noTrade(normalizedPair, levels.reason, { signalId, indicators: outputIndicators, votes });
    }

    const reason = `${agreeingVotes.length}/3 strategies agree: ${agreeingVotes.map((v) => v.strategy).join(', ')}`;

    return {
      decision: direction,
      pair: normalizedPair,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      takeProfit: levels.takeProfit,
      riskReward: levels.riskReward,
      riskPercent: levels.riskPercent,
      positionSize: levels.positionSize,
      confidence,
      reason,
      rejectionReason: '',
      strategy: 'MULTI_CONFIRMATION',
      indicators: outputIndicators,
      votes,
      signalId
    };
  }

  momentumVote(ctx) {
    if (ctx.entry > ctx.vwap && ctx.currentRsi > 50 && ctx.currentRsi < 70 && ctx.currentRsi > ctx.previousRsi && ctx.latestVolume >= ctx.avgVolume * 0.8) {
      return { strategy: 'VWAP_RSI_MOMENTUM', decision: 'BUY', reason: 'Close above VWAP with rising RSI and valid volume' };
    }
    if (ctx.entry < ctx.vwap && ctx.currentRsi < 40 && ctx.currentRsi < ctx.previousRsi) {
      return { strategy: 'VWAP_RSI_MOMENTUM', decision: 'SELL', reason: 'Close below VWAP with falling RSI' };
    }
    return { strategy: 'VWAP_RSI_MOMENTUM', decision: 'NO_TRADE', reason: ctx.currentRsi >= 70 ? 'RSI overbought for BUY' : 'Momentum conditions not met' };
  }

  emaVote(ctx) {
    const currentEma9 = indicators.latestFinite(ctx.ema9);
    const previousEma9 = indicators.latestFinite(ctx.ema9.slice(0, -1));
    const currentEma21 = indicators.latestFinite(ctx.ema21);
    const previousEma21 = indicators.latestFinite(ctx.ema21.slice(0, -1));
    const higherTrend = indicators.getCandleTrend(ctx.candles15m.length >= 3 ? ctx.candles15m : ctx.candles1h, 3);

    if (![currentEma9, previousEma9, currentEma21, previousEma21].every((v) => Number.isFinite(Number(v)))) {
      return { strategy: 'EMA_9_21_CROSSOVER', decision: 'NO_TRADE', reason: 'EMA values unavailable' };
    }

    const flatMarket = Math.abs(currentEma9 - currentEma21) / ctx.entry < 0.0005;
    if (flatMarket) return { strategy: 'EMA_9_21_CROSSOVER', decision: 'NO_TRADE', reason: 'Flat/whipsaw market' };

    if (previousEma9 <= previousEma21 && currentEma9 > currentEma21 && ctx.currentRsi < 70 && higherTrend !== 'BEARISH') {
      return { strategy: 'EMA_9_21_CROSSOVER', decision: 'BUY', reason: 'Fresh bullish EMA crossover with higher timeframe confirmation' };
    }
    if (previousEma9 >= previousEma21 && currentEma9 < currentEma21 && ctx.currentRsi > 25 && higherTrend !== 'BULLISH') {
      return { strategy: 'EMA_9_21_CROSSOVER', decision: 'SELL', reason: 'Fresh bearish EMA crossover with higher timeframe confirmation' };
    }

    return { strategy: 'EMA_9_21_CROSSOVER', decision: 'NO_TRADE', reason: 'No fresh EMA crossover' };
  }

  orbVote(ctx) {
    if (!this.isOrbWindow()) {
      return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'NO_TRADE', reason: 'ORB breakout allowed only after 09:45 IST' };
    }

    const openingRange = indicators.getOpeningRange(ctx.candles5m);
    if (!openingRange) return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'NO_TRADE', reason: 'Opening range unavailable' };

    const weakVolume = ctx.latestVolume < ctx.avgVolume * 0.8;
    if (weakVolume) return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'NO_TRADE', reason: 'Breakout candle volume is weak' };

    if (ctx.entry > openingRange.high) {
      return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'BUY', reason: `Close above opening range high ${roundPrice(openingRange.high)}` };
    }
    if (ctx.entry < openingRange.low) {
      return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'SELL', reason: `Close below opening range low ${roundPrice(openingRange.low)}` };
    }

    return { strategy: 'OPENING_RANGE_BREAKOUT', decision: 'NO_TRADE', reason: 'No opening range breakout' };
  }

  async buildRiskLevels({ pair, direction, entry, atr }) {
    const config = await BotConfig.findOne().sort({ updatedAt: -1 }).lean();
    const account = await BrokerAccount.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
    const capital = Number(account?.paperBalance || process.env.PAPER_TRADING_BALANCE || DEFAULT_CAPITAL);
    const riskPercent = Math.min(Number(config?.riskPerTradePercent || process.env.RISK_PER_TRADE_PERCENT || 1), 2);
    const riskAmount = capital * (riskPercent / 100);
    const stopDistance = atr * 1.5;

    let stopLoss;
    let takeProfit;
    if (direction === 'BUY') {
      stopLoss = entry - stopDistance;
      takeProfit = entry + atr * 3;
    } else {
      stopLoss = entry + stopDistance;
      takeProfit = entry - atr * 3;
    }

    const riskPerShare = Math.abs(entry - stopLoss);
    const positionSize = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
    const reward = Math.abs(takeProfit - entry);
    const riskReward = riskPerShare > 0 ? reward / riskPerShare : 0;

    const levels = {
      entry: roundPrice(entry),
      stopLoss: roundPrice(stopLoss),
      takeProfit: roundPrice(takeProfit),
      riskReward: roundToDecimals(riskReward, 2),
      riskPercent,
      positionSize
    };

    return {
      ...levels,
      valid: this.validateLevels({ pair, direction, ...levels }).valid,
      reason: this.validateLevels({ pair, direction, ...levels }).reason
    };
  }

  validateLevels({ direction, entry, stopLoss, takeProfit, riskReward, positionSize }) {
    if (![entry, stopLoss, takeProfit, riskReward, positionSize].every((v) => Number.isFinite(Number(v)))) {
      return { valid: false, reason: 'Invalid numeric risk values' };
    }
    if (positionSize < 1) return { valid: false, reason: 'Calculated quantity below 1' };
    if (riskReward < 2) return { valid: false, reason: `Risk reward ${riskReward} below 2` };
    if (direction === 'BUY' && !(stopLoss < entry && entry < takeProfit)) return { valid: false, reason: 'Invalid BUY SL/TP ordering' };
    if (direction === 'SELL' && !(takeProfit < entry && entry < stopLoss)) return { valid: false, reason: 'Invalid SELL SL/TP ordering' };
    if (Math.min(stopLoss, takeProfit) < entry * 0.5) return { valid: false, reason: 'SL/TP below realistic lower bound' };
    if (Math.max(stopLoss, takeProfit) > entry * 1.5) return { valid: false, reason: 'SL/TP above realistic upper bound' };
    return { valid: true, reason: '' };
  }
}

module.exports = new RuleBasedDecisionEngine();
