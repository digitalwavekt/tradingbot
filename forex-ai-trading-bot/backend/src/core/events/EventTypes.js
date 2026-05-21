const crypto = require('crypto');

const EVENT_TYPES = Object.freeze({
  MARKET_TICK: 'market.tick',
  MARKET_CANDLE: 'market.candle',
  STRATEGY_SIGNAL: 'strategy.signal',
  RISK_DECISION: 'risk.decision',
  ORDER_INTENT: 'order.intent',
  ORDER_UPDATE: 'order.update',
  SYSTEM_ALERT: 'system.alert'
});

const STREAMS = Object.freeze({
  MARKET_TICKS: 'stream:market:ticks',
  MARKET_CANDLES: 'stream:market:candles',
  STRATEGY_SIGNALS: 'stream:strategy:signals',
  RISK_DECISIONS: 'stream:risk:decisions',
  ORDER_INTENTS: 'stream:orders:intents',
  ORDER_UPDATES: 'stream:orders:updates',
  DEAD_LETTER: 'stream:system:dlq'
});

function createEvent(type, payload, meta = {}) {
  if (!Object.values(EVENT_TYPES).includes(type)) {
    throw new Error(`Unsupported event type: ${type}`);
  }

  return {
    eventId: meta.eventId || crypto.randomUUID(),
    type,
    source: meta.source || 'trading-system',
    correlationId: meta.correlationId || crypto.randomUUID(),
    causationId: meta.causationId || null,
    schemaVersion: meta.schemaVersion || 1,
    createdAt: meta.createdAt || new Date().toISOString(),
    payload
  };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('Event must be an object');
  if (!event.eventId) throw new Error('eventId is required');
  if (!event.type || !Object.values(EVENT_TYPES).includes(event.type)) throw new Error('Valid event type is required');
  if (!event.correlationId) throw new Error('correlationId is required');
  if (!event.createdAt) throw new Error('createdAt is required');
  if (event.payload === undefined) throw new Error('payload is required');
  return true;
}

module.exports = {
  EVENT_TYPES,
  STREAMS,
  createEvent,
  validateEvent
};
