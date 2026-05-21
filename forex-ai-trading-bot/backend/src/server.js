const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { bootstrapDefaults } = require('./services/config/AppConfigService');
const { bootstrapEventBus } = require('./core/events/EventBusBootstrap');

// Services
const tradeDecisionEngine = require('./services/trading/TradeDecisionEngine');
const riskEngine = require('./services/risk/RiskEngine');
const aiEngine = require('./services/ai/AIReasoningEngine');

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

app.use('/api/auth/', authLimiter);
app.use(limiter);

app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
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
    connectRedis();
    await bootstrapEventBus();
    await bootstrapDefaults();

    await tradeDecisionEngine.initialize();
    await aiEngine.initialize();

    scheduler.start();

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

const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  await initializeServices();
});

createWebSocketServer(server);

module.exports = app;
