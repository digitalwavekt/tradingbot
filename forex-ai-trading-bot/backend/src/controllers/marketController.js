async function syncHistorical(req, res) {
  const {
    symbol,
    timeframe = '1D',
    fromDate,
    toDate,
    exchangeSegment = 'NSE_EQ'
  } = req.body;

  if (!symbol || !fromDate || !toDate) {
    return res.status(400).json({
      ok: false,
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
        last: candles[candles.length - 1]?.timestamp,
        firstClose: candles[0]?.close,
        lastClose: candles[candles.length - 1]?.close
      },
      severity: 'INFO',
      ipAddress: req.ip
    }).catch(() => {});

    return res.json({
      ok: true,
      count: candles.length,
      first: candles[0],
      last: candles[candles.length - 1]
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
        fromDate,
        toDate,
        error: error.message
      },
      severity: 'ERROR',
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
}