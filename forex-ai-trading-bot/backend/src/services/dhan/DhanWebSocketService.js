const logger = require('../../utils/logger');
const WsConnectionManager = require('../../market/websocket/WsConnectionManager');
const DhanTickProducer = require('../../market/feed/DhanTickProducer');

class DhanWebSocketService {
  constructor(config = {}) {
    this.config = config;
    this.wsUrl = config.wsUrl || process.env.DHAN_WS_URL || 'wss://api-feed.dhan.co';
    this.clientId = config.clientId || process.env.DHAN_CLIENT_ID;
    this.accessToken = config.accessToken || process.env.DHAN_ACCESS_TOKEN;
    this.subscriptions = new Map();
    this.connected = false;
    this.tickProducer = config.tickProducer || new DhanTickProducer();
    this.manager = new WsConnectionManager({
      name: 'dhan-market-feed',
      urlFactory: () => this.buildUrl(),
      heartbeatMs: Number(process.env.DHAN_WS_HEARTBEAT_MS || 15000),
      staleMs: Number(process.env.DHAN_WS_STALE_MS || 45000)
    });

    this.manager.on('connected', async () => {
      this.connected = true;
      await this.resubscribe();
    });
    this.manager.on('disconnected', () => {
      this.connected = false;
    });
    this.manager.on('message', message => this.handleMessage(message));
    this.manager.on('stale', details => logger.warn('Dhan websocket stale detected', details));
    this.manager.on('reconnect_scheduled', details => logger.warn('Dhan websocket reconnect scheduled', details));
  }

  async connect() {
    if (!this.clientId || !this.accessToken) throw new Error('Dhan websocket credentials are required');
    return this.manager.connect();
  }

  subscribe(symbols = [], handlers = {}) {
    const instruments = symbols.map(item => ({
      ExchangeSegment: item.exchangeSegment || item.ExchangeSegment || 'NSE_EQ',
      SecurityId: String(item.securityId || item.SecurityId)
    }));
    for (const instrument of instruments) {
      this.subscriptions.set(`${instrument.ExchangeSegment}:${instrument.SecurityId}`, handlers);
    }

    if (!this.connected) {
      logger.warn('Dhan subscription registered while websocket is disconnected; it will be sent after reconnect');
      return true;
    }

    this.sendSubscribe(instruments);
    return true;
  }

  sendSubscribe(instruments) {
    if (!instruments.length) return;
    this.manager.send({
      RequestCode: 15,
      InstrumentCount: instruments.length,
      InstrumentList: instruments
    });
  }

  async resubscribe() {
    const instruments = [...this.subscriptions.keys()].map(key => {
      const [ExchangeSegment, SecurityId] = key.split(':');
      return { ExchangeSegment, SecurityId };
    });
    if (!instruments.length) return;
    logger.info('Re-subscribing Dhan websocket instruments after reconnect', { count: instruments.length });
    this.sendSubscribe(instruments);
  }

  async disconnect() {
    this.manager.close();
    this.connected = false;
    return true;
  }

  handleMessage(message) {
    this.tickProducer.publishRawTick(message).catch(error => {
      logger.warn('Failed to publish Dhan tick to stream', { error: error.message });
    });

    for (const handlers of this.subscriptions.values()) {
      if (typeof handlers.onMessage === 'function') handlers.onMessage(message);
    }
  }

  buildUrl() {
    return `${this.wsUrl}?version=2&token=${encodeURIComponent(this.accessToken)}&clientId=${encodeURIComponent(this.clientId)}&authType=2`;
  }
}

module.exports = DhanWebSocketService;
