const { calculateBackoff } = require('../src/market/websocket/ReconnectState');

describe('ReconnectState', () => {
  test('caps exponential backoff', () => {
    const delay = calculateBackoff(10, { baseMs: 1000, maxMs: 5000, jitterRatio: 0 });
    expect(delay).toBe(5000);
  });

  test('increases delay with attempts', () => {
    const first = calculateBackoff(1, { baseMs: 1000, maxMs: 30000, jitterRatio: 0 });
    const third = calculateBackoff(3, { baseMs: 1000, maxMs: 30000, jitterRatio: 0 });
    expect(third).toBeGreaterThan(first);
  });
});
