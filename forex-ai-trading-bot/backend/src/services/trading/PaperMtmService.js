<<<<<<< HEAD
const mongoose = require("mongoose");
const logger = require("../../utils/logger");
const { CandleData } = require("../../models");

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getCandleTime(c) {
  return c?.timestamp || c?.time || c?.date || c?.createdAt || new Date(0);
}

function getCandlePrice(c) {
  return asNumber(c?.close) ?? asNumber(c?.c) ?? asNumber(c?.ltp) ?? asNumber(c?.price);
}

function calculatePnl({ direction, entryPrice, currentPrice, positionSize }) {
  const qty = asNumber(positionSize) || 1;
  const entry = asNumber(entryPrice);
  const current = asNumber(currentPrice);

  if (!entry || !current) return 0;

  if (String(direction).toUpperCase() === "SELL") {
    return (entry - current) * qty;
  }

  return (current - entry) * qty;
}

function getExitReason({ direction, currentPrice, stopLoss, takeProfit }) {
  const dir = String(direction || "BUY").toUpperCase();
  const current = asNumber(currentPrice);
  const sl = asNumber(stopLoss);
  const tp = asNumber(takeProfit);

  if (!current || !sl || !tp) return null;

  if (dir === "SELL") {
    if (current >= sl) return "SL_HIT";
    if (current <= tp) return "TP_HIT";
    return null;
  }

  if (current <= sl) return "SL_HIT";
  if (current >= tp) return "TP_HIT";
  return null;
}

class PaperMtmService {
  constructor() {
    this.running = false;
  }

  async getLatestPrice(pair) {
    for (const timeframe of ["1m", "5m", "15m"]) {
      const candle = await CandleData.findOne({ pair, timeframe })
        .sort({ timestamp: -1, time: -1, date: -1, createdAt: -1 })
        .lean();

      const price = getCandlePrice(candle);

      if (price && price > 0) {
        return {
          price,
          timeframe,
          candleTime: getCandleTime(candle)
        };
      }
    }

    return null;
  }

