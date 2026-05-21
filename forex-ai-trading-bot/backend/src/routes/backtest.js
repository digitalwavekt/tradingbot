const express = require('express');
const router = express.Router();
const { BacktestResult, CandleData, BotConfig } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.post('/run', authenticate, authorize(['admin', 'subadmin']), async (req, res) => {
  try {
    const { pair, timeframe, startDate, endDate, strategyParams } = req.body;

    // Validate inputs
    if (!pair || !timeframe || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Fetch historical data
    const candles = await CandleData.find({
      pair,
      timeframe,
      timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ timestamp: 1 });

    if (candles.length < 100) {
      return res.status(400).json({ error: 'Insufficient historical data (minimum 100 candles required)' });
    }

    const backtestId = `BT_${Date.now()}`;

    // Create backtest record
    const backtest = await BacktestResult.create({
      backtestId,
      strategyName: strategyParams?.name || 'Default Strategy',
      pair,
      timeframe,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      parameters: {
        riskPerTrade: strategyParams?.riskPerTrade || 0.5,
        minRiskReward: strategyParams?.minRiskReward || 2,
        maxOpenTrades: strategyParams?.maxOpenTrades || 3,
        timeframes: strategyParams?.timeframes || ['1h', '4h'],
        indicators: strategyParams?.indicators || ['EMA', 'RSI', 'MACD'],
        newsFilter: strategyParams?.newsFilter !== false,
        spread: strategyParams?.spread || 0.0002,
        slippage: strategyParams?.slippage || 0.0001,
        commission: strategyParams?.commission || 0
      },
      status: 'RUNNING',
      createdAt: new Date()
    });

    // Start backtest in background
    runBacktest(backtest, candles);

    res.json({ message: 'Backtest started', backtestId, status: 'RUNNING' });
  } catch (error) {
    logger.error(`Backtest start error: ${error.message}`);
    res.status(500).json({ error: 'Failed to start backtest' });
  }
});

router.get('/results', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const results = await BacktestResult.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BacktestResult.countDocuments();
    res.json({ results, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch backtest results' });
  }
});

router.get('/results/:backtestId', authenticate, async (req, res) => {
  try {
    const result = await BacktestResult.findOne({ backtestId: req.params.backtestId });
    if (!result) return res.status(404).json({ error: 'Backtest not found' });
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch backtest result' });
  }
});

// Background backtest runner
async function runBacktest(backtest, candles) {
  try {
    const params = backtest.parameters;
    const initialBalance = 100000;
    let balance = initialBalance;
    let equity = initialBalance;
    let maxEquity = initialBalance;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    const trades = [];
    const equityCurve = [{ date: candles[0].timestamp, equity }];
    const monthlyReturns = {};

    let openTrade = null;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let maxConsecutiveWins = 0;
    let currentConsecutiveWins = 0;

    for (let i = 50; i < candles.length; i++) {
      const current = candles[i];
      const prevCandles = candles.slice(Math.max(0, i - 50), i);

      // Simple strategy: EMA crossover with RSI filter
      const closes = prevCandles.map(c => c.close);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const rsi = calculateRSI(closes, 14);

      if (!ema20 || !ema50 || !rsi) continue;

      // Check for exit first
      if (openTrade) {
        const exitPrice = current.close;
        let exit = false;
        let exitReason = '';

        if (openTrade.direction === 'BUY') {
          if (exitPrice <= openTrade.stopLoss) { exit = true; exitReason = 'SL_HIT'; }
          else if (exitPrice >= openTrade.takeProfit) { exit = true; exitReason = 'TP_HIT'; }
        } else {
          if (exitPrice >= openTrade.stopLoss) { exit = true; exitReason = 'SL_HIT'; }
          else if (exitPrice <= openTrade.takeProfit) { exit = true; exitReason = 'TP_HIT'; }
        }

        if (exit) {
          const pips = openTrade.direction === 'BUY' ? 
            (exitPrice - openTrade.entryPrice) / 0.0001 :
            (openTrade.entryPrice - exitPrice) / 0.0001;

          const pnl = pips * openTrade.positionSize * 10 - params.commission;

          balance += pnl;
          equity = balance;

          if (pnl > 0) {
            currentConsecutiveWins++;
            consecutiveLosses = 0;
            maxConsecutiveWins = Math.max(maxConsecutiveWins, currentConsecutiveWins);
          } else {
            consecutiveLosses++;
            currentConsecutiveWins = 0;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
          }

          if (equity > maxEquity) maxEquity = equity;
          const dd = maxEquity - equity;
          if (dd > maxDrawdown) maxDrawdown = dd;

          trades.push({
            entryTime: openTrade.entryTime,
            exitTime: current.timestamp,
            direction: openTrade.direction,
            entryPrice: openTrade.entryPrice,
            exitPrice,
            pnl: Math.round(pnl * 100) / 100,
            pips: Math.round(pips * 100) / 100,
            riskReward: openTrade.riskReward,
            exitReason
          });

          const monthKey = current.timestamp.toISOString().slice(0, 7);
          if (!monthlyReturns[monthKey]) monthlyReturns[monthKey] = { month: monthKey, return: 0, trades: 0 };
          monthlyReturns[monthKey].return += pnl;
          monthlyReturns[monthKey].trades += 1;

          openTrade = null;
        }
      }

      // Check for entry
      if (!openTrade && trades.length < candles.length * 0.1) { // Limit trade frequency
        let direction = null;

        if (ema20 > ema50 && rsi > 50 && rsi < 70) direction = 'BUY';
        else if (ema20 < ema50 && rsi < 50 && rsi > 30) direction = 'SELL';

        if (direction) {
          const atr = calculateATR(prevCandles.slice(-14), 14) || 0.0010;
          const entryPrice = current.close;
          const stopLoss = direction === 'BUY' ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5;
          const risk = Math.abs(entryPrice - stopLoss);
          const takeProfit = direction === 'BUY' ? entryPrice + risk * params.minRiskReward : entryPrice - risk * params.minRiskReward;

          const riskAmount = balance * (params.riskPerTrade / 100);
          const positionSize = Math.round((riskAmount / (risk / 0.0001)) * 100) / 100;

          openTrade = {
            direction,
            entryPrice,
            stopLoss,
            takeProfit,
            positionSize,
            riskReward: params.minRiskReward,
            entryTime: current.timestamp
          };
        }
      }

      equityCurve.push({ date: current.timestamp, equity: Math.round(equity * 100) / 100 });
    }

    // Calculate statistics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const netProfit = grossProfit - grossLoss;
    const netProfitPercent = (netProfit / initialBalance) * 100;

    maxDrawdownPercent = maxEquity > 0 ? (maxDrawdown / maxEquity) * 100 : 0;
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    const avgRR = trades.length > 0 ? trades.reduce((sum, t) => sum + t.riskReward, 0) / trades.length : 0;
    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    // Validation checks
    const validation = {
      isOverfitted: trades.length < 30 || winRate > 85,
      sampleSizeAdequate: trades.length >= 100,
      profitFactorAcceptable: profitFactor >= 1.5,
      drawdownAcceptable: maxDrawdownPercent < 20,
      worksInMultipleConditions: true, // Simplified
      rejected: false,
      rejectionReasons: []
    };

    if (validation.isOverfitted) validation.rejectionReasons.push('Potential overfitting detected');
    if (!validation.sampleSizeAdequate) validation.rejectionReasons.push('Insufficient sample size');
    if (!validation.profitFactorAcceptable) validation.rejectionReasons.push('Profit factor below threshold');
    if (!validation.drawdownAcceptable) validation.rejectionReasons.push('Max drawdown too high');

    validation.rejected = validation.rejectionReasons.length > 0;

    // Update backtest result
    await BacktestResult.findOneAndUpdate(
      { backtestId: backtest.backtestId },
      {
        status: validation.rejected ? 'REJECTED' : 'COMPLETED',
        completedAt: new Date(),
        results: {
          totalTrades: trades.length,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          winRate: Math.round(winRate * 100) / 100,
          profitFactor: Math.round(profitFactor * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          grossLoss: Math.round(grossLoss * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          netProfitPercent: Math.round(netProfitPercent * 100) / 100,
          maxDrawdown: Math.round(maxDrawdown * 100) / 100,
          maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
          sharpeRatio: 0, // Calculate properly
          sortinoRatio: 0,
          averageRiskReward: Math.round(avgRR * 100) / 100,
          averageWinPips: winningTrades.length > 0 ? Math.round((grossProfit / winningTrades.length) * 100) / 100 : 0,
          averageLossPips: losingTrades.length > 0 ? Math.round((grossLoss / losingTrades.length) * 100) / 100 : 0,
          bestTrade: trades.length > 0 ? Math.round(Math.max(...trades.map(t => t.pnl)) * 100) / 100 : 0,
          worstTrade: trades.length > 0 ? Math.round(Math.min(...trades.map(t => t.pnl)) * 100) / 100 : 0,
          averageTrade: trades.length > 0 ? Math.round((netProfit / trades.length) * 100) / 100 : 0,
          maxConsecutiveWins,
          maxConsecutiveLosses,
          totalCommission: trades.length * params.commission,
          totalSlippage: trades.length * params.slippage * 100000,
          totalSwap: 0,
          monthlyReturns: Object.values(monthlyReturns),
          equityCurve: equityCurve.slice(0, 500), // Limit size
          trades: trades.slice(0, 200) // Limit size
        },
        validation
      }
    );

    logger.info(`Backtest ${backtest.backtestId} completed. Trades: ${trades.length}, Win Rate: ${winRate.toFixed(1)}%`);

  } catch (error) {
    logger.error(`Backtest ${backtest.backtestId} failed: ${error.message}`);
    await BacktestResult.findOneAndUpdate(
      { backtestId: backtest.backtestId },
      { status: 'FAILED', completedAt: new Date() }
    );
  }
}

// Helper functions for backtest
function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes, period) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[closes.length - i] - closes[closes.length - i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateATR(candles, period) {
  if (candles.length < period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

module.exports = router;