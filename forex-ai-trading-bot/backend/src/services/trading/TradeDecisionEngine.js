const logger = require('../../utils/logger');
const { Signal, BotConfig, Trade, BrokerAccount } = require('../../models');
const { generateId, calculatePositionSize, getPipValue, priceToPips, pipsToPrice, roundToDecimals } = require('../../utils/helpers');
const riskEngine = require('../risk/RiskEngine');
const technicalAnalysis = require('../analysis/TechnicalAnalysisEngine');
const fundamentalAnalysis = require('../analysis/FundamentalAnalysisEngine');
const aiEngine = require('../ai/AIReasoningEngine');
const brokerLayer = require('../broker/BrokerAbstractionLayer');

class TradeDecisionEngine {
  constructor() {
    this.isRunning = false;
    this.config = null;
  }

  async initialize() {
    this.config = await BotConfig.findOne().sort({ updatedAt: -1 });
    await riskEngine.initialize();
    await aiEngine.initialize();
    await brokerLayer.initialize();
    logger.info('Trade Decision Engine initialized');
  }

  async analyzeAndDecide(pair) {
    try {
      logger.info(`Starting analysis for ${pair}`);

      // 1. Collect market data
      const marketData = await this.getMarketData(pair);

      // 2. Technical Analysis
      const technical = await technicalAnalysis.analyze(pair);

      // 3. Fundamental Analysis
      const fundamental = await fundamentalAnalysis.analyze(pair);

      // 4. News Analysis
      const news = await this.analyzeNews(pair);

      // 5. AI Reasoning
      const aiResult = await aiEngine.generateMarketSummary(pair, technical, fundamental, news);

      // 6. Build Signal
      const signal = await this.buildSignal(pair, marketData, technical, fundamental, news, aiResult);

      // 7. Risk Validation
      const riskValidation = await riskEngine.validateTrade(signal, marketData);

      // 8. Final Decision
      const decision = await this.makeFinalDecision(signal, riskValidation);

      // 9. Log everything
      await this.logDecision(decision, signal, riskValidation);

      return decision;

    } catch (error) {
      logger.error(`Analysis error for ${pair}: ${error.message}`);
      return {
        decision: 'NO_TRADE',
        pair,
        reason: `Analysis error: ${error.message}`,
        rejectionReason: error.message,
        confidence: 0
      };
    }
  }

  async getMarketData(pair) {
    const { MarketData } = require('../../models');
    const latest = await MarketData.findOne({ pair }).sort({ timestamp: -1 });

    if (!latest) {
      // Generate mock data for development
      return {
        pair,
        bid: 1.0850,
        ask: 1.0852,
        spread: 0.0002,
        spreadPips: 2,
        timestamp: new Date(),
        session: 'LONDON',
        volatility: 0.5,
        volatilityRegime: 'NORMAL',
        liquidity: 'HIGH',
        latencyMs: 50
      };
    }

    return latest;
  }

  async analyzeNews(pair) {
    const { NewsEvent } = require('../../models');
    const now = new Date();
    const bufferBefore = (this.config?.newsBufferMinutesBefore || 30) * 60 * 1000;
    const bufferAfter = (this.config?.newsBufferMinutesAfter || 60) * 60 * 1000;

    const upcomingNews = await NewsEvent.find({
      $or: [
        { currency: pair.split('/')[0] },
        { currency: pair.split('/')[1] },
        { currency: 'ALL' }
      ],
      scheduledTime: {
        $gte: new Date(now.getTime() - bufferAfter),
        $lte: new Date(now.getTime() + bufferBefore)
      },
      isStale: false
    }).sort({ scheduledTime: 1 });

    const recentNews = await NewsEvent.find({
      $or: [
        { currency: pair.split('/')[0] },
        { currency: pair.split('/')[1] },
        { currency: 'ALL' }
      ],
      scheduledTime: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      isStale: false
    }).sort({ scheduledTime: -1 }).limit(10);

    const highImpactNews = upcomingNews.filter(n => n.impact === 'HIGH');
    const newsSafe = highImpactNews.length === 0;

    return {
      upcomingEvents: upcomingNews,
      recentEvents: recentNews,
      highImpactCount: highImpactNews.length,
      newsSafe,
      nextEvent: upcomingNews[0] || null,
      newsImpactScore: highImpactNews.reduce((sum, n) => sum + (n.impactScore || 0), 0)
    };
  }

