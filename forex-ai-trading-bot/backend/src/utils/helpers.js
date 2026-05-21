const moment = require('moment');

const PIP_VALUES = { DEFAULT: 0.05 };

const getPipValue = (pair) => {
  if (String(pair || '').includes('/')) {
    throw new Error('Forex pairs are not supported in Indian market mode');
  }
  return PIP_VALUES.DEFAULT;
};

const priceToPips = (price, pair) => {
  const pipValue = getPipValue(pair);
  return price / pipValue;
};

const pipsToPrice = (pips, pair) => {
  const pipValue = getPipValue(pair);
  return pips * pipValue;
};

const calculatePositionSize = ({
  accountBalance,
  riskPercent,
  entryPrice,
  stopLoss,
  lotSize = 1
}) => {
  const riskAmount = accountBalance * (riskPercent / 100);
  const riskPerShare = Math.abs(Number(entryPrice) - Number(stopLoss));
  const rawQuantity = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const quantity = lotSize > 1 ? Math.floor(rawQuantity / lotSize) * lotSize : rawQuantity;
  const marginRequired = quantity * Number(entryPrice || 0);

  return {
    quantity,
    lotSize,
    riskAmount: Math.round(riskAmount * 100) / 100,
    marginRequired: Math.round(marginRequired * 100) / 100,
    riskPerShare: Math.round(riskPerShare * 100) / 100
  };
};

const getTradingSession = (timestamp = new Date()) => {
  const ist = moment(timestamp).utcOffset(330);
  const hour = ist.hour();
  const minute = ist.minute();
  const day = ist.day();

  if (day === 0 || day === 6) return 'OFF_HOURS';
  const minutes = hour * 60 + minute;
  if (minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30) return 'NSE';

  return 'OFF_HOURS';
};

const isMarketOpen = (_symbol, timestamp = new Date()) => {
  return getTradingSession(timestamp) === 'NSE';
};

const generateId = () => {
  return require('uuid').v4();
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatCurrency = (value, decimals = 2) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

const roundToDecimals = (value, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

module.exports = {
  getPipValue,
  priceToPips,
  pipsToPrice,
  calculatePositionSize,
  getTradingSession,
  isMarketOpen,
  generateId,
  sleep,
  formatCurrency,
  roundToDecimals
};
