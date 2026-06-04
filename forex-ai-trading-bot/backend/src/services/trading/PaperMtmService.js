const logger = require('../../utils/logger');
const { Trade, CandleData } = require('../../models');

function istMinutes(date = new Date()) {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() * 60 + ist.getMinutes();
}

class PaperMtmService {
  async getLatestPrice(pair) {
    const candle = await CandleData.findOne({
      pair: String(pair || '').toUpperCase(),
      timeframe: { $in: ['1m', '5m', '15m'] }
    }).sort({ timestamp: -1 }).lean();

    const price = Number(candle?.close);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, timestamp: candle.timestamp, source: candle.source || 'CANDLE' };
  }

  calculatePnl(trade, price) {
    const entry = Number(trade.entryPrice);
    const qty = Number(trade.positionSize || 0);
    const diff = trade.direction === 'BUY' ? price - entry : entry - price;
    return diff * qty;
  }

  async runCycle() {
    const openTrades = await Trade.find({ mode: 'PAPER', status: 'OPEN' });
    let updated = 0;
    let closed = 0;
    let noPrice = 0;

    for (const trade of openTrades) {
      const latest = await this.getLatestPrice(trade.pair);
      if (!latest) {
        noPrice += 1;
        continue;
      }

      const didClose = await this.updateTrade(trade, latest);
      updated += 1;
      if (didClose) closed += 1;
    }

    logger.info('Paper MTM cycle completed', { openTrades: openTrades.length, updated, closed, noPrice });
    return { openTrades: openTrades.length, updated, closed, noPrice };
  }

  async updateTrade(trade, latest) {
    const price = Number(latest.price);
    const entry = Number(trade.entryPrice);
    const stopLoss = Number(trade.stopLoss);
    const takeProfit = Number(trade.takeProfit);
    const qty = Number(trade.positionSize || 0);
    const initialRisk = Math.abs(entry - Number(trade.breakevenPrice || trade.stopLoss));
    const favorableMove = trade.direction === 'BUY' ? price - entry : entry - price;

    trade.currentPrice = price;
    trade.unrealizedPnl = trade.direction === 'BUY'
      ? ((price - entry) / entry) * 100
      : ((entry - price) / entry) * 100;
    trade.monetaryPnl = this.calculatePnl(trade, price);
    trade.mtmSource = latest.source;
    trade.mtmCandleTime = latest.timestamp;

    if (!trade.breakevenActivated && initialRisk > 0 && favorableMove >= initialRisk) {
      trade.stopLoss = entry;
      trade.breakevenActivated = true;
      trade.breakevenPrice = entry;
      trade.logs.push({ timestamp: new Date(), action: 'BREAKEVEN_ACTIVATED', details: { price } });
    }

    if (initialRisk > 0 && favorableMove >= initialRisk * 1.5) {
      const trailingStop = trade.direction === 'BUY' ? price - initialRisk : price + initialRisk;
      const shouldTrail = !trade.trailingStopActive ||
        (trade.direction === 'BUY' && trailingStop > Number(trade.trailingStopCurrent || trade.stopLoss)) ||
        (trade.direction === 'SELL' && trailingStop < Number(trade.trailingStopCurrent || trade.stopLoss));

      if (shouldTrail) {
        trade.trailingStopActive = true;
        trade.trailingStopDistance = initialRisk;
        trade.trailingStopCurrent = trailingStop;
        trade.stopLoss = trailingStop;
        trade.logs.push({ timestamp: new Date(), action: 'TRAILING_STOP_UPDATED', details: { price, trailingStop } });
      }
    }

    let exitReason = null;
    if (trade.direction === 'BUY') {
      if (price <= Number(trade.stopLoss || stopLoss)) exitReason = trade.trailingStopActive ? 'TRAILING_STOP' : 'SL_HIT';
      if (price >= takeProfit) exitReason = 'TP_HIT';
    } else {
      if (price >= Number(trade.stopLoss || stopLoss)) exitReason = trade.trailingStopActive ? 'TRAILING_STOP' : 'SL_HIT';
      if (price <= takeProfit) exitReason = 'TP_HIT';
    }

    if (istMinutes() >= 15 * 60 + 10) {
      exitReason = 'TIME_EXPIRED';
    }

    if (exitReason) {
      trade.status = 'CLOSED';
      trade.exitPrice = price;
      trade.exitReason = exitReason;
      trade.exitTime = new Date();
      trade.closedAt = new Date();
      trade.realizedPnl = trade.monetaryPnl;
      trade.logs.push({ timestamp: new Date(), action: 'PAPER_TRADE_CLOSED', details: { exitReason, price, qty } });
      await trade.save();
      return true;
    }

    await trade.save();
    return false;
  }
}

module.exports = new PaperMtmService();
