const DhanApiClient = require('./DhanApiClient');
const Instrument = require('../../models/Instrument');

const INDIAN_EQUITY_MIN_PRICE = 10;

function toUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value) {
  if (!value) return undefined;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function isValidPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isEquityInstrument(instrument) {
  const segment = toUpper(instrument?.exchangeSegment);
  const type = toUpper(instrument?.instrument || instrument?.instrumentType);

  return (
    segment === 'NSE_EQ' ||
    segment === 'BSE_EQ' ||
    type === 'EQUITY' ||
    type === 'EQ'
  );
}

function isValidIndianEquityPrice(instrument, price) {
  if (!isEquityInstrument(instrument)) {
    return isValidPositiveNumber(price);
  }

  const n = Number(price);
  return Number.isFinite(n) && n >= INDIAN_EQUITY_MIN_PRICE;
}

class DhanHistoricalDataService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
  }

  async resolveInstrument(symbol, opts = {}) {
    if (opts.securityId) {
      return {
        broker: 'dhan',
        symbol: toUpper(symbol || opts.symbol),
        securityId: String(opts.securityId),
        exchangeSegment: opts.exchangeSegment || 'NSE_EQ',
        instrument: opts.instrument || 'EQUITY',
        isActive: true
      };
    }

    const normalizedSymbol = toUpper(symbol);
    const exchangeSegment = opts.exchangeSegment || 'NSE_EQ';

    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol: normalizedSymbol,
      exchangeSegment,
      isActive: true
    }).sort({
      updatedAt: -1
    });

    if (!instrument?.securityId) {
      throw new Error(`Unable to resolve Dhan securityId for ${normalizedSymbol}`);
    }

    return instrument;
  }

  async fetchOHLC(symbol, timeframe = '1m', opts = {}) {
    const instrument = await this.resolveInstrument(symbol, opts);

    const interval = this.normalizeInterval(timeframe);
    const isDaily = interval === '1D';

    const payload = {
      securityId: String(instrument.securityId),
      exchangeSegment: instrument.exchangeSegment || opts.exchangeSegment || 'NSE_EQ',
      instrument: instrument.instrument || opts.instrument || 'EQUITY',
      oi: Boolean(opts.oi),
      fromDate: normalizeDate(opts.fromDate),
      toDate: normalizeDate(opts.toDate)
    };

    if (!payload.fromDate || !payload.toDate) {
      throw new Error('fromDate and toDate are required for Dhan historical sync');
    }

    if (!isDaily) {
      payload.interval = interval;
    }

    if (opts.expiryCode !== undefined) {
      payload.expiryCode = opts.expiryCode;
    }

    const endpoint = isDaily ? '/charts/historical' : '/charts/intraday';

    const response = await this.client.request('post', endpoint, payload);

    const candles = this.normalizeCandles(response, {
      symbol: instrument.symbol || symbol,
      securityId: payload.securityId,
      exchangeSegment: payload.exchangeSegment,
      instrument: payload.instrument,
      timeframe: isDaily ? '1D' : `${interval}m`
    });

    this.validateCandles(candles, instrument, {
      symbol: instrument.symbol || symbol,
      endpoint,
      payload
    });

    return candles;
  }

  normalizeInterval(timeframe) {
    const normalized = String(timeframe || '1m').toLowerCase();

    if (['1d', 'day', 'daily'].includes(normalized)) {
      return '1D';
    }

    const minutes = normalized.replace('m', '');

    if (!['1', '5', '15', '25', '60'].includes(minutes)) {
      throw new Error('Dhan intraday interval must be one of 1, 5, 15, 25, 60 minutes');
    }

    return minutes;
  }

  normalizeCandles(data, meta) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid Dhan historical response: empty response');
    }

    const timestamps = Array.isArray(data.timestamp) ? data.timestamp : [];
    const open = Array.isArray(data.open) ? data.open : [];
    const high = Array.isArray(data.high) ? data.high : [];
    const low = Array.isArray(data.low) ? data.low : [];
    const close = Array.isArray(data.close) ? data.close : [];
    const volume = Array.isArray(data.volume) ? data.volume : [];
    const openInterest = Array.isArray(data.open_interest) ? data.open_interest : [];

    if (!timestamps.length) {
      return [];
    }

    return timestamps.map((ts, index) => ({
      broker: 'dhan',
      ...meta,
      symbol: toUpper(meta.symbol),
      timestamp: new Date(Number(ts) * 1000),
      open: Number(open[index]),
      high: Number(high[index]),
      low: Number(low[index]),
      close: Number(close[index]),
      volume: Number(volume[index] || 0),
      openInterest: Number(openInterest[index] || 0),
      source: 'DHAN'
    }));
  }

  validateCandles(candles, instrument, context = {}) {
    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error(
        `Dhan returned 0 candles for ${context.symbol}. Check securityId/date range/subscription.`
      );
    }

    const invalidFormat = candles.find(candle => {
      return (
        !Number.isFinite(candle.timestamp?.getTime?.()) ||
        !isValidPositiveNumber(candle.open) ||
        !isValidPositiveNumber(candle.high) ||
        !isValidPositiveNumber(candle.low) ||
        !isValidPositiveNumber(candle.close) ||
        Number(candle.high) < Number(candle.low)
      );
    });

    if (invalidFormat) {
      throw new Error(
        `Invalid Dhan candle format for ${context.symbol}: ${JSON.stringify(invalidFormat)}`
      );
    }

    if (isEquityInstrument(instrument)) {
      const badEquityPrice = candles.find(candle => {
        return (
          !isValidIndianEquityPrice(instrument, candle.open) ||
          !isValidIndianEquityPrice(instrument, candle.high) ||
          !isValidIndianEquityPrice(instrument, candle.low) ||
          !isValidIndianEquityPrice(instrument, candle.close)
        );
      });

      if (badEquityPrice) {
        throw new Error(
          [
            `Dhan returned suspicious NSE/BSE equity price for ${context.symbol}.`,
            `securityId=${instrument.securityId}`,
            `exchangeSegment=${instrument.exchangeSegment}`,
            `instrument=${instrument.instrument}`,
            `open=${badEquityPrice.open}`,
            `high=${badEquityPrice.high}`,
            `low=${badEquityPrice.low}`,
            `close=${badEquityPrice.close}`,
            `timestamp=${badEquityPrice.timestamp?.toISOString?.()}`,
            'This usually means wrong instrument/securityId mapping or corrupted response parsing. Refusing to save.'
          ].join(' ')
        );
      }
    }
  }
}

module.exports = DhanHistoricalDataService;