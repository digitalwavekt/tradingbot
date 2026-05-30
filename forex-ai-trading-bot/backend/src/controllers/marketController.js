const Watchlist = require('../models/Watchlist');
const Candle = require('../models/Candle');
const Instrument = require('../models/Instrument');
const DhanMarketDataService = require('../services/dhan/DhanMarketDataService');
const DhanHistoricalDataService = require('../services/dhan/DhanHistoricalDataService');
const AuditLog = require('../models/AuditLog');

const marketData = new DhanMarketDataService();
const historicalData = new DhanHistoricalDataService();

async function getWatchlist(req, res, next) {
  try {
    const items = await Watchlist.find({
      user: req.user._id,
      isActive: true
    }).sort({ symbol: 1 });

    return res.json(items);
  } catch (error) {
    return next(error);
  }
}

async function addWatchlist(req, res, next) {
  try {
    const { symbol, exchangeSegment = 'NSE_EQ' } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol: String(symbol).toUpperCase(),
      exchangeSegment,
      isActive: true
    });

    if (!instrument) {
      return res.status(404).json({
        error: 'Instrument not synced. Run Dhan instrument sync first.'
      });
    }

    const item = await Watchlist.findOneAndUpdate(
      {
        user: req.user._id,
        symbol: instrument.symbol,
        exchangeSegment
      },
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
  } catch (error) {
    return next(error);
  }
}

async function deleteWatchlist(req, res, next) {
  try {
    await Watchlist.updateOne(
      { _id: req.params.id, user: req.user._id },
      { isActive: false }
    );

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function getLtp(req, res, next) {
  try {
    const quote = await marketData.getLTP(req.params.symbol);
    return res.json(quote);
  } catch (error) {
    return next(error);
  }
}

async function getCandles(req, res, next) {
  try {
    const candles = await Candle.find({
      symbol: String(req.params.symbol).toUpperCase(),
      timeframe: req.query.timeframe || '1D'
    })
      .sort({ timestamp: -1 })
      .limit(Number(req.query.limit || 200));

    return res.json(candles.reverse());
  } catch (error) {
    return next(error);
  }
}

async function syncHistorical(req, res, next) {
  const {
    symbol,
    timeframe = '1D',
    fromDate,
    toDate,
    exchangeSegment = 'NSE_EQ'
  } = req.body;

  if (!symbol || !fromDate || !toDate) {
    return res.status(400).json({
      error: 'symbol, fromDate and toDate are required'
    });
  }

  try {
    const candles = await historicalData.fetchOHLC(symbol, timeframe, {
      fromDate,
      toDate,
      exchangeSegment
    });

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
      userId: req.user?._id,
      userEmail: req.user?.email,
      details: {
        broker: 'dhan',
        symbol: String(symbol).toUpperCase(),
        timeframe,
        exchangeSegment,
        count: candles.length,
        first: candles[0]?.timestamp,
        last: candles[candles.length - 1]?.timestamp
      },
      severity: 'INFO',
      ipAddress: req.ip
    }).catch(() => {});

    return res.json({
      ok: true,
      count: candles.length,
      first: candles[0] || null,
      last: candles[candles.length - 1] || null
    });
  } catch (error) {
    await AuditLog.create({
      action: 'MARKET_DATA_SYNC_FAILED',
      userId: req.user?._id,
      userEmail: req.user?.email,
      details: {
        broker: 'dhan',
        symbol: String(symbol).toUpperCase(),
        timeframe,
        exchangeSegment,
        error: error.message
      },
      severity: 'ERROR',
      ipAddress: req.ip
    }).catch(() => {});

    return next(error);
  }
}

module.exports = {
  getWatchlist,
  addWatchlist,
  deleteWatchlist,
  getLtp,
  getCandles,
  syncHistorical
};