const { generateId } = require('../../utils/helpers');
const orderIntentService = require('../orders/OrderIntentService');
const { ORDER_STATES } = require('../orders/OrderStateMachine');

class PaperExecutionService {
  constructor(options = {}) {
    this.latencyMs = Number(options.latencyMs ?? process.env.PAPER_EXECUTION_LATENCY_MS ?? 75);
    this.defaultSlippageBps = Number(options.slippageBps ?? process.env.PAPER_SLIPPAGE_BPS ?? 1);
  }

  async placeOrder(order) {
    const correlationId = order.correlationId || orderIntentService.buildCorrelationId(order);
    const { intent, duplicate } = await orderIntentService.createIntent({
      ...order,
      broker: 'paper',
      correlationId,
      securityId: order.securityId || order.pair || order.symbol,
      symbol: order.symbol || order.pair,
      transactionType: order.transactionType || order.direction,
      quantity: order.quantity || order.positionSize,
      mode: 'PAPER'
    });

    if (duplicate && intent.brokerOrderId) {
      return { duplicate: true, orderId: intent.brokerOrderId, status: intent.status };
    }

    await orderIntentService.transition(intent, ORDER_STATES.RISK_APPROVED, 'paper_order_risk_approved');
    await orderIntentService.transition(intent, ORDER_STATES.SUBMITTING, 'paper_order_queued', {
      attempts: (intent.attempts || 0) + 1,
      lastSubmittedAt: new Date()
    });

    await new Promise(resolve => setTimeout(resolve, this.latencyMs));

    const fill = this.simulateFill(order);
    const brokerOrderId = `PAPER_${generateId()}`;
    await orderIntentService.transition(intent, ORDER_STATES.FILLED, 'paper_order_filled', {
      brokerOrderId,
      rawResponse: fill,
      lastReconciledAt: new Date()
    });

    return {
      broker: 'paper',
      brokerOrderId,
      orderId: brokerOrderId,
      status: ORDER_STATES.FILLED,
      fillPrice: fill.fillPrice,
      slippage: fill.slippage
    };
  }

  simulateFill(order) {
    const entry = Number(order.entryPrice || order.price || 0);
    const side = order.direction || order.transactionType;
    const slippage = entry * (this.defaultSlippageBps / 10000);
    const fillPrice = side === 'BUY' ? entry + slippage : entry - slippage;
    return {
      fillPrice: Number(fillPrice.toFixed(5)),
      requestedPrice: entry,
      slippage,
      filledQuantity: Number(order.quantity || order.positionSize || 0),
      filledAt: new Date().toISOString()
    };
  }

  async closeTrade(trade, reason = 'MANUAL_CLOSE') {
    const exitPrice = Number(trade.exitPrice || trade.entryPrice || 0);
    return {
      broker: 'paper',
      exitPrice,
      pnl: 0,
      reason
    };
  }
}

module.exports = PaperExecutionService;
