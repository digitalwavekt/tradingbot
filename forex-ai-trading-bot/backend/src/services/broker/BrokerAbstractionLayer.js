const { createBrokerAdapter } = require('../../broker');
const { Trade } = require('../../models');
const PaperExecutionService = require('../../execution/paper/PaperExecutionService');
const { generateId } = require('../../utils/helpers');
const tradingSafety = require('../trading/TradingSafetyService');

class BrokerAbstractionLayer {
  constructor() {
    this.brokers = {
      DHAN: createBrokerAdapter('dhan')
    };
    this.activeBroker = 'DHAN';
    this.paper = new PaperExecutionService();
  }

  async initialize() {
    return true;
  }

  getActiveBroker() {
    return this.brokers[this.activeBroker];
  }

  async healthCheck() {
    const broker = this.getActiveBroker();
    if (!broker || typeof broker.health !== 'function') {
      return { status: 'UNAVAILABLE', message: 'Active broker health check is not available' };
    }

    const health = await broker.health();
    return {
      status: health.ok ? 'HEALTHY' : 'UNHEALTHY',
      activeBroker: this.activeBroker,
      ...health
    };
  }

  async executeTrade(order, mode = 'PAPER') {
    const normalizedMode = tradingSafety.normalizeMode(mode);
    const safety = await tradingSafety.validateBeforeOrder(order, normalizedMode);
    if (!safety.allowed) {
      throw new Error(`Order blocked by safety checks: ${safety.reasons.join('; ')}`);
    }

    const normalizedOrder = {
      ...order,
      ...(safety.instrument || {}),
      symbol: safety.instrument?.symbol || order.symbol || order.pair,
      exchangeSegment: safety.instrument?.exchangeSegment || order.exchangeSegment || 'NSE_EQ',
      transactionType: order.transactionType || order.direction,
      quantity: order.quantity || order.positionSize,
      validity: order.validity || 'DAY'
    };

    const correlationId = normalizedOrder.correlationId || `${normalizedOrder.signalId || generateId()}:${normalizedMode}:${normalizedOrder.symbol}:${normalizedOrder.transactionType}`;

    if (normalizedMode === 'PAPER') {
      const result = await this.paper.placeOrder({
        ...normalizedOrder,
        correlationId,
        mode: 'PAPER'
      });

      return {
        tradeId: `TR_${generateId()}`,
        broker: 'paper',
        brokerTicket: result.orderId,
        brokerOrderId: result.orderId,
        fillPrice: result.fillPrice,
        duplicate: result.duplicate || false
      };
    }

    const broker = this.getActiveBroker();
    if (!broker || typeof broker.placeOrder !== 'function') {
      throw new Error('Active broker does not support order placement');
    }

    if (!order.securityId && !order.symbol) {
      throw new Error('Live order requires resolved symbol/securityId before broker submission');
    }

    const result = await broker.placeOrder({
      ...normalizedOrder,
      correlationId,
      mode: normalizedMode
    });

    return {
      tradeId: `TR_${generateId()}`,
      broker: this.activeBroker.toLowerCase(),
      brokerTicket: result.orderId,
      brokerOrderId: result.orderId,
      raw: result,
      duplicate: result.duplicate || false
    };
  }

  async closeTrade(tradeId, mode = 'PAPER', reason = 'MANUAL_CLOSE') {
    const trade = await Trade.findOne({ tradeId });
    if (!trade) throw new Error(`Trade not found: ${tradeId}`);

    const normalizedMode = tradingSafety.normalizeMode(mode);
    if (normalizedMode === 'PAPER') {
      return this.paper.closeTrade(trade, reason);
    }

    const broker = this.getActiveBroker();
    if (typeof broker.placeOrder !== 'function') {
      throw new Error('Active broker does not support square-off order placement');
    }
    const transactionType = trade.direction === 'BUY' ? 'SELL' : 'BUY';
    const squareOff = {
      symbol: trade.symbol || trade.pair,
      securityId: trade.securityId,
      exchangeSegment: trade.exchangeSegment || 'NSE_EQ',
      transactionType,
      quantity: trade.quantity || trade.positionSize,
      productType: trade.productType || 'INTRADAY',
      orderType: 'MARKET',
      validity: 'DAY',
      correlationId: `SQUAREOFF:${trade.tradeId}:${Date.now()}`,
      stopLoss: trade.stopLoss,
      adminApproved: true,
      mode: normalizedMode
    };
    const result = await broker.placeOrder(squareOff);
    return {
      broker: this.activeBroker.toLowerCase(),
      exitPrice: trade.entryPrice,
      pnl: 0,
      reason,
      raw: result
    };
  }
}

module.exports = new BrokerAbstractionLayer();
