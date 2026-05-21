const DhanApiClient = require('./DhanApiClient');
const Instrument = require('../../models/Instrument');

class DhanMarketDataService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
  }

  async getLTP(symbol) {
    const instrument = await this.resolve(symbol);
    const response = await this.client.request('post', '/marketfeed/ltp', {
      [instrument.exchangeSegment]: [Number(instrument.securityId)]
    });
    return {
      symbol: instrument.symbol,
      securityId: instrument.securityId,
      exchangeSegment: instrument.exchangeSegment,
      raw: response
    };
  }

  async getQuote(symbol) {
    const instrument = await this.resolve(symbol);
    const response = await this.client.request('post', '/marketfeed/quote', {
      [instrument.exchangeSegment]: [Number(instrument.securityId)]
    });
    return {
      symbol: instrument.symbol,
      securityId: instrument.securityId,
      exchangeSegment: instrument.exchangeSegment,
      raw: response
    };
  }

  async resolve(symbol) {
    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol: String(symbol).toUpperCase(),
      isActive: true
    });
    if (!instrument) throw new Error(`Instrument ${symbol} is not synced`);
    return instrument;
  }
}

module.exports = DhanMarketDataService;
