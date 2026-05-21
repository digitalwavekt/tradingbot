const DhanApiClient = require('./DhanApiClient');

class DhanHealthService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
  }

  async check() {
    const startedAt = Date.now();
    try {
      await this.client.request('get', '/profile');
      return {
        ok: true,
        broker: 'dhan',
        latencyMs: Date.now() - startedAt,
        liveTradingAllowed: process.env.ALLOW_LIVE_TRADING === 'true'
      };
    } catch (error) {
      return {
        ok: false,
        broker: 'dhan',
        latencyMs: Date.now() - startedAt,
        error: error.message
      };
    }
  }
}

module.exports = DhanHealthService;
