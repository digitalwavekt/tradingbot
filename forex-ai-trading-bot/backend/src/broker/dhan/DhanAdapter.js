const BrokerAdapter = require('../BrokerAdapter');
const DhanAuthService = require('../../services/dhan/DhanAuthService');
const DhanMarketDataService = require('../../services/dhan/DhanMarketDataService');
const DhanHistoricalDataService = require('../../services/dhan/DhanHistoricalDataService');
const DhanOrderService = require('../../services/dhan/DhanOrderService');
const DhanPortfolioService = require('../../services/dhan/DhanPortfolioService');
const DhanInstrumentService = require('../../services/dhan/DhanInstrumentService');
const DhanWebSocketService = require('../../services/dhan/DhanWebSocketService');
const DhanHealthService = require('../../services/dhan/DhanHealthService');

class DhanAdapter extends BrokerAdapter {
  constructor(config = {}) {
    super(config);
    this.auth = new DhanAuthService(config);
    this.market = new DhanMarketDataService(config);
    this.historical = new DhanHistoricalDataService(config);
    this.order = new DhanOrderService(config);
    this.portfolio = new DhanPortfolioService(config);
    this.instrument = new DhanInstrumentService(config);
    this.ws = new DhanWebSocketService(config);
    this.healthService = new DhanHealthService(config);
  }

  async connect() {
    await this.auth.init();
    await this.ws.connect();
    return true;
  }

  async getProfile() {
    return this.auth.getProfile();
  }

  async getFunds() {
    return this.portfolio.getFunds();
  }

  async fetchInstruments(params) {
    return this.instrument.fetchInstruments(params);
  }

  async syncInstruments(params) {
    return this.instrument.syncInstruments(params);
  }

  async resolveSymbol(symbol) {
    return this.instrument.resolveSymbol(symbol);
  }

  async subscribeMarket(symbols, handlers) {
    return this.ws.subscribe(symbols, handlers);
  }

  async fetchHistorical(symbol, timeframe, opts) {
    return this.historical.fetchOHLC(symbol, timeframe, opts);
  }

  async placeOrder(order) {
    return this.order.placeOrder(order);
  }

  async modifyOrder(orderId, params) {
    return this.order.modifyOrder(orderId, params);
  }

  async cancelOrder(orderId) {
    return this.order.cancelOrder(orderId);
  }

  async getOrderStatus(orderId) {
    return this.order.getOrderStatus(orderId);
  }

  async getPositions() {
    return this.portfolio.getPositions();
  }

  async getHoldings() {
    return this.portfolio.getHoldings();
  }

  async getOrderBook() {
    return this.order.getOrderBook();
  }

  async getTradeBook() {
    return this.order.getTradeBook();
  }

  async health() {
    return this.healthService.check();
  }
}

module.exports = DhanAdapter;
