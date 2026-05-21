module.exports = {
  apiBaseUrl: process.env.DHAN_API_BASE_URL || 'https://api.dhan.com',
  wsUrl: process.env.DHAN_WS_URL || 'wss://ws.dhan.com',
  clientId: process.env.DHAN_CLIENT_ID,
  accessToken: process.env.DHAN_ACCESS_TOKEN,
  requestTimeout: 10000,
  maxRetries: 3,
};
