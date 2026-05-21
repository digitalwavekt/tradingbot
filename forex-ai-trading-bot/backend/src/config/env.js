const { assertJwtConfig } = require('../utils/tokenService');

function validateStartupEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  assertJwtConfig({ production: true });

  const required = [
    'MONGO_URI',
    'REDIS_URL',
    'FRONTEND_URL',
    'ENCRYPTION_KEY',
    'DHAN_CLIENT_ID',
    'DHAN_ACCESS_TOKEN',
    'DHAN_API_BASE_URL',
    'DHAN_WS_URL'
  ];

  for (const key of required) {
    if (!process.env[key] || String(process.env[key]).trim().length === 0) {
      throw new Error(`${key} is required in production`);
    }
  }

  if (String(process.env.ENCRYPTION_KEY).length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');
  }

  if (process.env.ENABLE_LIVE_AUTO === 'true' && process.env.ALLOW_LIVE_TRADING !== 'true') {
    throw new Error('ENABLE_LIVE_AUTO cannot be true when ALLOW_LIVE_TRADING is false');
  }
}

module.exports = { validateStartupEnv };
