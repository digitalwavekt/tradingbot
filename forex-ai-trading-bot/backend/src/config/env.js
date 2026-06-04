const { assertJwtConfig } = require('../utils/tokenService');

function isEnabled(value) {
  return String(value).toLowerCase() === 'true';
}

function requireEnv(key, message) {
  if (!process.env[key] || String(process.env[key]).trim().length === 0) {
    throw new Error(message || `${key} is required in production`);
  }
}

function getAiProvider() {
  return String(process.env.AI_PROVIDER || 'gemini').toLowerCase();
}

function isAiEnabled() {
  return isEnabled(process.env.AI_ENABLED) && String(process.env.STRATEGY_MODE || '').toUpperCase() !== 'RULE_BASED';
}

function validateStartupEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  assertJwtConfig({ production: true });

  const required = [
    'MONGO_URI',
    'REDIS_URL',
    'FRONTEND_URL',
    'ENCRYPTION_KEY',
    'DHAN_CLIENT_ID',
    'DHAN_API_BASE_URL',
    'DHAN_WS_URL'
  ];

  for (const key of required) {
    requireEnv(key);
  }

  if (String(process.env.ENCRYPTION_KEY).length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');
  }

  const autoDhanTokenEnabled = isEnabled(process.env.ENABLE_DHAN_AUTO_TOKEN);

  if (autoDhanTokenEnabled) {
    requireEnv(
      'DHAN_PIN',
      'DHAN_PIN is required in production when ENABLE_DHAN_AUTO_TOKEN=true'
    );

    requireEnv(
      'DHAN_TOTP_SECRET',
      'DHAN_TOTP_SECRET is required in production when ENABLE_DHAN_AUTO_TOKEN=true'
    );
  } else {
    requireEnv(
      'DHAN_ACCESS_TOKEN',
      'DHAN_ACCESS_TOKEN is required in production when ENABLE_DHAN_AUTO_TOKEN is not true'
    );
  }

  const aiProvider = getAiProvider();

  if (!['openai', 'gemini'].includes(aiProvider)) {
    throw new Error('AI_PROVIDER must be either openai or gemini');
  }

  if (isAiEnabled() && aiProvider === 'gemini') {
    requireEnv(
      'GEMINI_API_KEY',
      'GEMINI_API_KEY is required in production when AI_PROVIDER=gemini'
    );
  }

  if (isAiEnabled() && aiProvider === 'openai') {
    requireEnv(
      'OPENAI_API_KEY',
      'OPENAI_API_KEY is required in production when AI_PROVIDER=openai'
    );
  }

  if (isEnabled(process.env.ENABLE_LIVE_AUTO) && !isEnabled(process.env.ALLOW_LIVE_TRADING)) {
    throw new Error('ENABLE_LIVE_AUTO cannot be true when ALLOW_LIVE_TRADING is false');
  }
}

module.exports = { validateStartupEnv };
