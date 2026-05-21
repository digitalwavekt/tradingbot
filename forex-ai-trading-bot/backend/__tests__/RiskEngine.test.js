jest.mock('../src/utils/logger', () => ({
  critical: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

jest.mock('../src/models', () => ({
  RiskLog: { create: jest.fn() },
  BotConfig: { findOne: jest.fn() },
  Trade: { find: jest.fn() },
  BrokerAccount: { findOne: jest.fn() },
  NewsEvent: { find: jest.fn() }
}));

const riskEngine = require('../src/services/risk/RiskEngine');

const baseConfig = {
  killSwitchTriggered: false,
  killSwitchReason: null,
  mode: 'PAPER',
  dailyMaxLossPercent: 3,
  weeklyMaxLossPercent: 6,
  monthlyMaxLossPercent: 10,
  maxOpenTrades: 5,
  maxCorrelatedTrades: 2,
  minRiskReward: 2,
  minConfidenceScore: 65,
  maxDrawdownPercent: 8,
  maxMarginUsagePercent: 40,
  maxRiskPerTradePercent: 1,
  newsBufferMinutesBefore: 30,
  newsBufferMinutesAfter: 60,
  defaultLeverage: 30
};

describe('RiskEngine checks', () => {
  beforeEach(() => {
    riskEngine.config = { ...baseConfig };
    riskEngine.account = {
      paperBalance: 100000,
      paperEquity: 99000,
      balance: 100000,
      equity: 99000,
      marginUsed: 0
    };
    riskEngine.riskState = {
      dailyLoss: 0,
      weeklyLoss: 0,
      monthlyLoss: 0,
      openTrades: [],
      consecutiveLosses: 0
    };
  });

  test('blocks trading when the kill switch is active', async () => {
    riskEngine.config.killSwitchTriggered = true;
    riskEngine.config.killSwitchReason = 'manual stop';

    await expect(riskEngine.checkKillSwitch()).resolves.toMatchObject({
      name: 'KILL_SWITCH',
      passed: false,
      value: true
    });
  });

  test('enforces daily loss percentage against paper balance', async () => {
    riskEngine.riskState.dailyLoss = 3500;

    await expect(riskEngine.checkDailyLossLimit()).resolves.toMatchObject({
      name: 'DAILY_LOSS_LIMIT',
      passed: false,
      value: '3.50%',
      threshold: '3%'
    });
  });

  test('rejects signals below minimum risk reward', () => {
    expect(riskEngine.checkRiskReward({ riskReward: 1.5 })).toMatchObject({
      name: 'MIN_RISK_REWARD',
      passed: false,
      value: '1.50'
    });
  });

  test('requires explicit stop loss and take profit values', () => {
    expect(riskEngine.checkStopLoss({ stopLoss: 0 })).toMatchObject({ passed: false });
    expect(riskEngine.checkTakeProfit({ takeProfit: 1.095 })).toMatchObject({ passed: true });
  });

  test('blocks position risk above configured risk per trade', async () => {
    await expect(riskEngine.validatePositionSize({ riskPercent: 1.25 })).resolves.toMatchObject({
      name: 'POSITION_SIZE',
      passed: false
    });
  });
});
