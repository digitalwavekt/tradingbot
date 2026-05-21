const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { getRedis } = require('../config/redis');
const { SystemHealth } = require('../models');
const brokerLayer = require('../services/broker/BrokerAbstractionLayer');

router.get('/', async (req, res) => {
  try {
    const checks = {
      api: { status: 'HEALTHY', latency: 0 },
      database: { status: mongoose.connection.readyState === 1 ? 'HEALTHY' : 'DOWN', latency: 0 },
      redis: { status: 'HEALTHY', latency: 0 }
    };

    // Check Redis
    const redis = getRedis();
    if (redis) {
      const start = Date.now();
      await redis.ping();
      checks.redis.latency = Date.now() - start;
    } else {
      checks.redis.status = 'DOWN';
    }

    let brokerHealth = { status: 'UNAVAILABLE', message: 'Broker health check not implemented' };
    if (typeof brokerLayer.healthCheck === 'function') {
      try {
        brokerHealth = await brokerLayer.healthCheck();
      } catch (error) {
        brokerHealth = { status: 'UNHEALTHY', error: error.message };
      }
    }

    const overall = Object.values(checks).every(c => c.status === 'HEALTHY') ? 'HEALTHY' : 'DEGRADED';

    res.json({
      status: overall,
      timestamp: new Date().toISOString(),
      checks,
      brokers: brokerHealth
    });
  } catch (error) {
    res.status(503).json({
      status: 'UNHEALTHY',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
