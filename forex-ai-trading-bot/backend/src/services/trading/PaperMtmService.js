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
  }
}

module.exports = new PaperMtmService();
