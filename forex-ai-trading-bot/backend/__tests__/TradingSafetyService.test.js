jest.mock('../src/models', () => ({
  BotConfig: { findOne: jest.fn() },
  Instrument: { findOne: jest.fn() },
  AuditLog: { create: jest.fn() },
  RiskLog: { create: jest.fn() }
}));

const { BotConfig, Instrument } = require('../src/models');
const tradingSafety = require('../src/services/trading/TradingSafetyService');

describe('TradingSafetyService', () => {
  beforeEach(() => {
    process.env.ALLOW_LIVE_TRADING = 'false';
    process.env.ENABLE_LIVE_AUTO = 'false';
    process.env.REQUIRE_ADMIN_APPROVAL = 'true';
    BotConfig.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        mode: 'PAPER',
        killSwitchTriggered: false,
        killSwitchEnabled: true,
        isLiveTradingEnabled: false
      })
    });
    Instrument.findOne.mockResolvedValue({
      securityId: '1333',
      symbol: 'RELIANCE',
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
      lotSize: 1,
      tickSize: 0.05
    });
  });

  test('rejects forex pair inputs in Indian market mode', async () => {
    const result = await tradingSafety.validateBeforeOrder({
      symbol: 'EUR/USD',
      transactionType: 'BUY',
      quantity: 1,
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: 'DAY'
    }, 'PAPER');

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('Forex pair inputs are rejected in Indian market mode');
  });

  test('blocks live order when ALLOW_LIVE_TRADING is false', async () => {
    const result = await tradingSafety.validateBeforeOrder({
      symbol: 'RELIANCE',
      securityId: '1333',
      exchangeSegment: 'NSE_EQ',
      transactionType: 'BUY',
      quantity: 1,
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: 'DAY',
      stopLoss: 2400
    }, 'LIVE_MANUAL');

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('Live trading is disabled by ALLOW_LIVE_TRADING');
  });

  test('blocks LIVE_AUTO when ENABLE_LIVE_AUTO is false', async () => {
    process.env.ALLOW_LIVE_TRADING = 'true';
    const result = await tradingSafety.validateBeforeOrder({
      symbol: 'RELIANCE',
      securityId: '1333',
      exchangeSegment: 'NSE_EQ',
      transactionType: 'BUY',
      quantity: 1,
      orderType: 'MARKET',
      productType: 'INTRADAY',
      validity: 'DAY',
      stopLoss: 2400,
      adminApproved: true
    }, 'LIVE_AUTO');

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('LIVE_AUTO is disabled by ENABLE_LIVE_AUTO');
  });

  test('validates quantity against F&O lot size', async () => {
    Instrument.findOne.mockResolvedValueOnce({
      securityId: '999',
      symbol: 'NIFTY',
      exchangeSegment: 'NSE_FNO',
      instrument: 'FUTURE',
      lotSize: 50,
      tickSize: 0.05
    });

    const result = await tradingSafety.validateBeforeOrder({
      symbol: 'NIFTY',
      exchangeSegment: 'NSE_FNO',
      transactionType: 'BUY',
      quantity: 25,
      orderType: 'LIMIT',
      productType: 'INTRADAY',
      validity: 'DAY',
      price: 22500
    }, 'PAPER');

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('Quantity must be a multiple of lotSize 50');
  });
});
