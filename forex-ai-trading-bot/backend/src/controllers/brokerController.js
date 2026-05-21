const { createBrokerAdapter } = require('../broker');
let adapter = null;

function getAdapter() {
  if (!adapter) adapter = createBrokerAdapter('dhan');
  return adapter;
}

async function status(req, res) {
  try {
    const a = getAdapter();
    const health = await a.health();
    return res.json({ ok: true, health });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function connectDhan(req, res) {
  try {
    const a = getAdapter();
    await a.connect();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanProfile(req, res) {
  try {
    const a = getAdapter();
    const profile = await a.getProfile();
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanFunds(req, res) {
  try {
    const a = getAdapter();
    const funds = await a.getFunds();
    return res.json(funds);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function instruments(req, res) {
  try {
    const a = getAdapter();
    const results = await a.fetchInstruments(req.query || {});
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function syncInstruments(req, res) {
  try {
    const a = getAdapter();
    const results = await a.syncInstruments(req.body || {});
    return res.json({ ok: true, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanPositions(req, res) {
  try {
    const positions = await getAdapter().getPositions();
    return res.json(positions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanHoldings(req, res) {
  try {
    const holdings = await getAdapter().getHoldings();
    return res.json(holdings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanOrderBook(req, res) {
  try {
    const orders = await getAdapter().getOrderBook();
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function dhanTradeBook(req, res) {
  try {
    const trades = await getAdapter().getTradeBook();
    return res.json(trades);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  status,
  connectDhan,
  dhanProfile,
  dhanFunds,
  instruments,
  syncInstruments,
  dhanPositions,
  dhanHoldings,
  dhanOrderBook,
  dhanTradeBook
};
