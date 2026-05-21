const express = require('express');
const router = express.Router();
const market = require('../controllers/marketController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/watchlist', authenticate, market.getWatchlist);
router.post('/watchlist', authenticate, market.addWatchlist);
router.delete('/watchlist/:id', authenticate, market.deleteWatchlist);
router.get('/ltp/:symbol', authenticate, market.getLtp);
router.get('/candles/:symbol', authenticate, market.getCandles);
router.post('/historical/sync', authenticate, authorize(['admin', 'subadmin']), market.syncHistorical);

module.exports = router;
