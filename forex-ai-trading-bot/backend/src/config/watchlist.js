<<<<<<< HEAD
const NIFTY_50_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "ICICIBANK",
  "BHARTIARTL",
  "INFY",
  "ITC",
  "LT",
  "SBIN",
  "AXISBANK",
  "KOTAKBANK",
  "HINDUNILVR",
  "BAJFINANCE",
  "M&M",
  "HCLTECH",
  "SUNPHARMA",
  "MARUTI",
  "TITAN",
  "ULTRACEMCO",
  "NTPC",
  "TATAMOTORS",
  "POWERGRID",
  "BAJAJFINSV",
  "TECHM",
  "ONGC",
  "TATASTEEL",
  "COALINDIA",
  "ADANIPORTS",
  "ADANIENT",
  "JSWSTEEL",
  "GRASIM",
  "CIPLA",
  "DRREDDY",
  "NESTLEIND",
  "WIPRO",
  "HDFCLIFE",
  "SBILIFE",
  "BRITANNIA",
  "EICHERMOT",
  "APOLLOHOSP",
  "HINDALCO",
  "BAJAJ-AUTO",
  "BPCL",
  "DIVISLAB",
  "LTIM",
  "SHRIRAMFIN",
  "TATACONSUM",
  "HEROMOTOCO",
  "UPL",
  "ASIANPAINT"
];

const SENSEX_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "ICICIBANK",
  "BHARTIARTL",
  "INFY",
  "ITC",
  "LT",
  "SBIN",
  "AXISBANK",
  "KOTAKBANK",
  "HINDUNILVR",
  "BAJFINANCE",
  "M&M",
  "HCLTECH",
  "SUNPHARMA",
  "MARUTI",
  "TITAN",
  "ULTRACEMCO",
  "NTPC",
  "TATAMOTORS",
  "POWERGRID",
  "BAJAJFINSV",
  "TECHM",
  "TATASTEEL",
  "JSWSTEEL",
  "ASIANPAINT",
  "TRENT",
  "BEL",
  "ETERNAL"
];

function uniqueSymbols(symbols) {
  return [...new Set(symbols.filter(Boolean).map((s) => String(s).trim().toUpperCase()))];
}

function getWatchlist() {
  const mode = String(process.env.WATCHLIST_MODE || "MANUAL").toUpperCase();
  const indices = String(process.env.WATCHLIST_INDICES || "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

  let symbols = [];

  if (mode === "INDEX") {
    if (indices.includes("NIFTY50")) symbols.push(...NIFTY_50_SYMBOLS);
    if (indices.includes("SENSEX")) symbols.push(...SENSEX_SYMBOLS);
  }

  if (!symbols.length && process.env.WATCHLIST_SYMBOLS) {
    symbols = process.env.WATCHLIST_SYMBOLS.split(",");
  }

  return uniqueSymbols(symbols);
}

module.exports = {
  getWatchlist,
  NIFTY_50_SYMBOLS,
  SENSEX_SYMBOLS
=======
const MANUAL_WATCHLIST = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'ICICIBANK',
  'INFY',
  'SBIN',
  'BHARTIARTL',
  'ITC',
  'LT',
  'AXISBANK',
  'KOTAKBANK',
  'HINDUNILVR',
  'BAJFINANCE',
  'ASIANPAINT',
  'MARUTI',
  'SUNPHARMA',
  'TITAN',
  'ULTRACEMCO',
  'WIPRO',
  'ONGC',
  'NTPC',
  'POWERGRID',
  'M&M',
  'TECHM',
  'HCLTECH',
  'NESTLEIND',
  'JSWSTEEL',
  'TATASTEEL',
  'ADANIENT',
  'ADANIPORTS',
  'COALINDIA',
  'BAJAJFINSV',
  'HDFCLIFE',
  'SBILIFE',
  'BRITANNIA',
  'CIPLA',
  'DRREDDY',
  'EICHERMOT',
  'GRASIM',
  'HEROMOTOCO',
  'HINDALCO',
  'INDUSINDBK',
  'APOLLOHOSP',
  'BAJAJ-AUTO',
  'BPCL',
  'DIVISLAB',
  'TATACONSUM',
  'UPL',
  'SHREECEM',
  'HDFCAMC',
  'PIDILITIND'
];

function getWatchlist() {
  if (String(process.env.WATCHLIST_MODE || 'MANUAL').toUpperCase() !== 'MANUAL') {
    return MANUAL_WATCHLIST;
  }

  const envSymbols = String(process.env.MANUAL_WATCHLIST || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  const symbols = envSymbols.length ? envSymbols : MANUAL_WATCHLIST;
  return [...new Set(symbols)].filter((symbol) => !['TATAMOTORS', 'LTIM'].includes(symbol));
}

module.exports = {
  MANUAL_WATCHLIST,
  getWatchlist
 51227e5 (Add rule-based paper trading engine)
};