  async buildSignal(pair, marketData, technical, fundamental, news, aiResult) {
    const latestPrice = (marketData.bid + marketData.ask) / 2;
    const tf1h = technical.timeframes['1h'] || technical.timeframes['15m'];

    if (!tf1h) {
      throw new Error('No timeframe data available');
    }

    // Determine direction from AI and technical
    let direction = aiResult.finalRecommendation || 'NO_TRADE';

    // Override if technical strongly disagrees
    const techAlignment = technical.alignment;
    if (techAlignment) {
      if (techAlignment.alignment === 'STRONG_BULLISH' && direction === 'SELL') {
        direction = 'NO_TRADE'; // Conflict
      } else if (techAlignment.alignment === 'STRONG_BEARISH' && direction === 'BUY') {
        direction = 'NO_TRADE'; // Conflict
      }
    }

    // Calculate levels
    const atr = tf1h.atr || 0.0010;
    const pipValue = getPipValue(pair);

    let entryPrice = latestPrice;
    let stopLoss, takeProfit;

    if (direction === 'BUY') {
      // Use support or ATR-based stop
      const support = tf1h.supportResistance?.supports?.[0] || (latestPrice - atr * 1.5);
      stopLoss = Math.min(support, latestPrice - atr * 1.5);

      // Risk-reward based take profit
      const risk = latestPrice - stopLoss;
      takeProfit = latestPrice + (risk * (this.config?.minRiskReward || 2));

      // Check resistance
      const resistance = tf1h.supportResistance?.resistances?.[0];
      if (resistance && takeProfit > resistance * 1.005) {
        takeProfit = resistance; // Cap at resistance
      }
    } else if (direction === 'SELL') {
      const resistance = tf1h.supportResistance?.resistances?.[0] || (latestPrice + atr * 1.5);
      stopLoss = Math.max(resistance, latestPrice + atr * 1.5);

      const risk = stopLoss - latestPrice;
      takeProfit = latestPrice - (risk * (this.config?.minRiskReward || 2));

      const support = tf1h.supportResistance?.supports?.[0];
      if (support && takeProfit < support * 0.995) {
        takeProfit = support;
      }
    }

    // Round to proper decimals
    const decimals = pair.includes('JPY') ? 3 : 5;
    entryPrice = roundToDecimals(entryPrice, decimals);
    stopLoss = roundToDecimals(stopLoss, decimals);
    takeProfit = roundToDecimals(takeProfit, decimals);

    // Calculate risk-reward
    const riskAmount = direction === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice;
    const rewardAmount = direction === 'BUY' ? takeProfit - entryPrice : entryPrice - takeProfit;
    const riskReward = riskAmount > 0 ? rewardAmount / riskAmount : 0;

    // Calculate position size
    const account = await BrokerAccount.findOne({ isActive: true });
    const balance = this.config?.mode === 'PAPER' ? 
      (account?.paperBalance || 100000) : 
      (account?.balance || 100000);

    const riskPercent = this.config?.riskPerTradePercent || 0.5;
    const stopLossPips = priceToPips(riskAmount, pair);

    const positionCalc = calculatePositionSize({
      accountBalance: balance,
      riskPercent,
      stopLossPips,
      pipValue,
      pair,
      leverage: this.config?.defaultLeverage || 30
    });

    const confidence = Math.min(
      (aiResult.confidencePercentage || 50),
      (technical.alignment?.aligned ? 80 : 50),
      (fundamental.relativeStrength?.score ? Math.abs(fundamental.relativeStrength.score) * 10 + 50 : 50)
    );

    const signalId = generateId();

    return {
      signalId,
      pair,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward: Math.round(riskReward * 100) / 100,
      riskPercent,
      positionSize: positionCalc.lotSize,
      confidence: Math.round(confidence),

      technicalAnalysis: {
        trend: tf1h.trend,
        structure: tf1h.structure?.structure,
        ...tf1h.ema,
        rsi: tf1h.rsi,
        macd: tf1h.macd?.macd,
        macdSignal: tf1h.macd?.signal,
        atr: tf1h.atr,
        bollingerUpper: tf1h.bollinger?.upper,
        bollingerLower: tf1h.bollinger?.lower,
        supportLevels: tf1h.supportResistance?.supports,
        resistanceLevels: tf1h.supportResistance?.resistances,
        fibLevels: tf1h.fibonacci,
        isBreakout: false,
        isFakeBreakout: false,
        momentum: tf1h.momentum,
        volatilityRegime: tf1h.volatility?.regime,
        liquidityZone: tf1h.liquidity?.above ? 'ABOVE' : tf1h.liquidity?.below ? 'BELOW' : 'NEUTRAL',
        smcOrderBlocks: tf1h.smc?.orderBlocks,
        smcFVGs: tf1h.smc?.fvgs,
        smcLiquiditySweep: tf1h.smc?.liquiditySweep,
        smcBOS: tf1h.smc?.bos,
        smcCHoCH: tf1h.smc?.choch
      },

      fundamentalAnalysis: {
        interestRateDirection: fundamental.baseCurrency?.interestRateDirection,
        inflationTrend: fundamental.baseCurrency?.inflationTrend,
        employmentStrength: fundamental.baseCurrency?.employmentStrength,
        gdpGrowth: fundamental.baseCurrency?.gdpGrowth,
        centralBankTone: fundamental.baseCurrency?.centralBankTone,
        currencyStrengthMatrix: fundamental.relativeStrength,
        usdIndexCorrelation: 0,
        goldCorrelation: 0,
        riskSentiment: fundamental.sentiment?.riskOnRiskOff
      },

      newsAnalysis: {
        upcomingEvents: news.upcomingEvents,
        recentEvents: news.recentEvents,
        newsImpactScore: news.newsImpactScore,
        newsSafe: news.newsSafe,
        newsWarnings: news.highImpactCount > 0 ? [`${news.highImpactCount} high-impact events nearby`] : []
      },

      aiAnalysis: aiResult,

      timeframeAlignment: {
        ...Object.fromEntries(Object.entries(technical.timeframes).map(([k, v]) => [k, v?.trend])),
        aligned: technical.alignment?.aligned || false
      },

      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 min expiry
    };
  }

