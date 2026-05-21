const { createBrokerAdapter } = require('../../broker');
const { Trade } = require('../../models');
const PaperExecutionService = require('../../execution/paper/PaperExecutionService');
const { generateId } = require('../../utils/helpers');

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
    const correlationId = order.correlationId || `${order.signalId || generateId()}:${mode}:${order.pair}:${order.direction}`;

    if (mode === 'PAPER' || mode === 'DEMO') {
      const result = await this.paper.placeOrder({
        ...order,
        correlationId,
        symbol: order.symbol || order.pair,
        transactionType: order.direction,
        quantity: order.quantity || order.positionSize,
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
      ...order,
      correlationId,
      symbol: order.symbol || order.pair,
      transactionType: order.direction,
      quantity: order.quantity || order.positionSize,
      mode
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

    if (mode === 'PAPER' || mode === 'DEMO') {
      return this.paper.closeTrade(trade, reason);
    }

    const broker = this.getActiveBroker();
    if (!trade.brokerOrderId && !trade.brokerTicket) {
      throw new Error('Live trade is missing broker order id');
    }
    if (typeof broker.cancelOrder !== 'function') {
      throw new Error('Active broker does not support close/cancel');
    }
    await broker.cancelOrder(trade.brokerOrderId || trade.brokerTicket);
    return {
      broker: this.activeBroker.toLowerCase(),
      exitPrice: trade.entryPrice,
      pnl: 0,
      reason
    };
  }
}

module.exports = new BrokerAbstractionLayer();
