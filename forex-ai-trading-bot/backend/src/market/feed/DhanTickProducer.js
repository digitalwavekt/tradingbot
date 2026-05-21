const crypto = require('crypto');
const eventBus = require('../../core/events/RedisStreamBus');
const { EVENT_TYPES, STREAMS, createEvent } = require('../../core/events/EventTypes');
const logger = require('../../utils/logger');

class DhanTickProducer {
  constructor(bus = eventBus) {
    this.bus = bus;
    this.lastSequenceByInstrument = new Map();
  }

  async publishRawTick(rawMessage, meta = {}) {
    const normalized = this.normalize(rawMessage, meta);
    if (!normalized) return null;

    const sequenceKey = `${normalized.exchangeSegment}:${normalized.securityId}`;
    const previousSequence = this.lastSequenceByInstrument.get(sequenceKey);
    if (normalized.sequence !== undefined && previousSequence !== undefined && normalized.sequence <= previousSequence) {
      logger.warn('Dropping duplicate/out-of-order tick', {
        sequenceKey,
        previousSequence,
        sequence: normalized.sequence
      });
      return null;
    }

    if (normalized.sequence !== undefined) {
      this.lastSequenceByInstrument.set(sequenceKey, normalized.sequence);
    }

    const event = createEvent(EVENT_TYPES.MARKET_TICK, normalized, {
      source: 'dhan-websocket',
      correlationId: normalized.tickId
    });

    await this.bus.publish(STREAMS.MARKET_TICKS, event);
    return event;
  }

  normalize(rawMessage, meta = {}) {
    const receivedAt = new Date().toISOString();
    const parsed = this.parse(rawMessage);
    const securityId = parsed.securityId || parsed.SecurityId || meta.securityId;
    const exchangeSegment = parsed.exchangeSegment || parsed.ExchangeSegment || meta.exchangeSegment || 'NSE_EQ';

    if (!securityId && !parsed.raw) {
      logger.warn('Unable to normalize Dhan tick without securityId');
      return null;
    }

    return {
      tickId: crypto
        .createHash('sha1')
        .update(`${exchangeSegment}:${securityId || 'unknown'}:${parsed.sequence || parsed.timestamp || receivedAt}:${JSON.stringify(parsed).slice(0, 200)}`)
        .digest('hex'),
      broker: 'dhan',
      exchangeSegment,
      securityId: securityId ? String(securityId) : undefined,
      symbol: parsed.symbol || meta.symbol,
      lastPrice: parsed.lastPrice ?? parsed.ltp ?? parsed.LTP,
      bid: parsed.bid,
      ask: parsed.ask,
      volume: parsed.volume,
      sequence: parsed.sequence,
      exchangeTimestamp: parsed.timestamp || parsed.exchangeTimestamp,
      receivedAt,
      raw: parsed.raw || parsed
    };
  }

  parse(rawMessage) {
    if (Buffer.isBuffer(rawMessage)) {
      return { raw: rawMessage.toString('base64') };
    }

    if (typeof rawMessage === 'string') {
      try {
        return JSON.parse(rawMessage);
      } catch {
        return { raw: rawMessage };
      }
    }

    if (rawMessage && typeof rawMessage === 'object') return rawMessage;
    return { raw: String(rawMessage) };
  }
}

module.exports = DhanTickProducer;
