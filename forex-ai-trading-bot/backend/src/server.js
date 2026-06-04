const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const { validateStartupEnv } = require('./config/env');
const logger = require('./utils/logger');
const { bootstrapDefaults } = require('./services/config/AppConfigService');
const { bootstrapEventBus } = require('./core/events/EventBusBootstrap');

// Services
const tradeDecisionEngine = require('./services/trading/TradeDecisionEngine');
const riskEngine = require('./services/risk/RiskEngine');
const aiEngine = require('./services/ai/AIReasoningEngine');

function shouldInitializeAi() {
  return (
    process.env.AI_ENABLED === 'true' &&
    process.env.RULE_BASED_TRADING !== 'true' &&
    String(process.env.STRATEGY_MODE || '').toUpperCase() !== 'RULE_BASED'
  );
}

// Routes
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const signalRoutes = require('./routes/signals');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const backtestRoutes = require('./routes/backtest');
const healthRoutes = require('./routes/health');
const brokerRoutes = require('./routes/broker');
const marketRoutes = require('./routes/market');

// Jobs
const scheduler = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

try {
  validateStartupEnv();
} catch (error) {
  console.error(`Startup environment validation failed: ${error.message}`);
  process.exit(1);
}

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || require('crypto').randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function hasUnsafeMongoKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasUnsafeMongoKey);
  return Object.keys(value).some(key => (
    key.startsWith('$') ||
    key.includes('.') ||
    hasUnsafeMongoKey(value[key])
  ));
}

function rejectMongoOperators(req, res, next) {
  if (hasUnsafeMongoKey(req.body) || hasUnsafeMongoKey(req.query) || hasUnsafeMongoKey(req.params)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  next();
}

app.set('trust proxy', 1);
app.use(requestId);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sensitive actions, please try again later.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/public-register', authLimiter);
app.use('/api/auth/refresh', sensitiveLimiter);
app.use('/api/admin/mode', sensitiveLimiter);
app.use('/api/admin/enable-live', sensitiveLimiter);
app.use('/api/admin/kill-switch', sensitiveLimiter);
app.use('/api/broker', sensitiveLimiter);
app.use(limiter);

app.use(compression());
app.use(morgan(':remote-addr :method :url :status :res[content-length] - :response-time ms :req[x-request-id]', {
  stream: { write: msg => logger.info(msg.trim()) }
}));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(rejectMongoOperators);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/health', healthRoutes);

// WebSocket
const { createWebSocketServer } = require('./websocket/server');

// Error handling
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { requestId: req.id, stack: err.stack });
  res.status(err.status || 500).json({
    requestId: req.id,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize
async function initializeServices() {
  try {
    await connectDB();
    await connectRedis();
    await bootstrapEventBus();
    await bootstrapDefaults();

    await tradeDecisionEngine.initialize();
    if (shouldInitializeAi()) {
      await aiEngine.initialize();
    } else {
      logger.info('AI initialization skipped because rule-based trading is active');
    }

    if (process.env.ENABLE_SCHEDULER === 'true') {
      scheduler.start();
      logger.info('Scheduler enabled');
    } else {
      logger.warn('Scheduler disabled. Set ENABLE_SCHEDULER=true to enable background jobs.');
    }

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error(`Service initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  await initializeServices();
});

createWebSocketServer(server);

module.exports = app;
