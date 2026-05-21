const DhanApiClient = require('./DhanApiClient');
const orderIntentService = require('../../execution/orders/OrderIntentService');
const { ORDER_STATES } = require('../../execution/orders/OrderStateMachine');

class DhanOrderService {
  constructor(config = {}) {
    this.client = new DhanApiClient(config);
    this.clientId = this.client.clientId;
  }

  async placeOrder(order) {
    if (!order.correlationId) throw new Error('correlationId/idempotency key is required');
    const { intent, duplicate } = await orderIntentService.createIntent({ ...order, broker: 'dhan' });
    if (duplicate && intent.brokerOrderId) {
      return { duplicate: true, orderId: intent.brokerOrderId, status: intent.status };
    }
    if (duplicate && intent.status !== ORDER_STATES.INTENT_CREATED) {
      return { duplicate: true, orderId: intent.brokerOrderId, status: intent.status };
    }

    const payload = this.toDhanOrder(order);
    await orderIntentService.transition(intent, ORDER_STATES.RISK_APPROVED, 'risk_approved_before_broker_submit');
    await orderIntentService.transition(intent, ORDER_STATES.SUBMITTING, 'submitting_to_dhan', {
      rawRequest: payload,
      attempts: (intent.attempts || 0) + 1,
      lastSubmittedAt: new Date()
    });

    try {
      const response = await this.client.request('post', '/orders', payload);
      await orderIntentService.transition(intent, ORDER_STATES.SUBMITTED, 'dhan_order_submitted', {
        brokerOrderId: response.orderId,
        rawResponse: response
      });
      return response;
    } catch (error) {
      await orderIntentService.transition(intent, ORDER_STATES.FAILED, 'dhan_order_submit_failed', {
        error: { message: error.message, statusCode: error.statusCode, details: error.details }
      });
      throw error;
    }
  }

  async modifyOrder(orderId, params) {
    const payload = {
      dhanClientId: this.clientId,
      orderId,
      orderType: params.orderType,
      legName: params.legName || '',
      quantity: String(params.quantity || ''),
      price: params.price ?? '',
      disclosedQuantity: params.disclosedQuantity ?? '',
      triggerPrice: params.triggerPrice ?? '',
      validity: params.validity || 'DAY'
    };
    const response = await this.client.request('put', `/orders/${orderId}`, payload);
    const Order = require('../../models/Order');
    await Order.updateOne({ brokerOrderId: orderId }, { rawResponse: response, lastReconciledAt: new Date() });
    return response;
  }

  async cancelOrder(orderId) {
    const response = await this.client.request('delete', `/orders/${orderId}`);
    const Order = require('../../models/Order');
    await Order.updateOne({ brokerOrderId: orderId }, { status: ORDER_STATES.CANCELLED, rawResponse: response, lastReconciledAt: new Date() });
    return response;
  }

  async getOrderStatus(orderId) {
    return this.client.request('get', `/orders/${orderId}`);
  }

  async getOrderByCorrelationId(correlationId) {
    return this.client.request('get', `/orders/external/${correlationId}`);
  }

  async getOrderBook() {
    return this.client.request('get', '/orders');
  }

  async getTradeBook() {
    return this.client.request('get', '/trades');
  }

  toDhanOrder(order) {
    return {
      dhanClientId: this.clientId,
      correlationId: order.correlationId,
      transactionType: order.transactionType,
      exchangeSegment: order.exchangeSegment || 'NSE_EQ',
      productType: order.productType || 'INTRADAY',
      orderType: order.orderType || 'LIMIT',
      validity: order.validity || 'DAY',
      securityId: String(order.securityId),
      quantity: String(order.quantity),
      disclosedQuantity: order.disclosedQuantity ?? '',
      price: order.price ?? '',
      triggerPrice: order.triggerPrice ?? '',
      afterMarketOrder: Boolean(order.afterMarketOrder),
      amoTime: order.amoTime || '',
      boProfitValue: order.boProfitValue || '',
      boStopLossValue: order.boStopLossValue || ''
    };
  }
}

module.exports = DhanOrderService;
