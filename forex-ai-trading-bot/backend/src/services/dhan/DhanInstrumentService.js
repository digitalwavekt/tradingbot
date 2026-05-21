const axios = require('axios');
const Instrument = require('../../models/Instrument');
const AuditLog = require('../../models/AuditLog');

class DhanInstrumentService {
  constructor(config = {}) {
    this.masterUrl = config.instrumentMasterUrl || process.env.DHAN_INSTRUMENT_MASTER_URL || 'https://images.dhan.co/api-data/api-scrip-master.csv';
  }

  async fetchInstruments(params = {}) {
    const response = await axios.get(this.masterUrl, { timeout: 30000, responseType: 'text' });
    const rows = this.parseCsv(response.data);
    const filtered = rows.filter(row => {
      const exchangeSegment = row.EXCH_ID || row.SEM_EXM_EXCH_ID || row.exchangeSegment || row.exchange_segment;
      const instrument = row.INSTRUMENT || row.SEM_INSTRUMENT_NAME || row.instrument;
      if (params.exchangeSegment && exchangeSegment !== params.exchangeSegment) return false;
      if (params.instrument && instrument !== params.instrument) return false;
      return true;
    });
    return filtered.map(row => this.normalize(row));
  }

  async resolveSymbol(symbol) {
    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol: String(symbol).toUpperCase(),
      isActive: true
    });
    if (!instrument) throw new Error(`Instrument not found: ${symbol}`);
    return instrument;
  }

  async syncInstruments(params = {}) {
    const instruments = await this.fetchInstruments(params);
    let upserted = 0;
    for (const instrument of instruments) {
      if (!instrument.securityId || !instrument.symbol) continue;
      await Instrument.updateOne(
        { broker: 'dhan', securityId: instrument.securityId },
        { $set: instrument },
        { upsert: true }
      );
      upserted += 1;
    }
    await AuditLog.create({
      action: 'INSTRUMENT_SYNC',
      details: { broker: 'dhan', count: upserted, params },
      severity: 'INFO'
    });
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
      if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map(value => value.trim());
  }

  normalize(row) {
    const tradingSymbol = row.SEM_TRADING_SYMBOL || row.TRADING_SYMBOL || row.tradingSymbol || row.SYMBOL_NAME || row.symbol;
    const symbol = row.UNDERLYING_SYMBOL || row.SEM_CUSTOM_SYMBOL || tradingSymbol;
    return {
      broker: 'dhan',
      securityId: String(row.SEM_SMST_SECURITY_ID || row.SECURITY_ID || row.securityId || '').trim(),
      symbol: String(symbol || '').toUpperCase().trim(),
      tradingSymbol: String(tradingSymbol || symbol || '').toUpperCase().trim(),
      displayName: row.SEM_CUSTOM_SYMBOL || row.DISPLAY_NAME || tradingSymbol,
      exchangeSegment: row.SEM_EXM_EXCH_ID || row.EXCH_ID || row.exchangeSegment || 'NSE_EQ',
      instrument: row.SEM_INSTRUMENT_NAME || row.INSTRUMENT || row.instrument || 'EQUITY',
      isin: row.SEM_ISIN_CODE || row.ISIN,
      lotSize: Number(row.SEM_LOT_UNITS || row.LOT_SIZE || 1),
      tickSize: Number(row.SEM_TICK_SIZE || row.TICK_SIZE || 0.05),
      expiryDate: row.SEM_EXPIRY_DATE ? new Date(row.SEM_EXPIRY_DATE) : undefined,
      strikePrice: Number(row.SEM_STRIKE_PRICE || 0),
      optionType: row.SEM_OPTION_TYPE || undefined,
      raw: row
    };
  }
}

module.exports = DhanInstrumentService;
