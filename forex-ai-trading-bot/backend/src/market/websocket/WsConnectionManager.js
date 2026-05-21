const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../../utils/logger');
const { STATES, calculateBackoff } = require('./ReconnectState');

class WsConnectionManager extends EventEmitter {
  constructor({ name, urlFactory, heartbeatMs = 15000, staleMs = 45000, maxBackoffMs = 30000 }) {
    super();
    this.name = name;
    this.urlFactory = urlFactory;
    this.heartbeatMs = heartbeatMs;
    this.staleMs = staleMs;
    this.maxBackoffMs = maxBackoffMs;
    this.state = STATES.IDLE;
    this.ws = null;
    this.connectingPromise = null;
    this.reconnectAttempts = 0;
    this.lastMessageAt = 0;
    this.heartbeatTimer = null;
    this.staleTimer = null;
    this.shouldReconnect = true;
  }

  async connect() {
    if (this.state === STATES.CONNECTED && this.ws?.readyState === WebSocket.OPEN) return true;
    if (this.connectingPromise) return this.connectingPromise;

    this.shouldReconnect = true;
    this.state = this.reconnectAttempts > 0 ? STATES.RECONNECTING : STATES.CONNECTING;
    this.connectingPromise = this.openSocket()
      .finally(() => {
        this.connectingPromise = null;
      });
    return this.connectingPromise;
  }

  async openSocket() {
    const url = await this.urlFactory();
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const failOpen = (error) => {
        ws.removeListener('open', onOpen);
        reject(error);
      };

      const onOpen = () => {
        ws.removeListener('error', failOpen);
        this.state = STATES.CONNECTED;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.startTimers();
        this.emit('connected');
        logger.info(`${this.name} websocket connected`);
        resolve(true);
      };

      ws.once('open', onOpen);
      ws.once('error', failOpen);
      ws.on('message', message => this.handleMessage(message));
      ws.on('pong', () => {
        this.lastMessageAt = Date.now();
      });
      ws.on('close', (code, reason) => this.handleClose(code, reason));
      ws.on('error', error => this.emit('error', error));
    });

    return true;
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.name} websocket is not connected`);
    }
    this.ws.send(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
  }

  close() {
    this.shouldReconnect = false;
    this.state = STATES.CLOSED;
    this.stopTimers();
    if (this.ws) this.ws.close();
  }

  handleMessage(message) {
    this.lastMessageAt = Date.now();
    this.emit('message', message);
  }

  handleClose(code, reason) {
    this.stopTimers();
    const wasConnected = this.state === STATES.CONNECTED || this.state === STATES.STALE;
    this.state = STATES.CLOSED;
    this.emit('disconnected', { code, reason: reason?.toString() });
    logger.warn(`${this.name} websocket disconnected`, { code, reason: reason?.toString() });

    if (this.shouldReconnect && wasConnected) {
      this.scheduleReconnect('close');
    }
  }

  startTimers() {
    this.stopTimers();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (error) {
          logger.warn(`${this.name} websocket ping failed`, { error: error.message });
        }
      }
    }, this.heartbeatMs);

    this.staleTimer = setInterval(() => {
      const age = Date.now() - this.lastMessageAt;
      if (age > this.staleMs && this.state === STATES.CONNECTED) {
        this.state = STATES.STALE;
        this.emit('stale', { ageMs: age });
        logger.warn(`${this.name} websocket stale`, { ageMs: age });
        this.ws?.terminate();
        this.scheduleReconnect('stale');
      }
    }, Math.max(1000, Math.floor(this.staleMs / 3)));
  }

  stopTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.heartbeatTimer = null;
    this.staleTimer = null;
  }

  scheduleReconnect(reason) {
    if (!this.shouldReconnect) return;
    this.reconnectAttempts += 1;
    this.state = STATES.RECONNECTING;
    const delay = calculateBackoff(this.reconnectAttempts, { maxMs: this.maxBackoffMs });
    this.emit('reconnect_scheduled', { reason, attempt: this.reconnectAttempts, delayMs: delay });
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error(`${this.name} websocket reconnect failed`, {
          attempt: this.reconnectAttempts,
          error: error.message
        });
        this.scheduleReconnect('connect_error');
      }
    }, delay);
  }
}

module.exports = WsConnectionManager;
