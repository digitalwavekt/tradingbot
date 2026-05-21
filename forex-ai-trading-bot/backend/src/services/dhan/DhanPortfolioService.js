const DhanApiClient = require('./DhanApiClient');

class DhanPortfolioService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
  }

  async getFunds() {
    return this.client.request('get', '/fundlimit');
  }

  async getPositions() {
    return this.client.request('get', '/positions');
  }

  async getHoldings() {
    return this.client.request('get', '/holdings');
  }
}

module.exports = DhanPortfolioService;
