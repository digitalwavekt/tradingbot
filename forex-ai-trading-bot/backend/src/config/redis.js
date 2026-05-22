const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

const buildRedisOptions = () => ({
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  connectTimeout: 10000,
  retryStrategy: (times) => {
    const delay = Math.min(times * 300, 3000);

    if (times > 10) {
      logger.error('Redis retry limit reached. Redis connection stopped.');
      return null;
    }

    return delay;
  }
});

const connectRedis = async () => {
  const redisEnabled = process.env.ENABLE_REDIS === 'true';

  if (!redisEnabled) {
    logger.warn('Redis is disabled. Set ENABLE_REDIS=true for production Redis connection.');
    redis = null;
    return null;
  }

  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required when ENABLE_REDIS=true');
  }

  try {
    const options = buildRedisOptions();

    redis = new Redis(process.env.REDIS_URL, {
      ...options,
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
      logger.error('Redis connection ended');
    });

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