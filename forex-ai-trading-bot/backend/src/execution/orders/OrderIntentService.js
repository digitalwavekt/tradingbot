const crypto = require('crypto');
const Order = require('../../models/Order');
const { ORDER_STATES, assertTransition } = require('./OrderStateMachine');

class OrderIntentService {
  buildCorrelationId(order) {
    if (order.correlationId) return order.correlationId;
    const stable = [
      order.signalId || order.signal || '',
      order.symbol || order.pair || '',
      order.securityId || '',
      order.transactionType || order.direction || '',
      order.quantity || order.positionSize || '',
      order.orderType || 'MARKET'
    ].join('|');
    return crypto.createHash('sha256').update(stable).digest('hex');
  }

  async createIntent(order) {
    const correlationId = this.buildCorrelationId(order);
    const now = new Date();

    // The upsert is the duplicate-order gate. Only the first caller creates the intent.
    const result = await Order.findOneAndUpdate(
      { correlationId },
      {
        $setOnInsert: {
          broker: order.broker || 'paper',
          brokerOrderId: order.brokerOrderId,
          correlationId,
          signal: order.signal,
          symbol: String(order.symbol || order.pair).toUpperCase(),
          securityId: String(order.securityId || order.symbol || order.pair),
          exchangeSegment: order.exchangeSegment || 'NSE_EQ',
          transactionType: order.transactionType || order.direction,
          productType: order.productType || 'INTRADAY',
          orderType: order.orderType || 'MARKET',
          quantity: Number(order.quantity || order.positionSize || 0),
          price: Number(order.price || order.entryPrice || 0),
          triggerPrice: Number(order.triggerPrice || 0),
          status: ORDER_STATES.INTENT_CREATED,
          mode: order.mode || 'PAPER',
          rawRequest: order,
          attempts: 0,
          stateHistory: [{ from: null, to: ORDER_STATES.INTENT_CREATED, at: now, reason: 'intent_created' }]
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
    );
    const intent = result.value;
    const duplicate = result.lastErrorObject?.updatedExisting === true;

    return {
      intent,
      duplicate
    };
  }

  async transition(orderOrId, to, reason, patch = {}) {
    const order = typeof orderOrId === 'string'
      ? await Order.findOne({ correlationId: orderOrId })
      : orderOrId;
    if (!order) throw new Error('Order intent not found');
    assertTransition(order.status, to);

    const from = order.status;
    order.status = to;
    Object.assign(order, patch);
    order.stateHistory = order.stateHistory || [];
    order.stateHistory.push({ from, to, at: new Date(), reason });
    await order.save();
    return order;
  }
}

module.exports = new OrderIntentService();
module.exports.OrderIntentService = OrderIntentService;
