const express = require('express');
const marketController = require('../controllers/marketController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function requireHandler(name) {
  const handler = marketController[name];

  if (typeof handler !== 'function') {
    throw new Error(
      `marketController.${name} is not exported. Available exports: ${Object.keys(marketController).join(', ')}`
    );
  }

  return handler;
}

router.get('/watchlist', authenticate, requireHandler('getWatchlist'));
router.post('/watchlist', authenticate, requireHandler('addWatchlist'));
router.delete('/watchlist/:id', authenticate, requireHandler('deleteWatchlist'));

router.get('/ltp/:symbol', authenticate, requireHandler('getLtp'));
router.get('/candles/:symbol', authenticate, requireHandler('getCandles'));

router.post('/sync-historical', authenticate, requireHandler('syncHistorical'));
router.post('/sync-candles', authenticate, requireHandler('syncHistorical'));
router.post('/candles/sync', authenticate, requireHandler('syncHistorical'));

module.exports = router;