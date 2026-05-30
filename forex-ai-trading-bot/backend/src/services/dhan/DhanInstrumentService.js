const axios = require('axios');
const Instrument = require('../../models/Instrument');
const AuditLog = require('../../models/AuditLog');

class DhanInstrumentService {
  constructor(config = {}) {
    this.masterUrl =
      config.instrumentMasterUrl ||
      process.env.DHAN_INSTRUMENT_MASTER_URL ||
      'https://images.dhan.co/api-data/api-scrip-master.csv';
  }

  async fetchInstruments(params = {}) {
    const response = await axios.get(this.masterUrl, {
      timeout: 60000,
      responseType: 'text'
    });

    const rows = this.parseCsv(response.data);

    const filtered = rows.filter(row => {
      const normalized = this.normalize(row);

      if (!normalized.securityId || !normalized.symbol) return false;

      if (params.exchangeSegment && normalized.exchangeSegment !== params.exchangeSegment) {
        return false;
      }

      if (params.instrument && normalized.instrument !== params.instrument) {
        return false;
      }

      if (params.symbols && Array.isArray(params.symbols)) {
        return params.symbols.includes(normalized.symbol);
      }

      return true;
    });

    return filtered.map(row => this.normalize(row));
  }

  async resolveSymbol(symbol) {
    const normalizedSymbol = String(symbol || '').toUpperCase().trim();

    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol: normalizedSymbol,
      exchangeSegment: 'NSE_EQ',
      isActive: true
    });

    if (!instrument) {
      throw new Error(`Instrument not found: ${normalizedSymbol}`);
    }

    return instrument;
  }

  async syncInstruments(params = {}) {
    const instruments = await this.fetchInstruments(params);

    let upserted = 0;

    for (const instrument of instruments) {
      if (!instrument.securityId || !instrument.symbol) continue;

      await Instrument.updateOne(
        {
          broker: 'dhan',
          symbol: instrument.symbol,
          exchangeSegment: instrument.exchangeSegment
        },
        {
          $set: {
            ...instrument,
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true }
      );

      upserted += 1;
    }

    await AuditLog.create({
      action: 'INSTRUMENT_SYNC',
      details: { broker: 'dhan', count: upserted, params },
      severity: 'INFO'
    }).catch(() => {});

    return { count: upserted };
  }

  parseCsv(csv) {
    const lines = String(csv).split(/\r?\n/).filter(Boolean);
    const headers = this.splitCsvLine(lines.shift()).map(header => header.trim());

    return lines.map(line => {
      const values = this.splitCsvLine(line);

      return headers.reduce((record, header, index) => {
        record[header] = values[index];
        return record;
      }, {});
    });
  }

  splitCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;

    for (const char of String(line)) {
      if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);

    return values.map(value => value.trim().replace(/^"|"$/g, ''));
  }

  mapExchangeSegment(row) {
    const exchange = String(row.SEM_EXM_EXCH_ID || row.EXCH_ID || '').toUpperCase().trim();
    const segment = String(row.SEM_SEGMENT || row.SEGMENT || '').toUpperCase().trim();

    if (exchange === 'NSE' && segment === 'E') return 'NSE_EQ';
    if (exchange === 'BSE' && segment === 'E') return 'BSE_EQ';
    if (exchange === 'NSE' && segment === 'D') return 'NSE_FNO';
    if (exchange === 'BSE' && segment === 'D') return 'BSE_FNO';
    if (exchange === 'NSE' && segment === 'C') return 'NSE_CURRENCY';
    if (exchange === 'BSE' && segment === 'C') return 'BSE_CURRENCY';
    if (exchange === 'MCX' && segment === 'M') return 'MCX_COMM';

    const direct = row.exchangeSegment || row.exchange_segment;
    if (direct) return String(direct).toUpperCase().trim();

    return exchange || 'NSE_EQ';
  }

  normalizeSymbol(value) {
    return String(value || '')
      .toUpperCase()
      .trim()
      .replace(/-EQ$/, '')
      .replace(/\s+EQ$/, '');
  }

  normalize(row) {
    const tradingSymbol =
      row.SEM_TRADING_SYMBOL ||
      row.TRADING_SYMBOL ||
      row.tradingSymbol ||
      row.SYMBOL_NAME ||
      row.symbol;

    const customSymbol =
      row.SEM_CUSTOM_SYMBOL ||
      row.CUSTOM_SYMBOL ||
      row.DISPLAY_NAME ||
      tradingSymbol;

    const symbolName =
      row.SM_SYMBOL_NAME ||
      row.UNDERLYING_SYMBOL ||
      row.SYMBOL ||
      tradingSymbol ||
      customSymbol;

    const exchangeSegment = this.mapExchangeSegment(row);
    const instrument = row.SEM_INSTRUMENT_NAME || row.INSTRUMENT || row.instrument || 'EQUITY';

    const symbol = this.normalizeSymbol(
      row.SM_SYMBOL_NAME ||
      row.UNDERLYING_SYMBOL ||
      tradingSymbol ||
      customSymbol
    );

    return {
      broker: 'dhan',
      securityId: String(row.SEM_SMST_SECURITY_ID || row.SECURITY_ID || row.securityId || '').trim(),
      symbol,
      tradingSymbol: this.normalizeSymbol(tradingSymbol || symbolName),
      name: customSymbol || symbolName || symbol,
      displayName: customSymbol || symbolName || symbol,
      exchangeSegment,
      instrument,
      isin: row.SEM_ISIN_CODE || row.ISIN,
      lotSize: Number(row.SEM_LOT_UNITS || row.LOT_SIZE || 1),
      tickSize: Number(row.SEM_TICK_SIZE || row.TICK_SIZE || 0.05),
      expiryDate: row.SEM_EXPIRY_DATE ? new Date(row.SEM_EXPIRY_DATE) : undefined,
      strikePrice: Number(row.SEM_STRIKE_PRICE || 0),
      optionType: row.SEM_OPTION_TYPE || undefined,
      isActive: true,
      source: 'DHAN_MASTER_CSV',
      raw: row
    };
  }
}

module.exports = DhanInstrumentService;