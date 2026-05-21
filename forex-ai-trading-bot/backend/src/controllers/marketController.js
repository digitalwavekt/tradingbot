const Watchlist = require('../models/Watchlist');
const Candle = require('../models/Candle');
const Instrument = require('../models/Instrument');
const DhanMarketDataService = require('../services/dhan/DhanMarketDataService');
const DhanHistoricalDataService = require('../services/dhan/DhanHistoricalDataService');
const AuditLog = require('../models/AuditLog');

const marketData = new DhanMarketDataService();
const historicalData = new DhanHistoricalDataService();

async function getWatchlist(req, res) {
  const items = await Watchlist.find({
    user: req.user._id,
    isActive: true
  }).sort({ symbol: 1 });
  return res.json(items);
}

async function addWatchlist(req, res) {
  const { symbol, exchangeSegment = 'NSE_EQ' } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const instrument = await Instrument.findOne({
    broker: 'dhan',
    symbol: String(symbol).toUpperCase(),
    exchangeSegment,
    isActive: true
  });
  if (!instrument) return res.status(404).json({ error: 'Instrument not synced. Run Dhan instrument sync first.' });

  const item = await Watchlist.findOneAndUpdate(
    { user: req.user._id, symbol: instrument.symbol, exchangeSegment },
    {
      user: req.user._id,
      symbol: instrument.symbol,
      securityId: instrument.securityId,
      exchangeSegment,
      instrument: instrument.instrument,
      isActive: true
    },
    { upsert: true, new: true }
  );
  return res.status(201).json(item);
}

async function deleteWatchlist(req, res) {
  await Watchlist.updateOne({ _id: req.params.id, user: req.user._id }, { isActive: false });
  return res.json({ ok: true });
}

async function getLtp(req, res) {
  const quote = await marketData.getLTP(req.params.symbol);
  return res.json(quote);
}

async function getCandles(req, res) {
  const candles = await Candle.find({
    symbol: String(req.params.symbol).toUpperCase(),
    timeframe: req.query.timeframe || '1D'
  }).sort({ timestamp: -1 }).limit(Number(req.query.limit || 200));
  return res.json(candles.reverse());
}

async function syncHistorical(req, res) {
  const { symbol, timeframe = '1D', fromDate, toDate, exchangeSegment = 'NSE_EQ' } = req.body;
  if (!symbol || !fromDate || !toDate) {
    return res.status(400).json({ error: 'symbol, fromDate and toDate are required' });
  }

  const candles = await historicalData.fetchOHLC(symbol, timeframe, { fromDate, toDate, exchangeSegment });
  for (const candle of candles) {
    await Candle.updateOne(
      {
        broker: candle.broker,
        securityId: candle.securityId,
        timeframe: candle.timeframe,
        timestamp: candle.timestamp
      },
      { $set: candle },
      { upsert: true }
    );
  }
  await AuditLog.create({
    action: 'MARKET_DATA_SYNC',
    userId: req.user._id,
    userEmail: req.user.email,
    details: { broker: 'dhan', symbol, timeframe, count: candles.length },
    severity: 'INFO',
    ipAddress: req.ip
  });
  return res.json({ ok: true, count: candles.length });
}

module.exports = {
  getWatchlist,
  addWatchlist,
  deleteWatchlist,
  getLtp,
  getCandles,
  syncHistorical
};
