const express = require('express');
const {
  getWatchlist,
  addWatchlist,
  deleteWatchlist,
  getLtp,
  getCandles,
  syncHistorical
} = require('../controllers/marketController');

const auth = require('../middleware/auth');

const router = express.Router();

// Public/health-style market read routes can stay protected or public based on your app.
// Keeping auth here because watchlist/sync actions are user/admin related.
router.get('/watchlist', auth, getWatchlist);
router.post('/watchlist', auth, addWatchlist);
router.delete('/watchlist/:id', auth, deleteWatchlist);

router.get('/ltp/:symbol', auth, getLtp);
router.get('/candles/:symbol', auth, getCandles);
router.post('/sync-historical', auth, syncHistorical);

// Compatibility aliases if frontend/old scripts use these paths
router.post('/sync-candles', auth, syncHistorical);
router.post('/candles/sync', auth, syncHistorical);

module.exports = router;