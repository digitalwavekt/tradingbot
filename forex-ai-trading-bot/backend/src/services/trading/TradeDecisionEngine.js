const logger = require('../../utils/logger');
const mongoose = require('mongoose');
const { Signal, BotConfig, Trade, BrokerAccount } = require('../../models');
const {
  generateId,
  calculatePositionSize,
  getPipValue,
  priceToPips,
  roundToDecimals
} = require('../../utils/helpers');

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

      const marketData = await this.getMarketData(pair);
      const technical = await technicalAnalysis.analyze(pair);
      const fundamental = await fundamentalAnalysis.analyze(pair);
      const news = await this.analyzeNews(pair);
      const aiResult = await aiEngine.generateMarketSummary(pair, technical, fundamental, news);

      const signal = await this.buildSignal(pair, marketData, technical, fundamental, news, aiResult);

      if (!['BUY', 'SELL'].includes(signal.direction)) {
        const riskValidation = {
          passed: false,
          checks: [],
          rejectionReasons: [signal.aiAnalysis?.reasonToAvoid || `Signal direction is ${signal.direction}`]
        };

        const decision = await this.makeFinalDecision(signal, riskValidation);
        await this.logDecision(decision, signal, riskValidation);
        return decision;
      }

      const riskValidation = await riskEngine.validateTrade(signal, marketData);
      const decision = await this.makeFinalDecision(signal, riskValidation);

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

    const latestMarketData = await MarketData.findOne({ pair }).sort({ timestamp: -1 });

    const latestCandle = await mongoose.connection.db.collection('candledatas').findOne(
      { pair, timeframe: { $in: ['15m', '5m', '1m'] } },
      { sort: { timestamp: -1 } }
    );

    const candleClose = Number(latestCandle?.close);
    const candleHigh = Number(latestCandle?.high);
    const candleLow = Number(latestCandle?.low);

    const rawBid = Number(latestMarketData?.bid);
    const rawAsk = Number(latestMarketData?.ask);

    const marketMid = Number.isFinite(rawBid) && Number.isFinite(rawAsk) && rawBid > 0 && rawAsk > 0
      ? (rawBid + rawAsk) / 2
      : null;

    const shouldUseCandle = Number.isFinite(candleClose) && candleClose > 0 && (
      !marketMid ||
      marketMid < 10 ||
      Math.abs(marketMid - candleClose) / Math.max(candleClose, 1) > 0.25
    );

    if (shouldUseCandle) {
      const spread = Math.max(candleClose * 0.0005, 0.01);

      return {
        pair,
        bid: candleClose - spread / 2,
        ask: candleClose + spread / 2,
        close: candleClose,
        high: Number.isFinite(candleHigh) ? candleHigh : candleClose,
        low: Number.isFinite(candleLow) ? candleLow : candleClose,
        spread,
        spreadPips: 2,
        timestamp: latestCandle.timestamp || new Date(),
        session: 'NSE',
        volatility: latestMarketData?.volatility || 0.5,
        volatilityRegime: latestMarketData?.volatilityRegime || 'NORMAL',
        liquidity: latestMarketData?.liquidity || 'HIGH',
        latencyMs: latestMarketData?.latencyMs || 50,
        source: latestCandle.source || 'CANDLE_FALLBACK'
      };
    }

    if (latestMarketData) return latestMarketData;

    throw new Error(`No market/candle data available for ${pair}`);
  }

  async analyzeNews(pair) {
    const { NewsEvent } = require('../../models');
    const now = new Date();
    const bufferBefore = (this.config?.newsBufferMinutesBefore || 30) * 60 * 1000;
    const bufferAfter = (this.config?.newsBufferMinutesAfter || 60) * 60 * 1000;

    const parts = String(pair || '').split('/');
    const currencies = [parts[0], parts[1], 'ALL'].filter(Boolean);

    const upcomingNews = await NewsEvent.find({
      currency: { $in: currencies },
      scheduledTime: {
        $gte: new Date(now.getTime() - bufferAfter),
        $lte: new Date(now.getTime() + bufferBefore)
      },
      isStale: false
    }).sort({ scheduledTime: 1 });

    const recentNews = await NewsEvent.find({
      currency: { $in: currencies },
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

  getBestTimeframeData(technical) {
    const timeframes = technical?.timeframes || {};
    return timeframes['15m'] || timeframes['5m'] || timeframes['1m'] || Object.values(timeframes).find(Boolean);
  }

  getLatestPrice(marketData) {
    const bid = Number(marketData?.bid);
    const ask = Number(marketData?.ask);
    const close = Number(marketData?.close);

    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      return (bid + ask) / 2;
    }

    if (Number.isFinite(close) && close > 0) {
      return close;
    }

    return NaN;
  }

  calculateSignalConfidence(aiResult, technical, fundamental) {
    const aiConfidence = Number(aiResult?.confidencePercentage);
    const technicalConfidence = technical?.alignment?.aligned ? 80 : 55;

    const rawFundamentalScore = Number(fundamental?.relativeStrength?.score);
    const fundamentalConfidence = Number.isFinite(rawFundamentalScore)
      ? Math.max(40, Math.min(80, Math.abs(rawFundamentalScore) * 10 + 50))
      : 60;

    const confidence = Number.isFinite(aiConfidence)
      ? (aiConfidence * 0.55) + (technicalConfidence * 0.30) + (fundamentalConfidence * 0.15)
      : (technicalConfidence * 0.70) + (fundamentalConfidence * 0.30);

    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  async buildSignal(pair, marketData, technical, fundamental, news, aiResult) {
    const latestPrice = this.getLatestPrice(marketData);
    const tf = this.getBestTimeframeData(technical);

    if (!tf) throw new Error('No timeframe data available');

    if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
      throw new Error(`Invalid latest price for ${pair}`);
    }

    let direction = aiResult?.finalRecommendation || 'NO_TRADE';

    const techAlignment = technical.alignment;
    if (techAlignment) {
      if (techAlignment.alignment === 'STRONG_BULLISH' && direction === 'SELL') {
        direction = 'NO_TRADE';
      } else if (techAlignment.alignment === 'STRONG_BEARISH' && direction === 'BUY') {
        direction = 'NO_TRADE';
      }
    }

    let entryPrice = latestPrice;
    let stopLoss = null;
    let takeProfit = null;
    let riskReward = 0;
    let positionSize = 0;

    const atr = Number(tf.atr);
    const safeAtr = Number.isFinite(atr) && atr > 0 ? atr : Math.max(latestPrice * 0.005, 0.01);
    const minRiskReward = Number(this.config?.minRiskReward || 2);

    if (direction === 'BUY') {
      const support = Number(tf.supportResistance?.supports?.[0]);

      stopLoss = Number.isFinite(support) && support > 0
        ? Math.min(support, latestPrice - safeAtr * 1.5)
        : latestPrice - safeAtr * 1.5;

      const risk = latestPrice - stopLoss;
      takeProfit = latestPrice + (risk * minRiskReward);

      const resistance = Number(tf.supportResistance?.resistances?.[0]);
      if (Number.isFinite(resistance) && resistance > latestPrice && takeProfit > resistance * 1.005) {
        takeProfit = resistance;
      }
    } else if (direction === 'SELL') {
      const resistance = Number(tf.supportResistance?.resistances?.[0]);

      stopLoss = Number.isFinite(resistance) && resistance > 0
        ? Math.max(resistance, latestPrice + safeAtr * 1.5)
        : latestPrice + safeAtr * 1.5;

      const risk = stopLoss - latestPrice;
      takeProfit = latestPrice - (risk * minRiskReward);

      const support = Number(tf.supportResistance?.supports?.[0]);
      if (Number.isFinite(support) && support > 0 && support < latestPrice && takeProfit < support * 0.995) {
        takeProfit = support;
      }
    }

    const decimals = latestPrice >= 100 ? 2 : 5;
    entryPrice = roundToDecimals(entryPrice, decimals);

    if (['BUY', 'SELL'].includes(direction)) {
      stopLoss = roundToDecimals(stopLoss, decimals);
      takeProfit = roundToDecimals(takeProfit, decimals);

      if (
        !Number.isFinite(entryPrice) ||
        !Number.isFinite(stopLoss) ||
        !Number.isFinite(takeProfit) ||
        entryPrice <= 0 ||
        stopLoss <= 0 ||
        takeProfit <= 0 ||
        (direction === 'BUY' && !(stopLoss < entryPrice && takeProfit > entryPrice)) ||
        (direction === 'SELL' && !(stopLoss > entryPrice && takeProfit < entryPrice))
      ) {
        logger.warn(`Skipping ${pair}: invalid trade levels`, {
          direction,
          entryPrice,
          stopLoss,
          takeProfit,
          latestPrice,
          atr: safeAtr
        });

        direction = 'NO_TRADE';
      }
    }

    const riskPercent = this.config?.riskPerTradePercent || 0.5;

    if (['BUY', 'SELL'].includes(direction)) {
      const riskAmount = direction === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice;
      const rewardAmount = direction === 'BUY' ? takeProfit - entryPrice : entryPrice - takeProfit;
      riskReward = riskAmount > 0 ? rewardAmount / riskAmount : 0;

      const account = await BrokerAccount.findOne({ isActive: true });
      const balance = this.config?.mode === 'PAPER'
        ? (account?.paperBalance || Number(process.env.PAPER_TRADING_BALANCE) || 100000)
        : (account?.balance || 100000);

      const stopLossPips = Math.abs(priceToPips(riskAmount, pair));
      const pipValue = getPipValue(pair) || 1;

      const positionCalc = calculatePositionSize({
        accountBalance: balance,
        riskPercent,
        stopLossPips,
        pipValue,
        pair,
        leverage: this.config?.defaultLeverage || 1
      });

      positionSize = Number.isFinite(Number(positionCalc?.lotSize)) && Number(positionCalc.lotSize) > 0
        ? positionCalc.lotSize
        : 1;
    }

    const confidence = this.calculateSignalConfidence(aiResult, technical, fundamental);
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
      positionSize,
      confidence,

      technicalAnalysis: {
        trend: tf.trend,
        structure: tf.structure?.structure,
        ...tf.ema,
        rsi: tf.rsi,
        macd: tf.macd?.macd,
        macdSignal: tf.macd?.signal,
        atr: tf.atr,
        bollingerUpper: tf.bollinger?.upper,
        bollingerLower: tf.bollinger?.lower,
        supportLevels: tf.supportResistance?.supports,
        resistanceLevels: tf.supportResistance?.resistances,
        fibLevels: tf.fibonacci,
        isBreakout: false,
        isFakeBreakout: false,
        momentum: tf.momentum,
        volatilityRegime: tf.volatility?.regime,
        liquidityZone: tf.liquidity?.above ? 'ABOVE' : tf.liquidity?.below ? 'BELOW' : 'NEUTRAL',
        smcOrderBlocks: tf.smc?.orderBlocks,
        smcFVGs: tf.smc?.fvgs,
        smcLiquiditySweep: tf.smc?.liquiditySweep,
        smcBOS: tf.smc?.bos,
        smcCHoCH: tf.smc?.choch
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
        ...Object.fromEntries(Object.entries(technical.timeframes || {}).map(([k, v]) => [k, v?.trend])),
        aligned: technical.alignment?.aligned || false
      },

      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    };
  }

  async makeFinalDecision(signal, riskValidation) {
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

    if (signal.aiAnalysis?.finalRecommendation === 'NO_TRADE' || signal.aiAnalysis?.finalRecommendation === 'WAIT') {
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

    if (!Number.isFinite(Number(signal.riskReward)) || Number(signal.riskReward) < (this.config?.minRiskReward || 2)) {
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

    if (this.config?.mode === 'HUMAN_APPROVAL') {
      await Signal.create({ ...signal, status: 'PENDING' });

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

    if (
      !Number.isFinite(Number(decision.entry)) ||
      !Number.isFinite(Number(decision.stopLoss)) ||
      !Number.isFinite(Number(decision.takeProfit)) ||
      Number(decision.entry) <= 0 ||
      Number(decision.stopLoss) <= 0 ||
      Number(decision.takeProfit) <= 0
    ) {
      logger.warn('Trade execution skipped due to invalid levels', {
        pair: decision.pair,
        entry: decision.entry,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit
      });
      return null;
    }

    try {
      const mode = this.config?.mode === 'PAPER'
        ? 'PAPER'
        : this.config?.mode === 'DEMO'
          ? 'DEMO'
          : 'LIVE';

      const tradeResult = await brokerLayer.executeTrade({
        pair: decision.pair,
        direction: decision.decision,
        entryPrice: decision.entry,
        stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit,
        positionSize: decision.positionSize,
        riskPercent: decision.riskPercent
      }, mode);

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
    const existingSignal = await Signal.findOne({ signalId: signal.signalId });

    if (!existingSignal) {
      await Signal.create({
        ...signal,
        riskCheck: riskValidation,
        status: decision.decision === 'BUY' || decision.decision === 'SELL'
          ? 'APPROVED'
          : decision.decision === 'WAIT'
            ? 'PENDING'
            : 'REJECTED',
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

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new TradeDecisionEngine();