  async makeFinalDecision(signal, riskValidation) {
    // If risk validation failed, NO_TRADE
    if (!riskValidation.passed) {
      return {
        decision: 'NO_TRADE',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'Risk validation failed',
        rejectionReason: riskValidation.rejectionReasons.join('; '),
        signalId: signal.signalId
      };
    }

    // If AI says NO_TRADE or WAIT, respect it
    if (signal.aiAnalysis?.finalRecommendation === 'NO_TRADE' || 
        signal.aiAnalysis?.finalRecommendation === 'WAIT') {
      return {
        decision: 'NO_TRADE',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'AI recommendation: NO_TRADE/WAIT',
        rejectionReason: signal.aiAnalysis?.reasonToAvoid || 'AI analysis suggests waiting',
        signalId: signal.signalId
      };
    }

    // If confidence too low
    if (signal.confidence < (this.config?.minConfidenceScore || 65)) {
      return {
        decision: 'NO_TRADE',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'Confidence too low',
        rejectionReason: `Confidence ${signal.confidence}% below minimum ${this.config?.minConfidenceScore || 65}%`,
        signalId: signal.signalId
      };
    }

    // If risk-reward too low
    if (signal.riskReward < (this.config?.minRiskReward || 2)) {
      return {
        decision: 'NO_TRADE',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'Risk-reward too low',
        rejectionReason: `RR ${signal.riskReward} below minimum ${this.config?.minRiskReward || 2}`,
        signalId: signal.signalId
      };
    }

    // Check mode
    if (this.config?.mode === 'LEARNING') {
      return {
        decision: 'WAIT',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'LEARNING_MODE - Analysis only, no trades',
        rejectionReason: 'System in learning mode',
        signalId: signal.signalId
      };
    }

    // Human approval mode
    if (this.config?.mode === 'HUMAN_APPROVAL') {
      // Save signal for approval
      await Signal.create({
        ...signal,
        status: 'PENDING'
      });

      return {
        decision: 'WAIT',
        pair: signal.pair,
        entry: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskReward: signal.riskReward,
        riskPercent: signal.riskPercent,
        positionSize: signal.positionSize,
        confidence: signal.confidence,
        reason: 'HUMAN_APPROVAL_MODE - Awaiting admin approval',
        rejectionReason: '',
        signalId: signal.signalId
      };
    }

    // All checks passed - APPROVED for execution
    return {
      decision: signal.direction,
      pair: signal.pair,
      entry: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      riskReward: signal.riskReward,
      riskPercent: signal.riskPercent,
      positionSize: signal.positionSize,
      confidence: signal.confidence,
      reason: `All validation passed. ${signal.aiAnalysis?.tradeThesis || 'Technical and fundamental alignment confirmed.'}`,
      rejectionReason: '',
      signalId: signal.signalId
    };
  }

