const logger = require('../../utils/logger');
const { RiskLog, BotConfig, Trade, BrokerAccount } = require('../../models');


function getEffectiveMode(config) {
  return config?.mode || process.env.TRADING_MODE || 'PAPER';
}

class RiskEngine {
  constructor() {
    this.config = null;
    this.account = null;
    this.riskState = {
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      dailyLoss: 0,
      weeklyLoss: 0,
      monthlyLoss: 0,
      openTrades: [],
      consecutiveLosses: 0,
      lastResetDate: new Date(),
      lastResetWeek: this.getWeekNumber(),
      lastResetMonth: new Date().getMonth()
    };
  }

  async initialize() {
    this.config = await BotConfig.findOne().sort({ updatedAt: -1 });
    this.account = await BrokerAccount.findOne({ isActive: true }).sort({ updatedAt: -1 });

    if (!this.config) {
      throw new Error('BotConfig not found. Risk engine cannot initialize.');
    }

    await this.loadRiskState();
    logger.info('Risk Engine initialized successfully');
  }

  getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek);
  }

  safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  getEffectiveMode() {
    return process.env.TRADING_MODE || this.config?.mode || 'LEARNING';
  }

  getAccountBalance() {
    if (!this.account) return Number(process.env.PAPER_TRADING_BALANCE || 100000);
    return getEffectiveMode(this.config) === 'PAPER'
      ? this.safeNumber(this.account.paperBalance, Number(process.env.PAPER_TRADING_BALANCE || 100000))
      : this.safeNumber(this.account.balance, 100000);
  }

  getAccountEquity() {
    if (!this.account) return this.getAccountBalance();
    return getEffectiveMode(this.config) === 'PAPER'
      ? this.safeNumber(this.account.paperEquity, this.getAccountBalance())
      : this.safeNumber(this.account.equity, this.getAccountBalance());
  }

  async loadRiskState() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const dailyTrades = await Trade.find({ closedAt: { $gte: today }, status: 'CLOSED' });
    this.riskState.dailyPnl = dailyTrades.reduce((sum, t) => sum + (this.safeNumber(t.monetaryPnl)), 0);
    this.riskState.dailyLoss = dailyTrades
      .filter(t => this.safeNumber(t.monetaryPnl) < 0)
      .reduce((sum, t) => sum + Math.abs(this.safeNumber(t.monetaryPnl)), 0);

    const weeklyTrades = await Trade.find({ closedAt: { $gte: weekStart }, status: 'CLOSED' });
    this.riskState.weeklyPnl = weeklyTrades.reduce((sum, t) => sum + (this.safeNumber(t.monetaryPnl)), 0);
    this.riskState.weeklyLoss = weeklyTrades
      .filter(t => this.safeNumber(t.monetaryPnl) < 0)
      .reduce((sum, t) => sum + Math.abs(this.safeNumber(t.monetaryPnl)), 0);

    const monthlyTrades = await Trade.find({ closedAt: { $gte: monthStart }, status: 'CLOSED' });
    this.riskState.monthlyPnl = monthlyTrades.reduce((sum, t) => sum + (this.safeNumber(t.monetaryPnl)), 0);
    this.riskState.monthlyLoss = monthlyTrades
      .filter(t => this.safeNumber(t.monetaryPnl) < 0)
      .reduce((sum, t) => sum + Math.abs(this.safeNumber(t.monetaryPnl)), 0);

    this.riskState.openTrades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } });

    const recentTrades = await Trade.find({ status: 'CLOSED' }).sort({ closedAt: -1 }).limit(20);

    let consecutiveLosses = 0;
    for (const trade of recentTrades) {
      if (this.safeNumber(trade.monetaryPnl) < 0) consecutiveLosses++;
      else break;
    }

    this.riskState.consecutiveLosses = consecutiveLosses;
  }

  async validateTrade(signal, marketData) {
    const checks = [];
    const rejectionReasons = [];

    try {
      await this.loadRiskState();

      const pushCheck = async (checkOrPromise) => {
        const check = await checkOrPromise;
        checks.push(check);
        if (!check.passed) rejectionReasons.push(check.message);
      };

      await pushCheck(this.checkKillSwitch());
      await pushCheck(this.checkTradingMode());
      await pushCheck(this.checkDailyLossLimit());
      await pushCheck(this.checkNewEntryWindow());
      await pushCheck(this.checkWeeklyLossLimit());
      await pushCheck(this.checkMonthlyLossLimit());
      await pushCheck(this.checkMaxOpenTrades(signal.pair));
      await pushCheck(this.checkDuplicateOpenPaperPair(signal.pair));
      await pushCheck(this.checkCorrelatedTrades(signal.pair));
      await pushCheck(this.checkRiskReward(signal));
      await pushCheck(this.checkStopLoss(signal));
      await pushCheck(this.checkTakeProfit(signal));
      await pushCheck(this.checkTradeLevels(signal));
      await pushCheck(this.checkSpread(marketData));
      await pushCheck(this.checkVolatility(marketData));
      await pushCheck(this.checkLiquidity(marketData));
      await pushCheck(this.checkNewsSafety(signal.pair));
      await pushCheck(this.checkConfidence(signal));
      await pushCheck(this.checkApiLatency(marketData));
      await pushCheck(this.checkBrokerHealth());
      await pushCheck(this.checkDrawdown());
      await pushCheck(this.checkMargin(signal));
      await pushCheck(this.validatePositionSize(signal));
      await pushCheck(this.checkMartingalePrevention(signal));
      await pushCheck(this.checkRevengeTrading());
      await pushCheck(this.checkMarketOpen(signal.pair));

      const allPassed = checks.every(c => c.passed);

      await RiskLog.create({
        type: 'TRADE_CHECK',
        level: allPassed ? 'INFO' : 'BLOCKED',
        pair: signal.pair,
        signalId: signal.signalId,
        details: {
          checkName: 'FULL_TRADE_VALIDATION',
          passed: allPassed,
          value: checks.filter(c => !c.passed).length,
          threshold: 0,
          message: allPassed ? 'All risk checks passed' : `Failed checks: ${rejectionReasons.join(', ')}`
        },
        actionTaken: allPassed ? 'APPROVED' : 'REJECTED',
        accountSnapshot: await this.getAccountSnapshot()
      });

      return {
        passed: allPassed,
        checks,
        rejectionReasons: allPassed ? [] : rejectionReasons
      };

    } catch (error) {
      logger.error(`Risk validation error: ${error.message}`);

      await RiskLog.create({
        type: 'TRADE_CHECK',
        level: 'CRITICAL',
        pair: signal.pair,
        signalId: signal.signalId,
        details: {
          checkName: 'RISK_ENGINE_ERROR',
          passed: false,
          message: `Risk engine error: ${error.message}`
        },
        actionTaken: 'REJECTED_DUE_TO_ERROR'
      });

      return {
        passed: false,
        checks,
        rejectionReasons: [...rejectionReasons, `Risk engine error: ${error.message}`]
      };
    }
  }

  async checkKillSwitch() {
    const passed = !this.config?.killSwitchTriggered;
    return {
      name: 'KILL_SWITCH',
      passed,
      value: this.config?.killSwitchTriggered,
      threshold: false,
      message: passed ? 'Kill switch not triggered' : `KILL SWITCH ACTIVE: ${this.config?.killSwitchReason}`
    };
  }

  async checkTradingMode() {
    const mode = getEffectiveMode(this.config);
    const allowed = ['PAPER', 'DEMO'].includes(mode) || process.env.ALLOW_LIVE_TRADING === 'true';

    return {
      name: 'TRADING_MODE',
      passed: allowed,
      value: mode,
      threshold: 'PAPER/DEMO or live explicitly allowed',
      message: allowed ? `Mode ${mode} allows trading` : `Mode ${mode} does not allow trading`
    };
  }

  async checkDailyLossLimit() {
    const balance = this.getAccountBalance();
    const dailyLossPercent = balance > 0 ? (this.riskState.dailyLoss / balance) * 100 : 0;
    const limit = this.safeNumber(this.config?.dailyMaxLossPercent, 2);
    const passed = dailyLossPercent < limit;

    return {
      name: 'DAILY_LOSS_LIMIT',
      passed,
      value: `${lossPercent.toFixed(2)}%`,
      threshold: `${limit}%`,
      message: passed
        ? `Daily realized+unrealized loss ${lossPercent.toFixed(2)}% below limit ${limit}%`
        : `DAILY LOSS LIMIT REACHED: ${lossPercent.toFixed(2)}% >= ${limit}%`
    };
  }

  checkNewEntryWindow() {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    const minutes = ist.getHours() * 60 + ist.getMinutes();
    const passed = day !== 0 && day !== 6 && minutes >= 9 * 60 + 20 && minutes <= 15 * 60;

    return {
      name: 'NSE_ENTRY_WINDOW',
      passed,
      value: `${String(ist.getHours()).padStart(2, '0')}:${String(ist.getMinutes()).padStart(2, '0')} IST`,
      threshold: '09:20-15:00 IST weekday',
      message: passed ? 'NSE new-entry window is open' : 'Outside NSE new-entry window or in first 5 minutes'
    };
  }

  async checkWeeklyLossLimit() {
    const balance = this.getAccountBalance();
    const weeklyLossPercent = balance > 0 ? (this.riskState.weeklyLoss / balance) * 100 : 0;
    const limit = this.safeNumber(this.config?.weeklyMaxLossPercent, 5);
    const passed = weeklyLossPercent < limit;

    return {
      name: 'WEEKLY_LOSS_LIMIT',
      passed,
      value: `${weeklyLossPercent.toFixed(2)}%`,
      threshold: `${limit}%`,
      message: passed
        ? `Weekly loss ${weeklyLossPercent.toFixed(2)}% below limit ${limit}%`
        : `WEEKLY LOSS LIMIT REACHED: ${weeklyLossPercent.toFixed(2)}% >= ${limit}%`
    };
  }

  async checkMonthlyLossLimit() {
    const balance = this.getAccountBalance();
    const monthlyLossPercent = balance > 0 ? (this.riskState.monthlyLoss / balance) * 100 : 0;
    const limit = this.safeNumber(this.config?.monthlyMaxLossPercent, 10);
    const passed = monthlyLossPercent < limit;

    return {
      name: 'MONTHLY_LOSS_LIMIT',
      passed,
      value: `${monthlyLossPercent.toFixed(2)}%`,
      threshold: `${limit}%`,
      message: passed
        ? `Monthly loss ${monthlyLossPercent.toFixed(2)}% below limit ${limit}%`
        : `MONTHLY LOSS LIMIT REACHED: ${monthlyLossPercent.toFixed(2)}% >= ${limit}%`
    };
  }

  async checkMaxOpenTrades() {
    const openTradesCount = this.riskState.openTrades.length;
    const limit = this.safeNumber(this.config?.maxOpenTrades, 3);
    const passed = openTradesCount < limit;

    return {
      name: 'MAX_OPEN_TRADES',
      passed,
      value: openTradesCount,
      threshold: limit,
      message: passed
        ? `Open trades ${openTradesCount} below limit ${limit}`
        : `MAX OPEN TRADES REACHED: ${openTradesCount} >= ${limit}`
    };
  }

  async checkDuplicateOpenPaperPair(pair) {
    const normalizedPair = String(pair || '').toUpperCase();
    const duplicate = await Trade.findOne({
      pair: normalizedPair,
      mode: 'PAPER',
      status: { $in: ['OPEN', 'PENDING'] }
    }).lean();

    const passed = !duplicate;
    return {
      name: 'DUPLICATE_OPEN_PAPER_PAIR',
      passed,
      value: passed ? 0 : 1,
      threshold: 0,
      message: passed
        ? `No open/pending PAPER trade for ${normalizedPair}`
        : `Duplicate open/pending PAPER trade exists for ${normalizedPair}`
    };
  }

  async checkCorrelatedTrades(pair) {
    const base = String(pair || '').split('/')[0];
    const correlated = this.riskState.openTrades.filter(t => String(t.pair || '').startsWith(base));
    const limit = this.safeNumber(this.config?.maxCorrelatedTrades, 2);
    const passed = correlated.length < limit;

    return {
      name: 'MAX_CORRELATED_TRADES',
      passed,
      value: correlated.length,
      threshold: limit,
      message: passed
        ? `Correlated trades ${correlated.length} below limit ${limit}`
        : `MAX CORRELATED TRADES REACHED for ${base}: ${correlated.length} >= ${limit}`
    };
  }

  checkRiskReward(signal) {
    const rr = this.safeNumber(signal.riskReward, 0);
    const minRiskReward = this.safeNumber(this.config?.minRiskReward, 2);
    const passed = rr >= minRiskReward;

    return {
      name: 'MIN_RISK_REWARD',
      passed,
      value: rr.toFixed(2),
      threshold: minRiskReward,
      message: passed
        ? `Risk-Reward ${rr.toFixed(2)} meets minimum ${minRiskReward}`
        : `RISK-REWARD TOO LOW: ${rr.toFixed(2)} < ${minRiskReward}`
    };
  }

  checkStopLoss(signal) {
    const stopLoss = Number(signal.stopLoss);
    const passed = Number.isFinite(stopLoss) && stopLoss > 0;

    return {
      name: 'STOP_LOSS_MANDATORY',
      passed,
      value: passed ? stopLoss : 'MISSING',
      threshold: 'REQUIRED',
      message: passed
        ? `Stop loss set at ${stopLoss}`
        : 'STOP LOSS IS MANDATORY - NO TRADE WITHOUT VALID STOP LOSS'
    };
  }

  checkTakeProfit(signal) {
    const takeProfit = Number(signal.takeProfit);
    const passed = Number.isFinite(takeProfit) && takeProfit > 0;

    return {
      name: 'TAKE_PROFIT_MANDATORY',
      passed,
      value: passed ? takeProfit : 'MISSING',
      threshold: 'REQUIRED',
      message: passed
        ? `Take profit set at ${takeProfit}`
        : 'TAKE PROFIT IS MANDATORY - NO TRADE WITHOUT VALID TAKE PROFIT'
    };
  }

  checkTradeLevels(signal) {
    const direction = signal.direction;
    const entry = Number(signal.entryPrice);
    const stopLoss = Number(signal.stopLoss);
    const takeProfit = Number(signal.takeProfit);
    let passed = [entry, stopLoss, takeProfit].every((v) => Number.isFinite(v) && v > 0);

    if (passed && direction === 'BUY') {
      passed = stopLoss < entry && entry < takeProfit && stopLoss >= entry * 0.5 && takeProfit <= entry * 1.5;
    }
    if (passed && direction === 'SELL') {
      passed = takeProfit < entry && entry < stopLoss && takeProfit >= entry * 0.5 && stopLoss <= entry * 1.5;
    }

    return {
      name: 'SL_TP_REALISTIC',
      passed,
      value: { direction, entry, stopLoss, takeProfit },
      threshold: 'Valid order and within 50%-150% entry bounds',
      message: passed ? 'SL/TP levels are realistic' : 'Invalid or unrealistic SL/TP levels'
    };
  }

  checkSpread(marketData) {
    const spreadPips = this.safeNumber(marketData?.spreadPips, 0);
    const maxSpread = 3.0;
    const passed = spreadPips <= maxSpread;

    return {
      name: 'SPREAD_CHECK',
      passed,
      value: `${spreadPips.toFixed(1)} pips`,
      threshold: `${maxSpread} pips`,
      message: passed
        ? `Spread ${spreadPips.toFixed(1)} pips within limit ${maxSpread} pips`
        : `SPREAD TOO HIGH: ${spreadPips.toFixed(1)} pips > ${maxSpread} pips`
    };
  }

  checkVolatility(marketData) {
    const regime = marketData?.volatilityRegime || 'NORMAL';
    const passed = regime !== 'EXTREME';

    return {
      name: 'VOLATILITY_CHECK',
      passed,
      value: regime,
      threshold: 'NOT EXTREME',
      message: passed ? `Volatility regime ${regime} acceptable` : 'VOLATILITY EXTREME - AVOIDING TRADE'
    };
  }

  checkLiquidity(marketData) {
    const liquidity = marketData?.liquidity || 'NORMAL';
    const isPaperMode = (getEffectiveMode(this.config) || process.env.TRADING_MODE || 'PAPER') === 'PAPER';
    const passed = isPaperMode ? true : liquidity !== 'LOW';

    return {
      name: 'LIQUIDITY_CHECK',
      passed,
      value: liquidity,
      threshold: 'NOT LOW',
      message: liquidity === 'LOW' && isPaperMode ? 'LOW LIQUIDITY - PAPER WARNING ONLY' : (passed ? `Liquidity ${liquidity} acceptable` : 'LIQUIDITY TOO LOW - AVOIDING TRADE')
    };
  }

  async checkNewsSafety(pair) {
    const { NewsEvent } = require('../../models');
    const now = new Date();
    const bufferBefore = this.safeNumber(this.config?.newsBufferMinutesBefore, 30) * 60 * 1000;
    const bufferAfter = this.safeNumber(this.config?.newsBufferMinutesAfter, 60) * 60 * 1000;

    const parts = String(pair || '').split('/');
    const currencies = [parts[0], parts[1], 'ALL'].filter(Boolean);

    const upcomingNews = await NewsEvent.find({
      currency: { $in: currencies },
      impact: { $in: ['HIGH', 'MEDIUM'] },
      scheduledTime: {
        $gte: new Date(now.getTime() - bufferAfter),
        $lte: new Date(now.getTime() + bufferBefore)
      },
      isStale: false
    });

    const passed = upcomingNews.length === 0;

    return {
      name: 'NEWS_SAFETY',
      passed,
      value: upcomingNews.length,
      threshold: 0,
      message: passed
        ? 'No high-impact news in buffer window'
        : `HIGH-IMPACT NEWS DETECTED: ${upcomingNews.length} events near ${pair}`
    };
  }

  checkConfidence(signal) {
    const confidence = this.safeNumber(signal.confidence, 0);
    const minConfidence = this.safeNumber(this.config?.minConfidenceScore, 65);
    const passed = confidence >= minConfidence;

    return {
      name: 'MIN_CONFIDENCE',
      passed,
      value: `${confidence}%`,
      threshold: `${minConfidence}%`,
      message: passed
        ? `Confidence ${confidence}% meets minimum ${minConfidence}%`
        : `CONFIDENCE TOO LOW: ${confidence}% < ${minConfidence}%`
    };
  }

  checkApiLatency(marketData) {
    const latency = this.safeNumber(marketData?.latencyMs, 0);
    const maxLatency = 500;
    const passed = latency <= maxLatency;

    return {
      name: 'API_LATENCY',
      passed,
      value: `${latency}ms`,
      threshold: `${maxLatency}ms`,
      message: passed
        ? `API latency ${latency}ms within limit ${maxLatency}ms`
        : `API LATENCY TOO HIGH: ${latency}ms > ${maxLatency}ms`
    };
  }

  async checkBrokerHealth() {
    const brokerAccount = await BrokerAccount.findOne({ isActive: true });
    const isHealthy = brokerAccount && brokerAccount.healthCheckStatus === 'HEALTHY';
    const passed = isHealthy || getEffectiveMode(this.config) === 'PAPER';

    return {
      name: 'BROKER_HEALTH',
      passed,
      value: brokerAccount?.healthCheckStatus || 'UNKNOWN',
      threshold: 'HEALTHY',
      message: passed
        ? `Broker status: ${brokerAccount?.healthCheckStatus || 'PAPER_MODE'}`
        : `BROKER UNHEALTHY: ${brokerAccount?.healthCheckStatus}`
    };
  }

  async checkDrawdown() {
    const balance = this.getAccountBalance();
    const equity = this.getAccountEquity();
    const drawdown = balance > 0 ? ((balance - equity) / balance) * 100 : 0;
    const limit = this.safeNumber(this.config?.maxDrawdownPercent, 10);
    const passed = drawdown < limit;

    return {
      name: 'MAX_DRAWDOWN',
      passed,
      value: `${drawdown.toFixed(2)}%`,
      threshold: `${limit}%`,
      message: passed
        ? `Current drawdown ${drawdown.toFixed(2)}% below limit ${limit}%`
        : `DRAWDOWN LIMIT REACHED: ${drawdown.toFixed(2)}% >= ${limit}%`
    };
  }

  async checkMargin(signal) {
    const balance = this.getAccountBalance();
    const maxMarginUsagePercent = this.safeNumber(this.config?.maxMarginUsagePercent, 50);

    let projectedMarginUsage = 0;

    if (getEffectiveMode(this.config) !== 'PAPER') {
      const marginUsed = this.account ? this.safeNumber(this.account.marginUsed, 0) : 0;
      const positionSize = this.safeNumber(signal.positionSize, 0);
      const leverage = Math.max(this.safeNumber(this.config?.defaultLeverage, 1), 1);
      const estimatedMargin = (positionSize * 100000) / leverage;
      projectedMarginUsage = balance > 0 ? ((marginUsed + estimatedMargin) / balance) * 100 : 100;
    }

    if (!Number.isFinite(projectedMarginUsage)) {
 HEAD
      projectedMarginUsage = getEffectiveMode(this.config) === 'PAPER' ? 0 : 100;

      projectedMarginUsage = this.getEffectiveMode() === 'PAPER' ? 0 : 100;
 51227e5 (Add rule-based paper trading engine)
    }

    const passed = projectedMarginUsage < maxMarginUsagePercent;

    return {
      name: 'MARGIN_USAGE',
      passed,
      value: `${projectedMarginUsage.toFixed(2)}%`,
      threshold: `${maxMarginUsagePercent}%`,
      message: passed
        ? `Projected margin usage ${projectedMarginUsage.toFixed(2)}% below limit ${maxMarginUsagePercent}%`
        : `MARGIN USAGE TOO HIGH: ${projectedMarginUsage.toFixed(2)}% >= ${maxMarginUsagePercent}%`
    };
  }

  async validatePositionSize(signal) {
    const balance = this.getAccountBalance();
    const riskPercent = this.safeNumber(signal.riskPercent, 0);
    const maxRiskPerTradePercent = this.safeNumber(this.config?.maxRiskPerTradePercent, 1);
    const riskAmount = balance * (riskPercent / 100);
    const maxRiskAmount = balance * (maxRiskPerTradePercent / 100);

    const passed = riskAmount <= maxRiskAmount && riskPercent <= maxRiskPerTradePercent;

    return {
      name: 'POSITION_SIZE',
      passed,
      value: `${riskPercent}% ($${riskAmount.toFixed(2)})`,
      threshold: `Max ${maxRiskPerTradePercent}% ($${maxRiskAmount.toFixed(2)})`,
      message: passed
        ? `Position size risk ${riskPercent}% within limit ${maxRiskPerTradePercent}%`
        : `POSITION SIZE RISK TOO HIGH: ${riskPercent}% > ${maxRiskPerTradePercent}%`
    };
  }

  async checkMartingalePrevention() {
    const recentLosses = this.riskState.consecutiveLosses;
    const passed = recentLosses < 3;

    return {
      name: 'MARTINGALE_PREVENTION',
      passed,
      value: `${recentLosses} consecutive losses`,
      threshold: '< 3',
      message: passed
        ? `${recentLosses} consecutive losses - martingale check passed`
        : `MARTINGALE PREVENTION: ${recentLosses} consecutive losses - cooling off period active`
    };
  }

  async checkRevengeTrading() {
    const recentLosses = this.riskState.consecutiveLosses;
    const passed = this.getEffectiveMode() === 'PAPER' ? recentLosses < 5 : recentLosses < 2;

    return {
      name: 'REVENGE_TRADING',
      passed,
      value: `${recentLosses} consecutive losses`,
      threshold: this.getEffectiveMode() === 'PAPER' ? '< 5 in PAPER' : '< 2',
      message: passed
        ? 'Revenge trading check passed'
        : `REVENGE TRADING PREVENTION: ${recentLosses} consecutive losses - emotional trading risk detected`
    };
  }

  checkMarketOpen(pair) {
    const { isMarketOpen } = require('../../utils/helpers');
    const passed = isMarketOpen(pair);

    return {
      name: 'MARKET_OPEN',
      passed,
      value: passed ? 'OPEN' : 'CLOSED',
      threshold: 'OPEN',
      message: passed ? `Market is open for ${pair}` : `MARKET CLOSED for ${pair}`
    };
  }

  async getAccountSnapshot() {
    const balance = this.getAccountBalance();
    const equity = this.getAccountEquity();

    return {
      balance,
      equity,
      marginUsed: this.account?.marginUsed || 0,
      freeMargin: this.account?.freeMargin || equity,
      marginLevel: this.account?.marginLevel || 0,
      openTrades: this.riskState.openTrades.length,
      dailyPnl: this.riskState.dailyPnl,
      weeklyPnl: this.riskState.weeklyPnl,
      monthlyPnl: this.riskState.monthlyPnl,
      totalDrawdown: balance > 0 ? ((balance - equity) / balance) * 100 : 0,
      maxDrawdown: this.account?.paperMaxDrawdown || 0
    };
  }

  async triggerKillSwitch(reason, triggeredBy = null) {
    logger.critical(`KILL SWITCH TRIGGERED: ${reason}`);

    if (this.config) this.config.killSwitchTriggered = true;
    if (this.config) this.config.killSwitchReason = reason;
    if (this.config) this.config.killSwitchTriggeredAt = new Date();
    if (this.config) this.config.killSwitchTriggeredBy = triggeredBy;
    if (this.config) await this.config.save();

    const openTrades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } });
    for (const trade of openTrades) {
      trade.status = 'CLOSED';
      trade.exitReason = 'KILL_SWITCH';
      trade.closedAt = new Date();
      await trade.save();
    }

    await RiskLog.create({
      type: 'KILL_SWITCH',
      level: 'CRITICAL',
      details: {
        checkName: 'EMERGENCY_KILL_SWITCH',
        passed: false,
        message: reason
      },
      actionTaken: 'ALL_TRADES_CLOSED',
      accountSnapshot: await this.getAccountSnapshot()
    });

    await this.sendAlert('KILL_SWITCH', `EMERGENCY: Kill switch activated. Reason: ${reason}. All trades closed.`);

    return {
      success: true,
      closedTrades: openTrades.length,
      reason
    };
  }

  async resetKillSwitch(userId) {
    if (this.config) this.config.killSwitchTriggered = false;
    if (this.config) this.config.killSwitchReason = null;
    if (this.config) this.config.killSwitchTriggeredAt = null;
    if (this.config) this.config.killSwitchTriggeredBy = null;
    if (this.config) await this.config.save();

    logger.info(`Kill switch reset by user ${userId}`);

    await RiskLog.create({
      type: 'KILL_SWITCH',
      level: 'INFO',
      details: {
        checkName: 'KILL_SWITCH_RESET',
        passed: true,
        message: 'Kill switch manually reset'
      },
      actionTaken: 'KILL_SWITCH_RESET'
    });

    return { success: true };
  }

  async sendAlert(type, message) {
    logger.warn(`ALERT [${type}]: ${message}`);
  }

  async updateRiskState() {
    await this.loadRiskState();

    const balance = this.getAccountBalance();

 HEAD
    if (this.riskState.dailyLoss >= balance * (this.safeNumber(this.config?.dailyMaxLossPercent, 2) / 100)) {

    if (this.riskState.dailyLoss >= balance * (this.safeNumber(this.config.dailyMaxLossPercent, 3) / 100)) {
 51227e5 (Add rule-based paper trading engine)
      await this.triggerKillSwitch('Daily loss limit reached');
    }

    if (this.riskState.weeklyLoss >= balance * (this.safeNumber(this.config?.weeklyMaxLossPercent, 5) / 100)) {
      await this.triggerKillSwitch('Weekly loss limit reached');
    }

    if (this.riskState.consecutiveLosses >= 5) {
      await this.triggerKillSwitch('5 consecutive losses - system cooling off');
    }
  }
}

module.exports = new RiskEngine();