  async runOnce() {
    if (this.running) {
      logger.warn("Paper MTM skipped: previous run still active");
      return { skipped: true, reason: "ALREADY_RUNNING" };
    }

    this.running = true;

    try {
      const tradeCol = mongoose.connection.db.collection("trades");

      const trades = await tradeCol.find({
        mode: "PAPER",
        status: { $in: ["OPEN", "PENDING"] },
        pair: { $exists: true, $ne: null, $ne: "" }
      }).toArray();

      let updated = 0;
      let closed = 0;
      let noPrice = 0;

      for (const trade of trades) {
        const latest = await this.getLatestPrice(trade.pair);

        if (!latest) {
          noPrice++;
          logger.warn("Paper MTM no latest price", {
            tradeId: trade.tradeId,
            pair: trade.pair
          });
          continue;
        }

        const currentPrice = latest.price;
        const unrealizedPnl = calculatePnl({
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          currentPrice,
          positionSize: trade.positionSize || trade.quantity || 1
        });

        const exitReason = getExitReason({
          direction: trade.direction,
          currentPrice,
          stopLoss: trade.stopLoss,
          takeProfit: trade.takeProfit
        });

        if (exitReason) {
          await tradeCol.updateOne(
            { _id: trade._id },
            {
              $set: {
                status: "CLOSED",
                currentPrice,
                exitPrice: currentPrice,
                exitReason,
                exitTime: new Date(),
                closedAt: new Date(),
                monetaryPnl: unrealizedPnl,
                unrealizedPnl: 0,
                realizedPnl: unrealizedPnl,
                mtmSource: latest.timeframe,
                mtmCandleTime: latest.candleTime,
                updatedAt: new Date()
              },
              $push: {
                logs: {
                  timestamp: new Date(),
                  action: "PAPER_MTM_CLOSED",
                  details: { currentPrice, exitReason, realizedPnl: unrealizedPnl }
                }
              }
            }
          );

          closed++;
          logger.info("Paper trade closed by MTM", {
            tradeId: trade.tradeId,
            pair: trade.pair,
            exitReason,
            currentPrice,
            realizedPnl: unrealizedPnl
          });
        } else {
          await tradeCol.updateOne(
            { _id: trade._id },
            {
              $set: {
                currentPrice,
                monetaryPnl: unrealizedPnl,
                unrealizedPnl,
                mtmSource: latest.timeframe,
                mtmCandleTime: latest.candleTime,
                updatedAt: new Date()
              },
              $push: {
                logs: {
                  timestamp: new Date(),
                  action: "PAPER_MTM_UPDATED",
                  details: { currentPrice, unrealizedPnl }
                }
              }
            }
          );

          updated++;
        }
      }

      logger.info("Paper MTM cycle completed", {
        openTrades: trades.length,
        updated,
        closed,
        noPrice
      });

      return { openTrades: trades.length, updated, closed, noPrice };
    } catch (error) {
      logger.error("Paper MTM cycle failed", {
        message: error.message,
        stack: error.stack
      });
      return { error: error.message };
    } finally {
      this.running = false;
    }

const logger = require('../../utils/logger');
const { Trade, CandleData } = require('../../models');

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function istMinutes(date = new Date()) {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() * 60 + ist.getMinutes();
}

function getCandleTime(candle) {
  return candle?.timestamp || candle?.time || candle?.date || candle?.createdAt || null;
}

function getCandlePrice(candle) {
  return asNumber(candle?.close) ?? asNumber(candle?.c) ?? asNumber(candle?.ltp) ?? asNumber(candle?.price);
}

class PaperMtmService {
  constructor() {
    this.running = false;
  }

  async getLatestPrice(pair) {
    const normalizedPair = String(pair || '').toUpperCase();

    for (const timeframe of ['1m', '5m', '15m']) {
      const candle = await CandleData.findOne({ pair: normalizedPair, timeframe })
        .sort({ timestamp: -1, time: -1, date: -1, createdAt: -1 })
        .lean();

      const price = getCandlePrice(candle);
      if (price && price > 0) {
        return {
          price,
          timeframe,
          timestamp: getCandleTime(candle),
          source: candle?.source || `CANDLE_${timeframe}`
        };
      }
    }

    return null;
  }

  calculatePnl(trade, price) {
    const entry = asNumber(trade.entryPrice);
    const qty = asNumber(trade.positionSize) || asNumber(trade.quantity) || 1;
    if (!entry || !price) return 0;
    return String(trade.direction || trade.side).toUpperCase() === 'SELL'
      ? (entry - price) * qty
      : (price - entry) * qty;
  }

  getInitialRisk(trade) {
    const entry = asNumber(trade.entryPrice);
    const stopLoss = asNumber(trade.breakevenPrice) || asNumber(trade.initialStopLoss) || asNumber(trade.stopLoss);
    if (!entry || !stopLoss) return 0;
    return Math.abs(entry - stopLoss);
  }

  getExitReason(trade, currentPrice) {
    const direction = String(trade.direction || trade.side || 'BUY').toUpperCase();
    const stopLoss = asNumber(trade.stopLoss);
    const takeProfit = asNumber(trade.takeProfit);

    if (!currentPrice || !stopLoss || !takeProfit) return null;

    if (direction === 'SELL') {
      if (currentPrice >= stopLoss) return trade.trailingStopActive ? 'TRAILING_STOP' : 'SL_HIT';
      if (currentPrice <= takeProfit) return 'TP_HIT';
      return null;
    }

    if (currentPrice <= stopLoss) return trade.trailingStopActive ? 'TRAILING_STOP' : 'SL_HIT';
    if (currentPrice >= takeProfit) return 'TP_HIT';
    return null;
  }

  applyBreakEvenAndTrailing(trade, price) {
    const direction = String(trade.direction || trade.side || 'BUY').toUpperCase();
    const entry = asNumber(trade.entryPrice);
    const initialRisk = this.getInitialRisk(trade);
    if (!entry || !initialRisk) return;

    const favorableMove = direction === 'SELL' ? entry - price : price - entry;

    if (!trade.breakevenActivated && favorableMove >= initialRisk) {
      trade.stopLoss = entry;
      trade.breakevenActivated = true;
      trade.breakevenPrice = entry;
      trade.logs.push({
        timestamp: new Date(),
        action: 'BREAKEVEN_ACTIVATED',
        details: { price, stopLoss: entry }
      });
    }

    if (favorableMove < initialRisk * 1.5) return;

    const trailingStop = direction === 'SELL' ? price + initialRisk : price - initialRisk;
    const currentTrail = asNumber(trade.trailingStopCurrent) || asNumber(trade.stopLoss);
    const shouldTrail = !trade.trailingStopActive ||
      (direction === 'SELL' ? trailingStop < currentTrail : trailingStop > currentTrail);

    if (shouldTrail) {
      trade.trailingStopActive = true;
      trade.trailingStopDistance = initialRisk;
      trade.trailingStopCurrent = trailingStop;
      trade.stopLoss = trailingStop;
      trade.logs.push({
        timestamp: new Date(),
        action: 'TRAILING_STOP_UPDATED',
        details: { price, trailingStop }
      });
    }
  }

  async updateTrade(trade, latest) {
    const price = asNumber(latest.price);
    const entry = asNumber(trade.entryPrice);
    if (!price || !entry) return false;

    this.applyBreakEvenAndTrailing(trade, price);

    const monetaryPnl = this.calculatePnl(trade, price);
    trade.currentPrice = price;
    trade.unrealizedPnl = (monetaryPnl / Math.max(entry * (asNumber(trade.positionSize) || asNumber(trade.quantity) || 1), 1)) * 100;
    trade.monetaryPnl = monetaryPnl;
    trade.mtmSource = latest.source || latest.timeframe || 'CANDLE';
    trade.mtmCandleTime = latest.timestamp || latest.candleTime || new Date();

    let exitReason = this.getExitReason(trade, price);
    if (istMinutes() >= 15 * 60 + 10) exitReason = 'TIME_EXPIRED';

    if (exitReason) {
      trade.status = 'CLOSED';
      trade.exitPrice = price;
      trade.exitReason = exitReason;
      trade.exitTime = new Date();
      trade.closedAt = new Date();
      trade.realizedPnl = monetaryPnl;
      trade.unrealizedPnl = 0;
      trade.logs.push({
        timestamp: new Date(),
        action: 'PAPER_MTM_CLOSED',
        details: { exitReason, currentPrice: price, realizedPnl: monetaryPnl }
      });
      await trade.save();
      return true;
    }

    trade.logs.push({
      timestamp: new Date(),
      action: 'PAPER_MTM_UPDATED',
      details: { currentPrice: price, unrealizedPnl: trade.unrealizedPnl, monetaryPnl }
    });
    await trade.save();
    return false;
 51227e5 (Add rule-based paper trading engine)
  }

  async runCycle() {
    if (this.running) {
      logger.warn('Paper MTM skipped: previous run still active');
      return { skipped: true, reason: 'ALREADY_RUNNING' };
    }

    this.running = true;

    try {
      const openTrades = await Trade.find({
        mode: 'PAPER',
        status: { $in: ['OPEN', 'PENDING'] },
        pair: { $exists: true, $ne: null, $ne: '' }
      });

      let updated = 0;
      let closed = 0;
      let noPrice = 0;

      for (const trade of openTrades) {
        const latest = await this.getLatestPrice(trade.pair);
        if (!latest) {
          noPrice += 1;
          logger.warn('Paper MTM no latest price', { tradeId: trade.tradeId, pair: trade.pair });
          continue;
        }

        const didClose = await this.updateTrade(trade, latest);
        updated += 1;
        if (didClose) closed += 1;
      }

      logger.info('Paper MTM cycle completed', { openTrades: openTrades.length, updated, closed, noPrice });
      return { openTrades: openTrades.length, updated, closed, noPrice };
    } catch (error) {
      logger.error('Paper MTM cycle failed', { message: error.message, stack: error.stack });
      return { error: error.message };
    } finally {
      this.running = false;
    }
  }

  async runOnce() {
    return this.runCycle();
  }
}

module.exports = new PaperMtmService();