  async executeApprovedTrade(decision) {
    if (decision.decision !== 'BUY' && decision.decision !== 'SELL') {
      return null;
    }

    try {
      const mode = this.config?.mode === 'PAPER' ? 'PAPER' : 
                   this.config?.mode === 'DEMO' ? 'DEMO' : 'LIVE';

      const tradeResult = await brokerLayer.executeTrade({
        pair: decision.pair,
        direction: decision.decision,
        entryPrice: decision.entry,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit,
        positionSize: decision.positionSize,
        riskPercent: decision.riskPercent
      }, mode);

      // Save trade
      const trade = await Trade.create({
        tradeId: tradeResult.tradeId,
        signalId: decision.signalId,
        pair: decision.pair,
        direction: decision.decision,
        entryPrice: decision.entry,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit,
        riskReward: decision.riskReward,
        riskPercent: decision.riskPercent,
        positionSize: decision.positionSize,
        status: 'OPEN',
        mode,
        broker: tradeResult.broker,
        brokerTicket: tradeResult.brokerTicket,
        createdAt: new Date()
      });

      // Update signal status
      await Signal.findOneAndUpdate(
        { signalId: decision.signalId },
        { status: 'EXECUTED' }
      );

      logger.info(`Trade executed: ${trade.tradeId} ${decision.pair} ${decision.decision}`);

      return trade;

    } catch (error) {
      logger.error(`Trade execution failed: ${error.message}`);
      throw error;
    }
  }

  async logDecision(decision, signal, riskValidation) {
    // Save signal regardless of outcome
    const existingSignal = await Signal.findOne({ signalId: signal.signalId });
    if (!existingSignal) {
      await Signal.create({
        ...signal,
        riskCheck: riskValidation,
        status: decision.decision === 'BUY' || decision.decision === 'SELL' ? 'APPROVED' : 
                decision.decision === 'WAIT' ? 'PENDING' : 'REJECTED',
        rejectionReason: decision.rejectionReason || ''
      });
    }

    logger.info(`Decision for ${signal.pair}: ${decision.decision} - ${decision.reason}`);
  }

  async runAnalysisCycle(pairs) {
    if (this.isRunning) {
      logger.warn('Analysis cycle already running');
      return;
    }

    this.isRunning = true;

    try {
      for (const pair of pairs) {
        const decision = await this.analyzeAndDecide(pair);

        if (decision.decision === 'BUY' || decision.decision === 'SELL') {
          await this.executeApprovedTrade(decision);
        }

        // Small delay between pairs
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new TradeDecisionEngine();