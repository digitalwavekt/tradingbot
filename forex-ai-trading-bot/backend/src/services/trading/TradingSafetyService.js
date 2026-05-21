const { BotConfig, Instrument, AuditLog, RiskLog } = require('../../models');

const EXCHANGE_SEGMENTS = new Set(['NSE_EQ', 'BSE_EQ', 'NSE_FNO', 'BSE_FNO', 'MCX_COMM']);
const INSTRUMENT_TYPES = new Set(['EQUITY', 'FUTURE', 'OPTION', 'INDEX']);
const ORDER_TYPES = new Set(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET']);
const PRODUCT_TYPES = new Set(['INTRADAY', 'CNC', 'MARGIN', 'CO', 'BO']);
const VALIDITIES = new Set(['DAY', 'IOC']);
const LIVE_MODES = new Set(['LIVE_MANUAL', 'LIVE_AUTO', 'LIVE']);

function hasForexShape(value) {
  return typeof value === 'string' && /^[A-Z]{3}\/[A-Z]{3}$/i.test(value);
}

function roundToTick(price, tickSize) {
  if (!price || !tickSize) return price;
  return Math.round(Number(price) / Number(tickSize)) * Number(tickSize);
}

function isPriceOnTick(price, tickSize) {
  if (price === undefined || price === null || Number(price) === 0 || !tickSize) return true;
  return Math.abs(Number(price) - roundToTick(price, tickSize)) < 0.000001;
}

function isNseMarketOpen(now = new Date()) {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

class TradingSafetyService {
  async getConfig() {
    return BotConfig.findOne().sort({ updatedAt: -1 });
  }

  normalizeMode(mode) {
    if (mode === 'LIVE') return 'LIVE_MANUAL';
    if (mode === 'DEMO' || mode === 'HUMAN_APPROVAL') return 'PAPER';
    return mode || process.env.TRADING_MODE || 'LEARNING';
  }

  async resolveInstrument(order) {
    if (order.securityId && order.symbol) {
      return {
        securityId: String(order.securityId),
        symbol: String(order.symbol).toUpperCase(),
        exchangeSegment: order.exchangeSegment || 'NSE_EQ',
        instrumentType: order.instrumentType || order.instrument || 'EQUITY',
        lotSize: Number(order.lotSize || 1),
        tickSize: Number(order.tickSize || 0.05)
      };
    }

    const symbol = String(order.symbol || order.pair || '').toUpperCase();
    if (!symbol) throw new Error('symbol is required');
    const instrument = await Instrument.findOne({
      broker: 'dhan',
      symbol,
      exchangeSegment: order.exchangeSegment || 'NSE_EQ',
      isActive: true
    });
    if (!instrument) throw new Error(`Instrument ${symbol} is not synced`);
    return {
      securityId: instrument.securityId,
      symbol: instrument.symbol,
      exchangeSegment: instrument.exchangeSegment,
      instrumentType: instrument.instrument || 'EQUITY',
      lotSize: Number(instrument.lotSize || 1),
      tickSize: Number(instrument.tickSize || 0.05)
    };
  }

  async validateBeforeOrder(order, requestedMode) {
    const reasons = [];
    const warnings = [];
    const mode = this.normalizeMode(requestedMode || order.mode);
    const symbol = String(order.symbol || order.pair || '').toUpperCase();
    const transactionType = order.transactionType || order.direction;
    const quantity = Number(order.quantity || order.positionSize || 0);
    const orderType = order.orderType || 'MARKET';
    const productType = order.productType || 'INTRADAY';
    const validity = order.validity || 'DAY';
    const exchangeSegment = order.exchangeSegment || 'NSE_EQ';

    if (hasForexShape(symbol) || hasForexShape(order.pair)) reasons.push('Forex pair inputs are rejected in Indian market mode');
    if (!symbol) reasons.push('symbol is required');
    if (!['BUY', 'SELL'].includes(transactionType)) reasons.push('transactionType must be BUY or SELL');
    if (!Number.isInteger(quantity) || quantity <= 0) reasons.push('quantity must be a positive integer');
    if (!EXCHANGE_SEGMENTS.has(exchangeSegment)) reasons.push('exchangeSegment is not allowed');
    if (!ORDER_TYPES.has(orderType)) reasons.push('orderType is not allowed');
    if (!PRODUCT_TYPES.has(productType)) reasons.push('productType is not allowed');
    if (!VALIDITIES.has(validity)) reasons.push('validity is not allowed');
    if (mode === 'LEARNING') reasons.push('LEARNING mode does not allow order placement');

    const config = await this.getConfig();
    if (config?.killSwitchTriggered) {
      reasons.push('Kill switch is active');
    }

    if (LIVE_MODES.has(mode)) {
      if (process.env.ALLOW_LIVE_TRADING !== 'true') reasons.push('Live trading is disabled by ALLOW_LIVE_TRADING');
      if (mode === 'LIVE_AUTO' && process.env.ENABLE_LIVE_AUTO !== 'true') reasons.push('LIVE_AUTO is disabled by ENABLE_LIVE_AUTO');
      if (mode === 'LIVE_AUTO' && !config?.isLiveTradingEnabled) reasons.push('LIVE_AUTO is not enabled in BotConfig');
      if (mode === 'LIVE_AUTO' && !config?.killSwitchEnabled) reasons.push('Kill switch must be enabled before LIVE_AUTO');
      if (!isNseMarketOpen()) reasons.push('Indian market is closed');
      if (!order.stopLoss && !order.triggerPrice) reasons.push('Stop-loss is mandatory for live orders');
      if (process.env.REQUIRE_ADMIN_APPROVAL !== 'false' && mode === 'LIVE_MANUAL' && !order.adminApproved) {
        reasons.push('Admin approval is required for LIVE_MANUAL orders');
      }
    }

    let instrument = null;
    if (reasons.length === 0 || symbol) {
      try {
        instrument = await this.resolveInstrument({ ...order, symbol, exchangeSegment });
        if (!INSTRUMENT_TYPES.has(instrument.instrumentType)) reasons.push('instrumentType is not allowed');
        if (quantity > 0 && instrument.lotSize > 1 && quantity % instrument.lotSize !== 0) {
          reasons.push(`Quantity must be a multiple of lotSize ${instrument.lotSize}`);
        }
        if (!isPriceOnTick(order.price, instrument.tickSize)) reasons.push(`price must align to tickSize ${instrument.tickSize}`);
        if (!isPriceOnTick(order.triggerPrice, instrument.tickSize)) reasons.push(`triggerPrice must align to tickSize ${instrument.tickSize}`);
      } catch (error) {
        if (LIVE_MODES.has(mode)) reasons.push(error.message);
        else warnings.push(error.message);
      }
    }

    const allowed = reasons.length === 0;
    if (!allowed) {
      await this.recordRejection(order, mode, reasons);
    }

    return {
      allowed,
      reasons,
      warnings,
      mode,
      instrument,
      requiredApproval: reasons.includes('Admin approval is required for LIVE_MANUAL orders')
    };
  }

  async recordRejection(order, mode, reasons) {
    try {
      await RiskLog.create({
        pair: order.symbol || order.pair,
        type: 'ORDER_REJECTED',
        level: 'CRITICAL',
        message: reasons.join('; '),
        details: { order, mode, reasons }
      });
      await AuditLog.create({
        action: 'ORDER_RISK_REJECTED',
        details: { order, mode, reasons },
        severity: 'CRITICAL'
      });
    } catch {
      // Rejection logging must not mask the original safety decision.
    }
  }
}

module.exports = new TradingSafetyService();
module.exports.TradingSafetyService = TradingSafetyService;
module.exports.isNseMarketOpen = isNseMarketOpen;
