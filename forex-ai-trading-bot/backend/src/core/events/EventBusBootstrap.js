const eventBus = require('./RedisStreamBus');
const { STREAMS } = require('./EventTypes');
const logger = require('../../utils/logger');

const GROUPS = Object.freeze([
  { stream: STREAMS.MARKET_TICKS, group: 'candle-aggregators' },
  { stream: STREAMS.MARKET_CANDLES, group: 'strategy-engine' },
  { stream: STREAMS.STRATEGY_SIGNALS, group: 'risk-engine' },
  { stream: STREAMS.RISK_DECISIONS, group: 'execution-engine' },
  { stream: STREAMS.ORDER_INTENTS, group: 'order-manager' },
  { stream: STREAMS.ORDER_UPDATES, group: 'order-reconciler' },
  { stream: STREAMS.DEAD_LETTER, group: 'ops-monitor' }
]);

async function bootstrapEventBus() {
  for (const item of GROUPS) {
    await eventBus.ensureGroup(item.stream, item.group);
  }
  logger.info('Redis event bus streams verified', { streams: GROUPS.length });
}

module.exports = {
  GROUPS,
  bootstrapEventBus
};
