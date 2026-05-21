class BrokerAdapter {
  constructor(config) {
    this.config = config;
  }

  async connect() {
    throw new Error('connect() not implemented');
  }

  async getProfile() {
    throw new Error('getProfile() not implemented');
  }

  async getFunds() {
    throw new Error('getFunds() not implemented');
  }

  async fetchInstruments(params) {
    throw new Error('fetchInstruments() not implemented');
  }

  async resolveSymbol(symbol) {
    throw new Error('resolveSymbol() not implemented');
  }

  async subscribeMarket(symbols, handlers) {
    throw new Error('subscribeMarket() not implemented');
  }

  async fetchHistorical(symbol, timeframe, opts) {
    throw new Error('fetchHistorical() not implemented');
  }

  async placeOrder(order) {
    throw new Error('placeOrder() not implemented');
  }

  async modifyOrder(orderId, params) {
    throw new Error('modifyOrder() not implemented');
  }

  async cancelOrder(orderId) {
    throw new Error('cancelOrder() not implemented');
  }

  async getOrderStatus(orderId) {
    throw new Error('getOrderStatus() not implemented');
  }

  async getPositions() {
    throw new Error('getPositions() not implemented');
  }

  async getHoldings() {
    throw new Error('getHoldings() not implemented');
  }

  async getOrderBook() {
    throw new Error('getOrderBook() not implemented');
  }

  async getTradeBook() {
    throw new Error('getTradeBook() not implemented');
  }

  async health() {
    throw new Error('health() not implemented');
  }
}

module.exports = BrokerAdapter;
