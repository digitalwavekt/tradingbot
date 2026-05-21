const {
  getPipValue,
  priceToPips,
  pipsToPrice,
  calculatePositionSize,
  isMarketOpen,
  roundToDecimals
} = require('../src/utils/helpers');

describe('forex helpers', () => {
  test('uses 0.0001 pip value for non-JPY pairs and 0.01 for JPY pairs', () => {
    expect(getPipValue('EUR/USD')).toBe(0.0001);
    expect(getPipValue('USD/JPY')).toBe(0.01);
  });

  test('converts between price movement and pips', () => {
    expect(priceToPips(0.0025, 'EUR/USD')).toBeCloseTo(25);
    expect(pipsToPrice(25, 'EUR/USD')).toBeCloseTo(0.0025);
    expect(priceToPips(0.25, 'USD/JPY')).toBeCloseTo(25);
  });

  test('calculates risk-based position size', () => {
    const result = calculatePositionSize({
      accountBalance: 100000,
      riskPercent: 1,
      stopLossPips: 50,
      pipValue: 10,
      pair: 'EUR/USD',
      leverage: 50
    });

    expect(result).toEqual({
      lotSize: 2,
      riskAmount: 1000,
      marginRequired: 4000,
      riskPerPip: 20
    });
  });

  test('detects weekend market closures around forex rollover', () => {
    expect(isMarketOpen('EUR/USD', new Date('2026-05-22T21:59:00Z'))).toBe(true);
    expect(isMarketOpen('EUR/USD', new Date('2026-05-22T22:00:00Z'))).toBe(false);
    expect(isMarketOpen('EUR/USD', new Date('2026-05-24T21:59:00Z'))).toBe(false);
    expect(isMarketOpen('EUR/USD', new Date('2026-05-24T22:00:00Z'))).toBe(true);
  });

  test('rounds numeric values to requested decimals', () => {
    expect(roundToDecimals(1.234567, 5)).toBe(1.23457);
    expect(roundToDecimals(145.6789, 3)).toBe(145.679);
  });
});
