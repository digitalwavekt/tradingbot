const express = require('express');
const router = express.Router();
const broker = require('../controllers/brokerController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/status', authenticate, broker.status);
router.post('/dhan/connect', authenticate, authorize(['admin', 'subadmin']), broker.connectDhan);
router.get('/dhan/profile', authenticate, authorize(['admin', 'subadmin']), broker.dhanProfile);
router.get('/dhan/funds', authenticate, authorize(['admin', 'subadmin']), broker.dhanFunds);
router.get('/dhan/positions', authenticate, authorize(['admin', 'subadmin']), broker.dhanPositions);
router.get('/dhan/holdings', authenticate, authorize(['admin', 'subadmin']), broker.dhanHoldings);
router.get('/dhan/orders', authenticate, authorize(['admin', 'subadmin']), broker.dhanOrderBook);
router.get('/dhan/trades', authenticate, authorize(['admin', 'subadmin']), broker.dhanTradeBook);
router.get('/dhan/instruments', authenticate, broker.instruments);
router.post('/dhan/sync-instruments', authenticate, authorize(['admin', 'subadmin']), broker.syncInstruments);

module.exports = router;
