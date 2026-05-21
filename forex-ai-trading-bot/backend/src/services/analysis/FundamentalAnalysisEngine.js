const logger = require('../../utils/logger');
const { NewsEvent } = require('../../models');

class FundamentalAnalysisEngine {
  constructor() {
    this.currencyData = {};
  }

  async analyze(pair) {
    try {
      const [baseCurrency, quoteCurrency] = pair.split('/');

      const baseAnalysis = await this.analyzeCurrency(baseCurrency);
      const quoteAnalysis = await this.analyzeCurrency(quoteCurrency);

      const relativeStrength = this.calculateRelativeStrength(baseAnalysis, quoteAnalysis);
      const sentiment = this.assessSentiment(baseAnalysis, quoteAnalysis);

      return {
        pair,
        baseCurrency: baseAnalysis,
        quoteCurrency: quoteAnalysis,
        relativeStrength,
        sentiment,
        recommendation: this.generateRecommendation(relativeStrength, sentiment),
        timestamp: new Date()
      };

    } catch (error) {
      logger.error(`Fundamental analysis error for ${pair}: ${error.message}`);
      throw error;
    }
  }

  async analyzeCurrency(currency) {
    // In production, fetch from economic data APIs
    // For now, use placeholder with structure

    const recentNews = await NewsEvent.find({
      $or: [
        { currency },
        { currency: 'ALL' }
      ],
      scheduledTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ scheduledTime: -1 }).limit(20);

    const interestRateEvents = recentNews.filter(n => n.category === 'INTEREST_RATE');
    const inflationEvents = recentNews.filter(n => n.category === 'CPI' || n.category === 'PPI');
    const employmentEvents = recentNews.filter(n => n.category === 'NFP' || n.category === 'UNEMPLOYMENT');
    const gdpEvents = recentNews.filter(n => n.category === 'GDP');
    const centralBankEvents = recentNews.filter(n => n.category === 'CENTRAL_BANK' || ['FOMC', 'ECB', 'BOE', 'BOJ'].includes(n.category));

    // Determine central bank tone from recent events
    let centralBankTone = 'NEUTRAL';
    const latestCBEvent = centralBankEvents[0];
    if (latestCBEvent) {
      if (latestCBEvent.sentiment === 'BULLISH') centralBankTone = 'HAWKISH';
      else if (latestCBEvent.sentiment === 'BEARISH') centralBankTone = 'DOVISH';
    }

    return {
      currency,
      interestRateDirection: this.determineDirection(interestRateEvents),
      inflationTrend: this.determineDirection(inflationEvents),
      employmentStrength: this.determineDirection(employmentEvents),
      gdpGrowth: this.determineDirection(gdpEvents),
      centralBankTone,
      recentEvents: recentNews.map(n => ({
        title: n.title,
        impact: n.impact,
        sentiment: n.sentiment,
        scheduledTime: n.scheduledTime
      })),
      eventCount: recentNews.length,
      highImpactEvents: recentNews.filter(n => n.impact === 'HIGH').length
    };
  }

  determineDirection(events) {
    if (events.length === 0) return 'NEUTRAL';

    const bullish = events.filter(e => e.sentiment === 'BULLISH').length;
    const bearish = events.filter(e => e.sentiment === 'BEARISH').length;

    if (bullish > bearish * 1.5) return 'IMPROVING';
    if (bearish > bullish * 1.5) return 'WORSENING';
    if (bullish > bearish) return 'SLIGHTLY_IMPROVING';
    if (bearish > bullish) return 'SLIGHTLY_WORSENING';
    return 'STABLE';
  }

  calculateRelativeStrength(base, quote) {
    const factors = ['interestRateDirection', 'inflationTrend', 'employmentStrength', 'gdpGrowth'];
    let baseScore = 0;
    let quoteScore = 0;

    const scoreMap = {
      'IMPROVING': 2,
      'SLIGHTLY_IMPROVING': 1,
      'STABLE': 0,
      'NEUTRAL': 0,
      'SLIGHTLY_WORSENING': -1,
      'WORSENING': -2
    };

    for (const factor of factors) {
      baseScore += scoreMap[base[factor]] || 0;
      quoteScore += scoreMap[quote[factor]] || 0;
    }

    // Central bank tone bonus
    const toneScore = { 'HAWKISH': 1, 'NEUTRAL': 0, 'DOVISH': -1 };
    baseScore += toneScore[base.centralBankTone] || 0;
    quoteScore += toneScore[quote.centralBankTone] || 0;

    const relativeScore = baseScore - quoteScore;

    return {
      score: relativeScore,
      baseScore,
      quoteScore,
      interpretation: relativeScore > 2 ? 'STRONGLY_BULLISH' :
                    relativeScore > 0 ? 'BULLISH' :
                    relativeScore < -2 ? 'STRONGLY_BEARISH' :
                    relativeScore < 0 ? 'BEARISH' : 'NEUTRAL'
    };
  }

  assessSentiment(base, quote) {
    const baseEvents = base.recentEvents || [];
    const quoteEvents = quote.recentEvents || [];

    const allEvents = [...baseEvents, ...quoteEvents];
    const bullish = allEvents.filter(e => e.sentiment === 'BULLISH').length;
    const bearish = allEvents.filter(e => e.sentiment === 'BEARISH').length;
    const neutral = allEvents.filter(e => e.sentiment === 'NEUTRAL').length;
    const total = allEvents.length || 1;

    return {
      bullishPercent: Math.round((bullish / total) * 100),
      bearishPercent: Math.round((bearish / total) * 100),
      neutralPercent: Math.round((neutral / total) * 100),
      overall: bullish > bearish ? 'BULLISH' : bearish > bullish ? 'BEARISH' : 'NEUTRAL',
      riskOnRiskOff: this.assessRiskSentiment(allEvents)
    };
  }

  assessRiskSentiment(events) {
    const riskOnKeywords = ['growth', 'expansion', 'hiring', 'strong', 'optimistic', 'recovery'];
    const riskOffKeywords = ['recession', 'crisis', 'war', 'sanctions', 'fear', 'uncertainty', 'downturn'];

    let riskOnCount = 0;
    let riskOffCount = 0;

    for (const event of events) {
      const title = (event.title || '').toLowerCase();
      if (riskOnKeywords.some(k => title.includes(k))) riskOnCount++;
      if (riskOffKeywords.some(k => title.includes(k))) riskOffCount++;
    }

    if (riskOffCount > riskOnCount * 1.5) return 'RISK_OFF';
    if (riskOnCount > riskOffCount * 1.5) return 'RISK_ON';
    return 'MIXED';
  }

  generateRecommendation(relativeStrength, sentiment) {
    if (relativeStrength.interpretation === 'STRONGLY_BULLISH' && sentiment.overall === 'BULLISH') {
      return { direction: 'BUY', confidence: 80 };
    }
    if (relativeStrength.interpretation === 'STRONGLY_BEARISH' && sentiment.overall === 'BEARISH') {
      return { direction: 'SELL', confidence: 80 };
    }
    if (relativeStrength.interpretation === 'BULLISH' && sentiment.overall === 'BULLISH') {
      return { direction: 'BUY', confidence: 65 };
    }
    if (relativeStrength.interpretation === 'BEARISH' && sentiment.overall === 'BEARISH') {
      return { direction: 'SELL', confidence: 65 };
    }
    return { direction: 'NEUTRAL', confidence: 50 };
  }
}

module.exports = new FundamentalAnalysisEngine();