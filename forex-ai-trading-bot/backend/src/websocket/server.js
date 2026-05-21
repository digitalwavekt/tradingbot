const { Server } = require('ws');
const logger = require('../utils/logger');
const { Trade, Signal, MarketData, BotConfig, User } = require('../models');
const { verifyAccessToken, publicUser } = require('../utils/tokenService');

let wss = null;
const clients = new Map();

function createWebSocketServer(server) {
  wss = new Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const user = await authenticateSocket(req);
    if (!user) {
      ws.close(1008, 'Authentication required');
      return;
    }

    const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    clients.set(clientId, { ws, subscriptions: new Set(), user });

    logger.info(`WebSocket client connected: ${clientId} user=${user.email}`);

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'subscribe') {
          if (!canSubscribe(user, data.channel)) {
            ws.send(JSON.stringify({ type: 'error', error: 'Forbidden channel' }));
            return;
          }
          clients.get(clientId).subscriptions.add(data.channel);

          // Send initial data
          if (data.channel === 'trades') {
            const trades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } })
              .sort({ createdAt: -1 }).limit(20);
            ws.send(JSON.stringify({ type: 'trades', data: trades }));
          }

          if (data.channel === 'market') {
            const marketData = await MarketData.find().sort({ timestamp: -1 }).limit(10);
            ws.send(JSON.stringify({ type: 'market', data: marketData }));
          }

          if (data.channel === 'signals') {
            const signals = await Signal.find().sort({ createdAt: -1 }).limit(20);
            ws.send(JSON.stringify({ type: 'signals', data: signals }));
          }
        }

        if (data.type === 'unsubscribe') {
          clients.get(clientId).subscriptions.delete(data.channel);
        }
      } catch (error) {
        logger.error(`WebSocket message error: ${error.message}`);
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      logger.info(`WebSocket client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error: ${error.message}`);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', clientId }));
  });

  // Broadcast function
  setInterval(async () => {
    try {
      const config = await BotConfig.findOne().sort({ updatedAt: -1 });

      for (const [clientId, client] of clients) {
        if (client.ws.readyState !== 1) continue; // WebSocket.OPEN

        for (const channel of client.subscriptions) {
          if (channel === 'market') {
            const marketData = await MarketData.find().sort({ timestamp: -1 }).limit(10);
            client.ws.send(JSON.stringify({ type: 'market', data: marketData }));
          }

          if (channel === 'trades') {
            const trades = await Trade.find({ status: { $in: ['OPEN', 'PENDING'] } })
              .sort({ createdAt: -1 }).limit(20);
            client.ws.send(JSON.stringify({ type: 'trades', data: trades }));
          }

          if (channel === 'bot-status') {
            client.ws.send(JSON.stringify({
              type: 'bot-status',
              data: {
                mode: config?.mode || 'LEARNING',
                killSwitch: config?.killSwitchTriggered || false,
                isLiveEnabled: config?.isLiveTradingEnabled || false
              }
            }));
          }
        }
      }
    } catch (error) {
      logger.error(`WebSocket broadcast error: ${error.message}`);
    }
  }, 5000); // Broadcast every 5 seconds
}

async function authenticateSocket(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const auth = req.headers.authorization;
    const protocol = req.headers['sec-websocket-protocol'];
    const bearer = typeof auth === 'string' ? auth : '';
    const protocolToken = typeof protocol === 'string'
      ? protocol.split(',').map(v => v.trim()).find(v => v.startsWith('Bearer.'))?.replace('Bearer.', '')
      : null;
    const token = url.searchParams.get('token') ||
      protocolToken ||
      (bearer.match(/^Bearer\s+([A-Za-z0-9._-]+)$/)?.[1]);
    if (!token) return null;
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId || decoded.sub);
    if (!user || !user.isActive) return null;
    return publicUser(user);
  } catch (error) {
    logger.warn(`WebSocket auth failed: ${error.message}`);
    return null;
  }
}

function canSubscribe(user, channel) {
  const allowed = new Set(['market', 'bot-status']);
  const privileged = new Set(['trades', 'signals']);
  if (allowed.has(channel)) return true;
  if (privileged.has(channel)) return ['super_admin', 'admin', 'subadmin', 'auditor'].includes(user.role);
  return false;
}

function broadcast(channel, data) {
  for (const [clientId, client] of clients) {
    if (client.ws.readyState === 1 && client.subscriptions.has(channel)) {
      client.ws.send(JSON.stringify({ type: channel, data }));
    }
  }
}

module.exports = { createWebSocketServer, broadcast };
