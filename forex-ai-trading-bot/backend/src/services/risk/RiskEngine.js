const logger = require('../../utils/logger');
const { RiskLog, BotConfig, Trade, BrokerAccount } = require('../../models');

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

  async loadRiskState() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Calculate daily P&L
    const dailyTrades = await Trade.find({
      closedAt: { $gte: today },
      status: 'CLOSED'
    });

    this.riskState.dailyPnl = dailyTrades.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);
    this.riskState.dailyLoss = dailyTrades
      .filter(t => t.monetaryPnl < 0)
      .reduce((sum, t) => sum + Math.abs(t.monetaryPnl || 0), 0);

    // Calculate weekly P&L
    const weeklyTrades = await Trade.find({
      closedAt: { $gte: weekStart },
      status: 'CLOSED'
    });

    this.riskState.weeklyPnl = weeklyTrades.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);
    this.riskState.weeklyLoss = weeklyTrades
      .filter(t => t.monetaryPnl < 0)
      .reduce((sum, t) => sum + Math.abs(t.monetaryPnl || 0), 0);

    // Calculate monthly P&L
    const monthlyTrades = await Trade.find({
      closedAt: { $gte: monthStart },
      status: 'CLOSED'
    });

    this.riskState.monthlyPnl = monthlyTrades.reduce((sum, t) => sum + (t.monetaryPnl || 0), 0);
    this.riskState.monthlyLoss = monthlyTrades
      .filter(t => t.monetaryPnl < 0)
      .reduce((sum, t) => sum + Math.abs(t.monetaryPnl || 0), 0);

    // Get open trades
    this.riskState.openTrades = await Trade.find({
      status: { $in: ['OPEN', 'PENDING'] }
    });

    // Calculate consecutive losses
    const recentTrades = await Trade.find({
      status: 'CLOSED'
    }).sort({ closedAt: -1 }).limit(20);

    let consecutiveLosses = 0;
    for (const trade of recentTrades) {
      if (trade.monetaryPnl < 0) {
        consecutiveLosses++;
      } else {
        break;
      }
    }
    this.riskState.consecutiveLosses = consecutiveLosses;
  }

  async validateTrade(signal, marketData) {
    const checks = [];
    const rejectionReasons = [];

    try {
      // 1. Kill Switch Check
      const killSwitchCheck = await this.checkKillSwitch();
      checks.push(killSwitchCheck);
      if (!killSwitchCheck.passed) rejectionReasons.push(killSwitchCheck.message);

      // 2. Mode Check
      const modeCheck = await this.checkTradingMode();
      checks.push(modeCheck);
      if (!modeCheck.passed) rejectionReasons.push(modeCheck.message);

      // 3. Daily Loss Limit
      const dailyLossCheck = await this.checkDailyLossLimit();
      checks.push(dailyLossCheck);
      if (!dailyLossCheck.passed) rejectionReasons.push(dailyLossCheck.message);

      // 4. Weekly Loss Limit
      const weeklyLossCheck = await this.checkWeeklyLossLimit();
      checks.push(weeklyLossCheck);
      if (!weeklyLossCheck.passed) rejectionReasons.push(weeklyLossCheck.message);

      // 5. Monthly Loss Limit
      const monthlyLossCheck = await this.checkMonthlyLossLimit();
      checks.push(monthlyLossCheck);
      if (!monthlyLossCheck.passed) rejectionReasons.push(monthlyLossCheck.message);

      // 6. Max Open Trades
      const maxTradesCheck = await this.checkMaxOpenTrades(signal.pair);
      checks.push(maxTradesCheck);
      if (!maxTradesCheck.passed) rejectionReasons.push(maxTradesCheck.message);

      // 7. Max Correlated Trades
      const correlationCheck = await this.checkCorrelatedTrades(signal.pair);
      checks.push(correlationCheck);
      if (!correlationCheck.passed) rejectionReasons.push(correlationCheck.message);

      // 8. Risk-Reward Ratio
      const rrCheck = this.checkRiskReward(signal);
      checks.push(rrCheck);
      if (!rrCheck.passed) rejectionReasons.push(rrCheck.message);

      // 9. Stop Loss Mandatory
      const slCheck = this.checkStopLoss(signal);
      checks.push(slCheck);
      if (!slCheck.passed) rejectionReasons.push(slCheck.message);

      // 10. Take Profit Mandatory
      const tpCheck = this.checkTakeProfit(signal);
      checks.push(tpCheck);
      if (!tpCheck.passed) rejectionReasons.push(tpCheck.message);

      // 11. Spread Check
      const spreadCheck = this.checkSpread(marketData);
      checks.push(spreadCheck);
      if (!spreadCheck.passed) rejectionReasons.push(spreadCheck.message);

      // 12. Volatility Check
      const volatilityCheck = this.checkVolatility(marketData);
      checks.push(volatilityCheck);
      if (!volatilityCheck.passed) rejectionReasons.push(volatilityCheck.message);

      // 13. Liquidity Check
      const liquidityCheck = this.checkLiquidity(marketData);
      checks.push(liquidityCheck);
      if (!liquidityCheck.passed) rejectionReasons.push(liquidityCheck.message);

      // 14. News Safety Check
      const newsCheck = await this.checkNewsSafety(signal.pair);
      checks.push(newsCheck);
      if (!newsCheck.passed) rejectionReasons.push(newsCheck.message);

      // 15. Confidence Score Check
      const confidenceCheck = this.checkConfidence(signal);
      checks.push(confidenceCheck);
      if (!confidenceCheck.passed) rejectionReasons.push(confidenceCheck.message);

      // 16. API Latency Check
      const latencyCheck = this.checkApiLatency(marketData);
      checks.push(latencyCheck);
      if (!latencyCheck.passed) rejectionReasons.push(latencyCheck.message);

      // 17. Broker Health Check
      const brokerCheck = await this.checkBrokerHealth();
      checks.push(brokerCheck);
      if (!brokerCheck.passed) rejectionReasons.push(brokerCheck.message);

      // 18. Drawdown Check
      const drawdownCheck = await this.checkDrawdown();
      checks.push(drawdownCheck);
      if (!drawdownCheck.passed) rejectionReasons.push(drawdownCheck.message);

      // 19. Margin Check
      const marginCheck = await this.checkMargin(signal);
      checks.push(marginCheck);
      if (!marginCheck.passed) rejectionReasons.push(marginCheck.message);

      // 20. Position Size Validation
      const positionSizeCheck = await this.validatePositionSize(signal);
      checks.push(positionSizeCheck);
      if (!positionSizeCheck.passed) rejectionReasons.push(positionSizeCheck.message);

      // 21. Martingale Prevention
      const martingaleCheck = await this.checkMartingalePrevention(signal);
      checks.push(martingaleCheck);
      if (!martingaleCheck.passed) rejectionReasons.push(martingaleCheck.message);

      // 22. Revenge Trading Prevention
      const revengeCheck = await this.checkRevengeTrading();
      checks.push(revengeCheck);
      if (!revengeCheck.passed) rejectionReasons.push(revengeCheck.message);

      // 23. Market Open Check
      const marketOpenCheck = this.checkMarketOpen(signal.pair);
      checks.push(marketOpenCheck);
      if (!marketOpenCheck.passed) rejectionReasons.push(marketOpenCheck.message);

      const allPassed = checks.every(c => c.passed);

      // Log risk check
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
    const passed = !this.config.killSwitchTriggered;
    return {
      name: 'KILL_SWITCH',
      passed,
      value: this.config.killSwitchTriggered,
      threshold: false,
      message: passed ? 'Kill switch not triggered' : `KILL SWITCH ACTIVE: ${this.config.killSwitchReason}`
    };
  }

  async checkTradingMode() {
    const allowedModes = ['PAPER', 'DEMO', 'HUMAN_APPROVAL', 'LIVE_AUTO'];
    const passed = allowedModes.includes(this.config.mode);
    return {
      name: 'TRADING_MODE',
      passed,
      value: this.config.mode,
      threshold: allowedModes,
      message: passed ? `Mode ${this.config.mode} allows trading` : `Mode ${this.config.mode} does not allow trading`
    };
  }

  async checkDailyLossLimit() {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const dailyLossPercent = balance > 0 ? (this.riskState.dailyLoss / balance) * 100 : 0;
    const passed = dailyLossPercent < this.config.dailyMaxLossPercent;

    return {
      name: 'DAILY_LOSS_LIMIT',
      passed,
      value: `${dailyLossPercent.toFixed(2)}%`,
      threshold: `${this.config.dailyMaxLossPercent}%`,
      message: passed 
        ? `Daily loss ${dailyLossPercent.toFixed(2)}% below limit ${this.config.dailyMaxLossPercent}%`
        : `DAILY LOSS LIMIT REACHED: ${dailyLossPercent.toFixed(2)}% >= ${this.config.dailyMaxLossPercent}%`
    };
  }

  async checkWeeklyLossLimit() {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const weeklyLossPercent = balance > 0 ? (this.riskState.weeklyLoss / balance) * 100 : 0;
    const passed = weeklyLossPercent < this.config.weeklyMaxLossPercent;

    return {
      name: 'WEEKLY_LOSS_LIMIT',
      passed,
      value: `${weeklyLossPercent.toFixed(2)}%`,
      threshold: `${this.config.weeklyMaxLossPercent}%`,
      message: passed 
        ? `Weekly loss ${weeklyLossPercent.toFixed(2)}% below limit ${this.config.weeklyMaxLossPercent}%`
        : `WEEKLY LOSS LIMIT REACHED: ${weeklyLossPercent.toFixed(2)}% >= ${this.config.weeklyMaxLossPercent}%`
    };
  }

  async checkMonthlyLossLimit() {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const monthlyLossPercent = balance > 0 ? (this.riskState.monthlyLoss / balance) * 100 : 0;
    const passed = monthlyLossPercent < (this.config.monthlyMaxLossPercent || 10);

    return {
      name: 'MONTHLY_LOSS_LIMIT',
      passed,
      value: `${monthlyLossPercent.toFixed(2)}%`,
      threshold: `${this.config.monthlyMaxLossPercent || 10}%`,
      message: passed 
        ? `Monthly loss ${monthlyLossPercent.toFixed(2)}% below limit ${this.config.monthlyMaxLossPercent || 10}%`
        : `MONTHLY LOSS LIMIT REACHED: ${monthlyLossPercent.toFixed(2)}% >= ${this.config.monthlyMaxLossPercent || 10}%`
    };
  }

  async checkMaxOpenTrades(pair) {
    const openTradesCount = this.riskState.openTrades.length;
    const passed = openTradesCount < this.config.maxOpenTrades;

    return {
      name: 'MAX_OPEN_TRADES',
      passed,
      value: openTradesCount,
      threshold: this.config.maxOpenTrades,
      message: passed 
        ? `Open trades ${openTradesCount} below limit ${this.config.maxOpenTrades}`
        : `MAX OPEN TRADES REACHED: ${openTradesCount} >= ${this.config.maxOpenTrades}`
    };
  }

  async checkCorrelatedTrades(pair) {
    const baseCurrency = pair.split('/')[0];
    const correlatedPairs = this.riskState.openTrades.filter(t => 
      t.pair.startsWith(baseCurrency) || t.pair.endsWith(baseCurrency)
    );
    const passed = correlatedPairs.length < this.config.maxCorrelatedTrades;

    return {
      name: 'MAX_CORRELATED_TRADES',
      passed,
      value: correlatedPairs.length,
      threshold: this.config.maxCorrelatedTrades,
      message: passed 
        ? `Correlated trades ${correlatedPairs.length} below limit ${this.config.maxCorrelatedTrades}`
        : `MAX CORRELATED TRADES REACHED for ${baseCurrency}: ${correlatedPairs.length} >= ${this.config.maxCorrelatedTrades}`
    };
  }

  checkRiskReward(signal) {
    const rr = signal.riskReward || 0;
    const passed = rr >= this.config.minRiskReward;

    return {
      name: 'MIN_RISK_REWARD',
      passed,
      value: rr.toFixed(2),
      threshold: this.config.minRiskReward,
      message: passed 
        ? `Risk-Reward ${rr.toFixed(2)} meets minimum ${this.config.minRiskReward}`
        : `RISK-REWARD TOO LOW: ${rr.toFixed(2)} < ${this.config.minRiskReward}`
    };
  }

  checkStopLoss(signal) {
    const passed = signal.stopLoss !== null && signal.stopLoss !== undefined && signal.stopLoss > 0;

    return {
      name: 'STOP_LOSS_MANDATORY',
      passed,
      value: signal.stopLoss || 'MISSING',
      threshold: 'REQUIRED',
      message: passed 
        ? `Stop loss set at ${signal.stopLoss}`
        : 'STOP LOSS IS MANDATORY - NO TRADE WITHOUT STOP LOSS'
    };
  }

  checkTakeProfit(signal) {
    const passed = signal.takeProfit !== null && signal.takeProfit !== undefined && signal.takeProfit > 0;

    return {
      name: 'TAKE_PROFIT_MANDATORY',
      passed,
      value: signal.takeProfit || 'MISSING',
      threshold: 'REQUIRED',
      message: passed 
        ? `Take profit set at ${signal.takeProfit}`
        : 'TAKE PROFIT IS MANDATORY - NO TRADE WITHOUT TAKE PROFIT'
    };
  }

  checkSpread(marketData) {
    const spreadPips = marketData.spreadPips || 0;
    const maxSpread = 3.0; // Maximum 3 pips
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
    const regime = marketData.volatilityRegime || 'NORMAL';
    const passed = regime !== 'EXTREME';

    return {
      name: 'VOLATILITY_CHECK',
      passed,
      value: regime,
      threshold: 'NOT EXTREME',
      message: passed 
        ? `Volatility regime ${regime} acceptable`
        : `VOLATILITY EXTREME - AVOIDING TRADE`
    };
  }

  checkLiquidity(marketData) {
    const liquidity = marketData.liquidity || 'NORMAL';
    const passed = liquidity !== 'LOW';

    return {
      name: 'LIQUIDITY_CHECK',
      passed,
      value: liquidity,
      threshold: 'NOT LOW',
      message: passed 
        ? `Liquidity ${liquidity} acceptable`
        : `LIQUIDITY TOO LOW - AVOIDING TRADE`
    };
  }

  async checkNewsSafety(pair) {
    const { NewsEvent } = require('../../models');
    const now = new Date();
    const bufferBefore = this.config.newsBufferMinutesBefore * 60 * 1000;
    const bufferAfter = this.config.newsBufferMinutesAfter * 60 * 1000;

    const upcomingNews = await NewsEvent.find({
      $or: [
        { currency: pair.split('/')[0] },
        { currency: pair.split('/')[1] },
        { currency: 'ALL' }
      ],
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
    const confidence = signal.confidence || 0;
    const passed = confidence >= this.config.minConfidenceScore;

    return {
      name: 'MIN_CONFIDENCE',
      passed,
      value: `${confidence}%`,
      threshold: `${this.config.minConfidenceScore}%`,
      message: passed 
        ? `Confidence ${confidence}% meets minimum ${this.config.minConfidenceScore}%`
        : `CONFIDENCE TOO LOW: ${confidence}% < ${this.config.minConfidenceScore}%`
    };
  }

  checkApiLatency(marketData) {
    const latency = marketData.latencyMs || 0;
    const maxLatency = 500; // 500ms max
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
    const passed = isHealthy || this.config.mode === 'PAPER';

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
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const equity = this.account ? (this.config.mode === 'PAPER' ? this.account.paperEquity : this.account.equity) : 100000;
    const drawdown = balance > 0 ? ((balance - equity) / balance) * 100 : 0;
    const passed = drawdown < this.config.maxDrawdownPercent;

    return {
      name: 'MAX_DRAWDOWN',
      passed,
      value: `${drawdown.toFixed(2)}%`,
      threshold: `${this.config.maxDrawdownPercent}%`,
      message: passed 
        ? `Current drawdown ${drawdown.toFixed(2)}% below limit ${this.config.maxDrawdownPercent}%`
        : `DRAWDOWN LIMIT REACHED: ${drawdown.toFixed(2)}% >= ${this.config.maxDrawdownPercent}%`
    };
  }

  async checkMargin(signal) {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const marginUsed = this.account ? (this.config.mode === 'PAPER' ? 0 : this.account.marginUsed) : 0;

    const positionSize = signal.positionSize || 0;
    const leverage = this.config.defaultLeverage;
    const estimatedMargin = (positionSize * 100000) / leverage;
    const projectedMarginUsage = balance > 0 ? ((marginUsed + estimatedMargin) / balance) * 100 : 0;

    const passed = projectedMarginUsage < this.config.maxMarginUsagePercent;

    return {
      name: 'MARGIN_USAGE',
      passed,
      value: `${projectedMarginUsage.toFixed(2)}%`,
      threshold: `${this.config.maxMarginUsagePercent}%`,
      message: passed 
        ? `Projected margin usage ${projectedMarginUsage.toFixed(2)}% below limit ${this.config.maxMarginUsagePercent}%`
        : `MARGIN USAGE TOO HIGH: ${projectedMarginUsage.toFixed(2)}% >= ${this.config.maxMarginUsagePercent}%`
    };
  }

  async validatePositionSize(signal) {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const riskAmount = balance * (signal.riskPercent / 100);
    const maxRiskAmount = balance * (this.config.maxRiskPerTradePercent / 100);

    const passed = riskAmount <= maxRiskAmount && signal.riskPercent <= this.config.maxRiskPerTradePercent;

    return {
      name: 'POSITION_SIZE',
      passed,
      value: `${signal.riskPercent}% ($${riskAmount.toFixed(2)})`,
      threshold: `Max ${this.config.maxRiskPerTradePercent}% ($${maxRiskAmount.toFixed(2)})`,
      message: passed 
        ? `Position size risk ${signal.riskPercent}% within limit ${this.config.maxRiskPerTradePercent}%`
        : `POSITION SIZE RISK TOO HIGH: ${signal.riskPercent}% > ${this.config.maxRiskPerTradePercent}%`
    };
  }

  async checkMartingalePrevention(signal) {
    const recentLosses = this.riskState.consecutiveLosses;
    const passed = recentLosses < 3; // No new trades after 3 consecutive losses

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
    const passed = recentLosses < 2; // Extra caution after losses

    return {
      name: 'REVENGE_TRADING',
      passed,
      value: `${recentLosses} consecutive losses`,
      threshold: '< 2',
      message: passed 
        ? `Revenge trading check passed`
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
      message: passed 
        ? `Market is open for ${pair}`
        : `MARKET CLOSED for ${pair}`
    };
  }

  async getAccountSnapshot() {
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;
    const equity = this.account ? (this.config.mode === 'PAPER' ? this.account.paperEquity : this.account.equity) : 100000;

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

    this.config.killSwitchTriggered = true;
    this.config.killSwitchReason = reason;
    this.config.killSwitchTriggeredAt = new Date();
    this.config.killSwitchTriggeredBy = triggeredBy;
    await this.config.save();

    // Close all open trades
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

    // Send alerts
    await this.sendAlert('KILL_SWITCH', `EMERGENCY: Kill switch activated. Reason: ${reason}. All trades closed.`);

    return {
      success: true,
      closedTrades: openTrades.length,
      reason
    };
  }

  async resetKillSwitch(userId) {
    this.config.killSwitchTriggered = false;
    this.config.killSwitchReason = null;
    this.config.killSwitchTriggeredAt = null;
    this.config.killSwitchTriggeredBy = null;
    await this.config.save();

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
    // Implement alert sending (email, telegram, webhook)
    logger.warn(`ALERT [${type}]: ${message}`);

    // TODO: Integrate with notification service
    // await notificationService.send({ type, message, priority: 'CRITICAL' });
  }

  async updateRiskState(tradeResult) {
    await this.loadRiskState();

    // Auto kill switch triggers
    const balance = this.account ? (this.config.mode === 'PAPER' ? this.account.paperBalance : this.account.balance) : 100000;

    if (this.riskState.dailyLoss >= balance * (this.config.dailyMaxLossPercent / 100)) {
      await this.triggerKillSwitch('Daily loss limit reached');
    }

    if (this.riskState.weeklyLoss >= balance * (this.config.weeklyMaxLossPercent / 100)) {
      await this.triggerKillSwitch('Weekly loss limit reached');
    }

    if (this.riskState.consecutiveLosses >= 5) {
      await this.triggerKillSwitch('5 consecutive losses - system cooling off');
    }
  }
}

module.exports = new RiskEngine();
