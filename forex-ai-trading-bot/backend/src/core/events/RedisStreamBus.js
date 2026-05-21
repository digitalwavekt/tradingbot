const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { validateEvent, STREAMS, EVENT_TYPES } = require('./EventTypes');

class RedisStreamBus {
  constructor(redisProvider = getRedis) {
    this.redisProvider = redisProvider;
    this.defaultMaxLen = Number(process.env.REDIS_STREAM_MAXLEN || 100000);
  }

  getClient() {
    const client = this.redisProvider();
    if (!client) throw new Error('Redis is not connected');
    return client;
  }

  async publish(stream, event, options = {}) {
    validateEvent(event);
    const client = this.getClient();
    const maxLen = options.maxLen || this.defaultMaxLen;

    return client.xadd(
      stream,
      'MAXLEN',
      '~',
      maxLen,
      '*',
      'event',
      JSON.stringify(event)
    );
  }

  async ensureGroup(stream, groupName, startId = '0') {
    const client = this.getClient();
    try {
      await client.xgroup('CREATE', stream, groupName, startId, 'MKSTREAM');
    } catch (error) {
      if (!String(error.message).includes('BUSYGROUP')) throw error;
    }
  }

  async readGroup({ stream, groupName, consumerName, count = 50, blockMs = 5000, id = '>' }) {
    const client = this.getClient();
    await this.ensureGroup(stream, groupName);
    const response = await client.xreadgroup(
      'GROUP',
      groupName,
      consumerName,
      'COUNT',
      count,
      'BLOCK',
      blockMs,
      'STREAMS',
      stream,
      id
    );

    if (!response) return [];
    return response.flatMap(([streamName, messages]) =>
      messages.map(([messageId, fields]) => ({
        stream: streamName,
        messageId,
        event: this.parseFields(fields)
      }))
    );
  }

  async ack(stream, groupName, messageId) {
    return this.getClient().xack(stream, groupName, messageId);
  }

  async publishToDeadLetter(original, error, meta = {}) {
    const event = {
      eventId: meta.eventId || `${Date.now()}-${Math.random()}`,
      type: EVENT_TYPES.SYSTEM_ALERT,
      source: 'redis-stream-bus',
      correlationId: original?.event?.correlationId || meta.correlationId || 'unknown',
      causationId: original?.event?.eventId || null,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      payload: {
        reason: error.message,
        originalStream: original?.stream,
        originalMessageId: original?.messageId,
        originalEvent: original?.event
      }
    };
    return this.publish(STREAMS.DEAD_LETTER, event, { maxLen: 50000 });
  }

  parseFields(fields) {
    const map = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    try {
      return JSON.parse(map.event);
    } catch (error) {
      logger.warn('Failed to parse Redis stream event', { error: error.message });
      throw error;
    }
  }
}

module.exports = new RedisStreamBus();
module.exports.RedisStreamBus = RedisStreamBus;
