const { EVENT_TYPES, createEvent, validateEvent } = require('../src/core/events/EventTypes');

describe('EventTypes', () => {
  test('creates valid event envelope', () => {
    const event = createEvent(EVENT_TYPES.MARKET_TICK, { securityId: '123', lastPrice: 100 }, {
      correlationId: 'corr-1',
      source: 'test'
    });

    expect(event.type).toBe(EVENT_TYPES.MARKET_TICK);
    expect(event.correlationId).toBe('corr-1');
    expect(validateEvent(event)).toBe(true);
  });

  test('rejects unsupported event type', () => {
    expect(() => createEvent('bad.event', {})).toThrow('Unsupported event type');
  });
});
