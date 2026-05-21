const moment = require('moment');

const PIP_VALUES = {
  'JPY': 0.01,
  'DEFAULT': 0.0001
};

const getPipValue = (pair) => {
  const quoteCurrency = pair.split('/')[1];
  return PIP_VALUES[quoteCurrency] || PIP_VALUES.DEFAULT;
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
  stopLossPips,
  pipValue,
  pair,
  leverage = 50
}) => {
  const riskAmount = accountBalance * (riskPercent / 100);
  const riskPerPip = riskAmount / stopLossPips;
  const lotSize = riskPerPip / pipValue;
  const marginRequired = (lotSize * 100000) / leverage;

  return {
    lotSize: Math.round(lotSize * 100) / 100,
    riskAmount: Math.round(riskAmount * 100) / 100,
    marginRequired: Math.round(marginRequired * 100) / 100,
    riskPerPip: Math.round(riskPerPip * 100) / 100
  };
};

const getTradingSession = (timestamp = new Date()) => {
  const hour = moment.utc(timestamp).hour();
  const day = moment.utc(timestamp).day();

  if (day === 0 || day === 6) return 'OFF_HOURS';

  // Tokyo: 00:00 - 09:00 UTC
  if (hour >= 0 && hour < 9) return 'TOKYO';
  // London: 08:00 - 17:00 UTC
  if (hour >= 8 && hour < 17) return 'LONDON';
  // New York: 13:00 - 22:00 UTC
  if (hour >= 13 && hour < 22) return 'NEW_YORK';
  // Overlap London-NY: 13:00 - 17:00 UTC
  if (hour >= 13 && hour < 17) return 'OVERLAP';

  return 'OFF_HOURS';
};

const isMarketOpen = (pair, timestamp = new Date()) => {
  const day = moment.utc(timestamp).day();
  const hour = moment.utc(timestamp).hour();

  // Weekend check
  if (day === 5 && hour >= 22) return false;
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;

  // Check for JPY pairs during Tokyo lunch
  if (pair.includes('JPY') && hour === 3) return false; // Tokyo lunch

  return true;
};

const generateId = () => {
  return require('uuid').v4();
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatCurrency = (value, decimals = 2) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

const roundToDecimals = (value, decimals = 5) => {
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