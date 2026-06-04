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
};
