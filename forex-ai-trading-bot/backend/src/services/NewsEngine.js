const logger = require('../utils/logger');
const { NewsEvent } = require('../models');

class NewsEngine {
  constructor() {
    this.sources = [];
    this.lastFetch = null;
  }

  async initialize() {
    logger.info('News Engine initialized');
  }

  async fetchEconomicCalendar() {
    try {
      const events = [];

      // Fetch from multiple sources
      const exchangeEvents = await this.fetchExchangeCalendar();
      const tradingEconomicsEvents = await this.fetchTradingEconomics();

      events.push(...exchangeEvents, ...tradingEconomicsEvents);

      // Deduplicate
      const deduplicated = this.deduplicateEvents(events);

      // Process and save
      for (const event of deduplicated) {
        await this.processEvent(event);
      }

      // Mark stale events
      await this.markStaleEvents();

      this.lastFetch = new Date();

      return deduplicated;

    } catch (error) {
      logger.error(`News fetch error: ${error.message}`);
      throw error;
    }
  }

  async fetchExchangeCalendar() {
    try {
      // In production, scrape or use API
      // For now, return structured placeholder with real event structure

      const mockEvents = [
        {
          title: 'RBI Monetary Policy',
          currency: 'INR',
          impact: 'HIGH',
          impactScore: 95,
          scheduledTime: this.getNextFriday(8, 30),
          category: 'RBI',
          source: 'EXCHANGE_CALENDAR'
        },
        {
          title: 'India CPI',
          currency: 'INR',
          impact: 'HIGH',
          impactScore: 90,
          scheduledTime: this.getNextMonthDay(13, 8, 30),
          category: 'CPI',
          source: 'EXCHANGE_CALENDAR'
        },
        {
          title: 'SEBI Market Circular',
          currency: 'INR',
          impact: 'HIGH',
          impactScore: 100,
          scheduledTime: this.getNextWednesday(14, 0),
          category: 'SEBI',
          source: 'EXCHANGE_CALENDAR'
        },
        {
          title: 'NSE Holiday or Special Session',
          currency: 'INR',
          impact: 'HIGH',
          impactScore: 85,
          scheduledTime: this.getNextThursday(8, 30),
          category: 'NSE',
          source: 'EXCHANGE_CALENDAR'
        },
        {
          title: 'India GDP',
          currency: 'INR',
          impact: 'MEDIUM',
          impactScore: 70,
          scheduledTime: this.getNextMonthDay(25, 8, 30),
          category: 'GDP',
          source: 'EXCHANGE_CALENDAR'
        }
      ];

      return mockEvents;

    } catch (error) {
      logger.error(`Exchange calendar fetch error: ${error.message}`);
      return [];
    }
  }

  async fetchTradingEconomics() {
    // In production, use Trading Economics API.
    // API key required: process.env.TRADING_ECONOMICS_API_KEY
    return [];
  }

  deduplicateEvents(events) {
    const seen = new Map();
    const result = [];

    for (const event of events) {
      const key = `${event.title}_${event.currency}_${event.scheduledTime.getTime()}`;

      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.duplicates = existing.duplicates || [];
        existing.duplicates.push(event.source);

        // Keep highest impact score
        if ((event.impactScore || 0) > (existing.impactScore || 0)) {
          existing.impactScore = event.impactScore;
        }
      } else {
        event.duplicates = [];
        seen.set(key, event);
        result.push(event);
      }
    }

    return result;
  }

  async processEvent(event) {
    try {
      const eventId = `NEWS_${event.currency}_${event.category}_${event.scheduledTime.getTime()}`;

      const existing = await NewsEvent.findOne({ eventId });

      if (existing) {
        // Update if needed
        if (event.impactScore > existing.impactScore) {
          existing.impactScore = event.impactScore;
          await existing.save();
        }
        return existing;
      }

      // Create new event
      const newsEvent = await NewsEvent.create({
        eventId,
        title: event.title,
        description: event.description || '',
        currency: event.currency,
        impact: event.impact,
        impactScore: event.impactScore || 50,
        sentiment: event.sentiment || 'NEUTRAL',
        sentimentConfidence: 0,
        scheduledTime: event.scheduledTime,
        actual: event.actual || '',
        forecast: event.forecast || '',
        previous: event.previous || '',
        source: event.source || 'CUSTOM',
        category: event.category || 'OTHER',
        isProcessed: false,
        isStale: false,
        duplicates: event.duplicates || []
      });

      return newsEvent;

    } catch (error) {
      logger.error(`Event processing error: ${error.message}`);
      return null;
    }
  }

  async markStaleEvents() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await NewsEvent.updateMany(
      { scheduledTime: { $lt: cutoff }, isStale: false },
      { isStale: true }
    );
  }

  async analyzeNewsImpact(pair) {
    const [base, quote] = pair.split('/');
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingEvents = await NewsEvent.find({
      $or: [
        { currency: base },
        { currency: quote },
        { currency: 'ALL' }
      ],
      scheduledTime: { $gte: now, $lte: next24h },
      isStale: false,
      impact: { $in: ['HIGH', 'MEDIUM'] }
    }).sort({ scheduledTime: 1 });

    const totalImpact = upcomingEvents.reduce((sum, e) => sum + (e.impactScore || 0), 0);
    const maxImpact = upcomingEvents.length > 0 ? Math.max(...upcomingEvents.map(e => e.impactScore || 0)) : 0;

    return {
      events: upcomingEvents,
      totalImpact,
      maxImpact,
      eventCount: upcomingEvents.length,
      highImpactCount: upcomingEvents.filter(e => e.impact === 'HIGH').length,
      isSafe: maxImpact < 70,
      nextEvent: upcomingEvents[0] || null,
      timeToNextEvent: upcomingEvents[0] ? upcomingEvents[0].scheduledTime - now : null
    };
  }

  async getSentimentFromNews(pair) {
    const [base, quote] = pair.split('/');
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentNews = await NewsEvent.find({
      $or: [
        { currency: base },
        { currency: quote },
        { currency: 'ALL' }
      ],
      scheduledTime: { $gte: last24h },
      isStale: false
    }).sort({ scheduledTime: -1 });

    const bullish = recentNews.filter(n => n.sentiment === 'BULLISH').length;
    const bearish = recentNews.filter(n => n.sentiment === 'BEARISH').length;
    const total = recentNews.length || 1;

    return {
      bullishPercent: Math.round((bullish / total) * 100),
      bearishPercent: Math.round((bearish / total) * 100),
      overall: bullish > bearish ? 'BULLISH' : bearish > bullish ? 'BEARISH' : 'NEUTRAL',
      recentHeadlines: recentNews.slice(0, 5).map(n => ({
        title: n.title,
        impact: n.impact,
        sentiment: n.sentiment,
        time: n.scheduledTime
      }))
    };
  }

  // Helper methods for mock data
  getNextFriday(hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + (5 + 7 - d.getDay()) % 7);
    d.setHours(hour, minute, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 7);
    return d;
  }

  getNextWednesday(hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + (3 + 7 - d.getDay()) % 7);
    d.setHours(hour, minute, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 7);
    return d;
  }

  getNextThursday(hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + (4 + 7 - d.getDay()) % 7);
    d.setHours(hour, minute, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 7);
    return d;
  }

  getNextMonthDay(day, hour, minute) {
    const d = new Date();
    d.setDate(day);
    d.setHours(hour, minute, 0, 0);
    if (d < new Date()) d.setMonth(d.getMonth() + 1);
    return d;
  }
}

module.exports = new NewsEngine();
