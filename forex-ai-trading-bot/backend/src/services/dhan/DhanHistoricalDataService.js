const DhanApiClient = require('./DhanApiClient');
const Instrument = require('../../models/Instrument');

class DhanHistoricalDataService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
  }

  async fetchOHLC(symbol, timeframe = '1m', opts = {}) {
    const instrument = opts.securityId ? opts : await Instrument.findOne({
      broker: 'dhan',
      symbol: String(symbol).toUpperCase(),
      exchangeSegment: opts.exchangeSegment || 'NSE_EQ',
      isActive: true
    });
    if (!instrument?.securityId) throw new Error(`Unable to resolve Dhan securityId for ${symbol}`);

    const interval = this.normalizeInterval(timeframe);
    const isDaily = interval === '1D';
    const payload = {
      securityId: String(instrument.securityId),
      exchangeSegment: instrument.exchangeSegment || opts.exchangeSegment || 'NSE_EQ',
      instrument: instrument.instrument || opts.instrument || 'EQUITY',
      oi: Boolean(opts.oi),
      fromDate: opts.fromDate,
      toDate: opts.toDate
    };

    if (!isDaily) payload.interval = interval;
    if (opts.expiryCode !== undefined) payload.expiryCode = opts.expiryCode;

    const response = await this.client.request('post', isDaily ? '/charts/historical' : '/charts/intraday', payload);
    return this.normalizeCandles(response, {
      symbol,
      securityId: payload.securityId,
      exchangeSegment: payload.exchangeSegment,
      instrument: payload.instrument,
      timeframe: isDaily ? '1D' : `${interval}m`
    });
  }

  normalizeInterval(timeframe) {
    const normalized = String(timeframe).toLowerCase();
    if (['1d', 'day', 'daily'].includes(normalized)) return '1D';
    const minutes = normalized.replace('m', '');
    if (!['1', '5', '15', '25', '60'].includes(minutes)) {
      throw new Error('Dhan intraday interval must be one of 1, 5, 15, 25, 60 minutes');
    }
    return minutes;
  }

  normalizeCandles(data, meta) {
    const timestamps = data.timestamp || [];
    return timestamps.map((ts, index) => ({
      broker: 'dhan',
      ...meta,
      symbol: String(meta.symbol).toUpperCase(),
      timestamp: new Date(Number(ts) * 1000),
      open: Number(data.open?.[index]),
      high: Number(data.high?.[index]),
      low: Number(data.low?.[index]),
      close: Number(data.close?.[index]),
      volume: Number(data.volume?.[index] || 0),
      openInterest: Number(data.open_interest?.[index] || 0)
    }));
  }
}

module.exports = DhanHistoricalDataService;
