const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis;

const connectRedis = () => {
  try {
    redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    }) : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });

    redis.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });

    return redis;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return null;
  }
};

const getRedis = () => redis;

module.exports = { connectRedis, getRedis };
