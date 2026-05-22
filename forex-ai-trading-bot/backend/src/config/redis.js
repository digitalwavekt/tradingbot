const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

const connectRedis = async () => {
  const redisEnabled = process.env.ENABLE_REDIS === 'true';

  if (!redisEnabled) {
    logger.warn('Redis disabled. Set ENABLE_REDIS=true to enable Redis.');
    redis = null;
    return null;
  }

  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required when ENABLE_REDIS=true');
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      // Important: do not send commands before connection is ready
      lazyConnect: true,

      // Keep this true for startup stability. False causes:
      // "Stream isn't writeable and enableOfflineQueue options is false"
      enableOfflineQueue: true,

      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 15000,

      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('Redis retry limit reached. Stopping reconnect attempts.');
          return null;
        }

        return Math.min(times * 300, 3000);
      },

      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
    });

    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });

    redis.on('reconnecting', (delay) => {
      logger.warn(`Redis reconnecting in ${delay}ms...`);
    });

    redis.on('end', () => {
      logger.warn('Redis connection ended');
    });

    await redis.connect();
    await redis.ping();

    logger.info('Redis ping successful');

    return redis;
  } catch (error) {
    redis = null;
    logger.error(`Redis connection failed: ${error.message}`);
    throw error;
  }
};

const getRedis = () => redis;

const requireRedis = () => {
  if (!redis) {
    throw new Error('Redis is not connected');
  }

  return redis;
};

module.exports = {
  connectRedis,
  getRedis,
  requireRedis
};