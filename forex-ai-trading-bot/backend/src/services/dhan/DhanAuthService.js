const DhanApiClient = require('./DhanApiClient');

class DhanAuthService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
    this.clientId = this.client.clientId;
  }

  async init() {
    this.client.assertConfigured();
    return true;
  }

  async getProfile() {
    return this.client.request('get', '/profile');
  }
}

module.exports = DhanAuthService;
