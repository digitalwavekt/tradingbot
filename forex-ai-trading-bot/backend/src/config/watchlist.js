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
};
