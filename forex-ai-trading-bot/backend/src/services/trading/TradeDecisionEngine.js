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
const ruleBasedDecisionEngine = require('./RuleBasedDecisionEngine');

const INDIAN_EQUITY_SYMBOLS = new Set([
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'SBIN',
  'LT',
  'AXISBANK',
  'BHARTIARTL',
  'ITC'
]);

const MIN_VALID_INDIAN_EQUITY_PRICE = 10;

function isIndianEquity(pair) {
  return INDIAN_EQUITY_SYMBOLS.has(String(pair || '').toUpperCase());
}

function isValidIndianEquityPrice(pair, price) {
  if (!isIndianEquity(pair)) return true;
  return Number.isFinite(Number(price)) && Number(price) >= MIN_VALID_INDIAN_EQUITY_PRICE;
}

function getNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class TradeDecisionEngine {
  constructor() {
    this.isRunning = false;
    this.config = null;
  }

  async initialize() {
    this.config = await BotConfig.findOne().sort({ updatedAt: -1 });
    await riskEngine.initialize();
    if (this.isAiDecisionEnabled()) {
      await aiEngine.initialize();
    } else {
      logger.info('RULE_BASED_DECISION_ENGINE_ACTIVE');
    }
    await brokerLayer.initialize();
    logger.info('Trade Decision Engine initialized');
  }

  isRuleBasedMode() {
    const strategyMode = String(process.env.STRATEGY_MODE || '').toUpperCase();
    const defaultStrategy = String(process.env.DEFAULT_STRATEGY || '').toUpperCase();
    return (
      process.env.RULE_BASED_TRADING === 'true' ||
      strategyMode === 'RULE_BASED' ||
      defaultStrategy === 'MULTI_CONFIRMATION' ||
      this.config?.aiEnabled === false ||
      process.env.AI_ENABLED === 'false'
    );
  }

  isAiDecisionEnabled() {
    return process.env.AI_ENABLED !== 'false' && !this.isRuleBasedMode();
  }

  getEffectiveMode() {
    const envMode = process.env.TRADING_MODE;
    if (envMode) return envMode;
    return this.config?.mode || 'LEARNING';
  }

  async analyzeAndDecide(pair) {
    try {
      logger.info(`Starting analysis for ${pair}`);

      this.config = await BotConfig.findOne().sort({ updatedAt: -1 });

      if (this.isRuleBasedMode()) {
        logger.info('RULE_BASED_DECISION_ENGINE_ACTIVE');
        return await this.analyzeWithRules(pair);
      }

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

  async analyzeWithRules(pair) {
    const ruleDecision = await ruleBasedDecisionEngine.analyze(pair);
    logger.info(`Rule decision for ${pair}: ${ruleDecision.decision} - ${ruleDecision.reason}`);

    const signal = this.buildRuleSignal(ruleDecision);

    if (!['BUY', 'SELL'].includes(ruleDecision.decision)) {
      const riskValidation = {
        passed: false,
        checks: [],
        rejectionReasons: [ruleDecision.rejectionReason || ruleDecision.reason || 'Rule engine returned NO_TRADE']
      };
      const decision = await this.makeFinalDecision(signal, riskValidation);
      await this.logDecision(decision, signal, riskValidation);
      return decision;
    }

    const marketData = {
      pair: signal.pair,
      bid: signal.entryPrice,
      ask: signal.entryPrice,
      close: signal.entryPrice,
      spread: 0,
      spreadPips: 0,
      volatilityRegime: 'NORMAL',
      liquidity: 'HIGH',
      latencyMs: 0,
      source: 'RULE_BASED'
    };

    const riskValidation = await riskEngine.validateTrade(signal, marketData);
    const decision = await this.makeFinalDecision(signal, riskValidation);
    decision.strategy = ruleDecision.strategy;
    decision.indicators = ruleDecision.indicators;
    decision.votes = ruleDecision.votes;
    await this.logDecision(decision, signal, riskValidation);
    return decision;
  }

  buildRuleSignal(ruleDecision) {
    const signalId = ruleDecision.signalId || generateId();
    const direction = ['BUY', 'SELL'].includes(ruleDecision.decision) ? ruleDecision.decision : 'NO_TRADE';

    return {
      signalId,
      pair: ruleDecision.pair,
      direction,
      entryPrice: ruleDecision.entry,
      stopLoss: ruleDecision.stopLoss,
      takeProfit: ruleDecision.takeProfit,
      riskReward: ruleDecision.riskReward,
      riskPercent: ruleDecision.riskPercent,
      positionSize: ruleDecision.positionSize,
      confidence: ruleDecision.confidence,
      technicalAnalysis: {
        rsi: ruleDecision.indicators?.rsi,
        ema9: ruleDecision.indicators?.ema9,
        ema21: ruleDecision.indicators?.ema21,
        atr: ruleDecision.indicators?.atr,
        trend: ruleDecision.votes?.find((v) => v.strategy === 'EMA_9_21_CROSSOVER')?.decision || 'NEUTRAL',
        momentum: ruleDecision.votes?.find((v) => v.strategy === 'VWAP_RSI_MOMENTUM')?.decision || 'NEUTRAL',
        volatilityRegime: 'NORMAL'
      },
      fundamentalAnalysis: {},
      newsAnalysis: { upcomingEvents: [], recentEvents: [], newsImpactScore: 0, newsSafe: true, newsWarnings: [] },
      aiAnalysis: {
        marketSummary: 'AI disabled. Rule-based local indicator decision.',
        tradeThesis: ruleDecision.reason,
        reasonToEnter: direction === 'NO_TRADE' ? '' : ruleDecision.reason,
        reasonToAvoid: direction === 'NO_TRADE' ? ruleDecision.rejectionReason || ruleDecision.reason : '',
        confidencePercentage: ruleDecision.confidence,
        finalRecommendation: direction
      },
      ruleAnalysis: {
        strategy: ruleDecision.strategy,
        indicators: ruleDecision.indicators,
        votes: ruleDecision.votes
      },
      timeframeAlignment: { aligned: false },
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    };
  }

  async getMarketData(pair) {
    const { MarketData } = require('../../models');

    const normalizedPair = String(pair || '').toUpperCase();
    const latestMarketData = await MarketData.findOne({ pair: normalizedPair }).sort({ timestamp: -1 });

    const latestCandle = await mongoose.connection.db.collection('candledatas').findOne(
      { pair: normalizedPair, timeframe: { $in: ['15m', '5m', '1m'] } },
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

    const marketDataLooksValid = isValidIndianEquityPrice(normalizedPair, marketMid);
    const candleLooksValid = isValidIndianEquityPrice(normalizedPair, candleClose);

    const shouldUseCandle = (
      Number.isFinite(candleClose) &&
      candleClose > 0 &&
      candleLooksValid &&
      (
        !marketMid ||
        !marketDataLooksValid ||
        Math.abs(marketMid - candleClose) / Math.max(candleClose, 1) > 0.25
      )
    );

    if (shouldUseCandle) {
      const spread = Math.max(candleClose * 0.0005, 0.01);

      return {
        pair: normalizedPair,
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

    if (latestMarketData && marketDataLooksValid) {
      return latestMarketData;
    }

    if (isIndianEquity(normalizedPair)) {
      throw new Error(
        `Invalid Indian equity price for ${normalizedPair}. Market mid=${marketMid}, candle close=${candleClose}. Real Dhan price/candle sync required before PAPER execution.`
      );
    }

    if (latestMarketData) return latestMarketData;

    throw new Error(`No market/candle data available for ${normalizedPair}`);
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

  calculateIndianEquityQuantity({ balance, entryPrice, stopLoss, riskPercent }) {
    const safeBalance = getNumber(balance, Number(process.env.PAPER_TRADING_BALANCE || 100000));
    const safeEntry = getNumber(entryPrice, 0);
    const safeStopLoss = getNumber(stopLoss, 0);
    const safeRiskPercent = getNumber(riskPercent, 0.5);

    if (safeBalance <= 0 || safeEntry <= 0 || safeStopLoss <= 0) return 0;

    const maxCapitalPerTradePercent = getNumber(this.config?.maxCapitalPerTradePercent, 10);
    const maxCapital = safeBalance * (maxCapitalPerTradePercent / 100);
    const qtyByCapital = Math.floor(maxCapital / safeEntry);

    const riskPerShare = Math.abs(safeEntry - safeStopLoss);
    const maxRiskAmount = safeBalance * (safeRiskPercent / 100);
    const qtyByRisk = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0;

    const qty = Math.max(0, Math.min(qtyByCapital, qtyByRisk));

    return qty;
  }

  async buildSignal(pair, marketData, technical, fundamental, news, aiResult) {
    const normalizedPair = String(pair || '').toUpperCase();
    const latestPrice = this.getLatestPrice(marketData);
    const tf = this.getBestTimeframeData(technical);

    if (!tf) throw new Error('No timeframe data available');

    if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
      throw new Error(`Invalid latest price for ${normalizedPair}`);
    }

    if (!isValidIndianEquityPrice(normalizedPair, latestPrice)) {
      throw new Error(
        `Invalid Indian equity price for ${normalizedPair}: ${latestPrice}. Real Dhan price/candle sync required before PAPER execution.`
      );
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
        logger.warn(`Skipping ${normalizedPair}: invalid trade levels`, {
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

      if (isIndianEquity(normalizedPair)) {
        positionSize = this.calculateIndianEquityQuantity({
          balance,
          entryPrice,
          stopLoss,
          riskPercent
        });

        if (!Number.isFinite(positionSize) || positionSize < 1) {
          logger.warn(`Skipping ${normalizedPair}: invalid Indian equity quantity`, {
            balance,
            entryPrice,
            stopLoss,
            riskPercent,
            positionSize
          });

          direction = 'NO_TRADE';
          positionSize = 0;
        }
      } else {
        const stopLossPips = Math.abs(priceToPips(riskAmount, normalizedPair));
        const pipValue = getPipValue(normalizedPair) || 1;

        const positionCalc = calculatePositionSize({
          accountBalance: balance,
          riskPercent,
          stopLossPips,
          pipValue,
          pair: normalizedPair,
          leverage: this.config?.defaultLeverage || 1
        });

        positionSize = Number.isFinite(Number(positionCalc?.lotSize)) && Number(positionCalc.lotSize) > 0
          ? positionCalc.lotSize
          : 1;
      }
    }

    const confidence = this.calculateSignalConfidence(aiResult, technical, fundamental);
    const signalId = generateId();

    return {
      signalId,
      pair: normalizedPair,
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

    if (!this.isRuleBasedMode() && (signal.aiAnalysis?.finalRecommendation === 'NO_TRADE' || signal.aiAnalysis?.finalRecommendation === 'WAIT')) {
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

    if (this.getEffectiveMode() === 'LEARNING') {
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

    if (this.getEffectiveMode() === 'HUMAN_APPROVAL') {
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
      reason: `All validation passed. ${signal.aiAnalysis?.tradeThesis || 'Rule-based technical confirmation.'}`,
      rejectionReason: '',
      signalId: signal.signalId
    };
  }

  async executeApprovedTrade(decision) {

      const effectiveModeForPaper = this.config?.mode || process.env.TRADING_MODE || 'PAPER';

      if (effectiveModeForPaper === 'PAPER' || effectiveModeForPaper === 'DEMO') {
        const tradeId = `PAPER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

          const entry = Number(decision.entry);
          const stopLoss = Number(decision.stopLoss);
          const takeProfit = Number(decision.takeProfit);
          const dir = String(decision.decision || "").toUpperCase();

          const invalidBuy = dir === BUY && (
            !(stopLoss < entry && takeProfit > entry) ||
            stopLoss < entry * 0.5 ||
            takeProfit > entry * 1.5
          );

          const invalidSell = dir === SELL && (
            !(stopLoss > entry && takeProfit < entry) ||
            stopLoss > entry * 1.5 ||
            takeProfit < entry * 0.5
          );

          if (!entry || !stopLoss || !takeProfit || invalidBuy || invalidSell) {
            logger.warn(PAPER_TRADE_SKIPPED_INVALID_SL_TP, {
              pair: decision.pair,
              direction: decision.decision,
              entry,
              stopLoss,
              takeProfit
            });

            return {
              success: false,
              skipped: true,
              reason: INVALID_SL_TP_FOR_PAPER_TRADE,
              pair: decision.pair
            };
          }



        const trade = await Trade.create({
          tradeId,
          signalId: decision.signalId,
          pair: decision.pair,
          symbol: decision.pair,
          side: decision.decision,
          direction: decision.decision,
          entryPrice: decision.entry,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          riskReward: decision.riskReward,
          riskPercent: decision.riskPercent,
          positionSize: decision.positionSize,
          quantity: decision.positionSize || 1,
          status: 'OPEN',
          mode: effectiveModeForPaper,
          broker: 'PAPER',
          brokerTicket: tradeId,
          source: 'PAPER_SIMULATION',
          openedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await Signal.findOneAndUpdate(
          { signalId: decision.signalId },
          { status: 'EXECUTED' }
        );

        logger.info(`Paper trade opened: ${trade.tradeId} ${decision.pair} ${decision.decision}`);
        return trade;
      }

    if (decision.decision !== 'BUY' && decision.decision !== 'SELL') {
      return null;
    }

      const effectiveModeForPaper = process.env.TRADING_MODE || this.config?.mode || 'PAPER';

      if (effectiveModeForPaper === 'PAPER' || effectiveModeForPaper === 'DEMO') {
        const tradeId = `PAPER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

          const entry = Number(decision.entry);
          const stopLoss = Number(decision.stopLoss);
          const takeProfit = Number(decision.takeProfit);
          const dir = String(decision.decision || "").toUpperCase();

          const invalidBuy = dir === 'BUY' && (
            !(stopLoss < entry && takeProfit > entry) ||
            stopLoss < entry * 0.5 ||
            takeProfit > entry * 1.5
          );

          const invalidSell = dir === 'SELL' && (
            !(stopLoss > entry && takeProfit < entry) ||
            stopLoss > entry * 1.5 ||
            takeProfit < entry * 0.5
          );

          if (!entry || !stopLoss || !takeProfit || invalidBuy || invalidSell) {
            logger.warn('PAPER_TRADE_SKIPPED_INVALID_SL_TP', {
              pair: decision.pair,
              direction: decision.decision,
              entry,
              stopLoss,
              takeProfit
            });

            return {
              success: false,
              skipped: true,
              reason: 'INVALID_SL_TP_FOR_PAPER_TRADE',
              pair: decision.pair
            };
          }

        const existingOpenPaperTrade = await Trade.findOne({
          pair: decision.pair,
          mode: 'PAPER',
          status: { $in: ['OPEN', 'PENDING'] }
        });

        if (existingOpenPaperTrade) {
          logger.warn('PAPER_TRADE_SKIPPED_DUPLICATE_OPEN_PAIR', {
            pair: decision.pair,
            tradeId: existingOpenPaperTrade.tradeId
          });
          return {
            success: false,
            skipped: true,
            reason: 'DUPLICATE_OPEN_PAPER_PAIR',
            pair: decision.pair
          };
        }

        const trade = await Trade.create({
          tradeId,
          signalId: decision.signalId,
          pair: decision.pair,
          symbol: decision.pair,
          side: decision.decision,
          direction: decision.decision,
          entryPrice: decision.entry,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          riskReward: decision.riskReward,
          riskPercent: decision.riskPercent,
          positionSize: decision.positionSize,
          quantity: decision.positionSize || 1,
          status: 'OPEN',
          mode: effectiveModeForPaper,
          broker: 'PAPER',
          brokerTicket: tradeId,
          source: 'PAPER_SIMULATION',
          openedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await Signal.findOneAndUpdate(
          { signalId: decision.signalId },
          { status: 'EXECUTED' }
        );

        logger.info(`Paper trade opened: ${trade.tradeId} ${decision.pair} ${decision.decision}`);
        return trade;
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

    if (!isValidIndianEquityPrice(decision.pair, Number(decision.entry))) {
      logger.warn('Trade execution skipped due to invalid Indian equity price', {
        pair: decision.pair,
        entry: decision.entry,
        message: 'Real Dhan price/candle sync required before PAPER execution'
      });
      return null;
    }

    try {
      const effectiveMode = this.getEffectiveMode();
      const mode = effectiveMode === 'PAPER'
        ? 'PAPER'
        : effectiveMode === 'DEMO'
          ? 'DEMO'
          : 'LIVE';

      if (mode !== 'PAPER' && process.env.ALLOW_LIVE_TRADING !== 'true') {
        logger.warn('Trade execution skipped because live trading is disabled', {
          pair: decision.pair,
          mode: effectiveMode,
          allowLiveTrading: process.env.ALLOW_LIVE_TRADING
        });
        return null;
      }

      const tradeResult = await brokerLayer.executeTrade({
        pair: decision.pair,
        symbol: decision.pair,
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
