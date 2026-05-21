const {
  getPipValue,
  priceToPips,
  pipsToPrice,
  calculatePositionSize,
  isMarketOpen,
  roundToDecimals
} = require('../src/utils/helpers');

describe('Indian market helpers', () => {
  test('rejects forex pairs and uses tick value for Indian symbols', () => {
    expect(() => getPipValue('EUR/USD')).toThrow('Forex pairs are not supported');
    expect(getPipValue('RELIANCE')).toBe(0.05);
  });

  test('converts between price movement and ticks', () => {
    expect(priceToPips(2.5, 'RELIANCE')).toBeCloseTo(50);
    expect(pipsToPrice(50, 'RELIANCE')).toBeCloseTo(2.5);
  });

  test('calculates risk-based position size', () => {
    const result = calculatePositionSize({
      accountBalance: 100000,
      riskPercent: 1,
      entryPrice: 2500,
      stopLoss: 2450,
      lotSize: 1
    });

    expect(result).toEqual({
      quantity: 20,
      lotSize: 1,
      riskAmount: 1000,
      marginRequired: 50000,
      riskPerShare: 50
    });
  });

  test('detects NSE market hours', () => {
    expect(isMarketOpen('RELIANCE', new Date('2026-05-21T04:30:00Z'))).toBe(true);
    expect(isMarketOpen('RELIANCE', new Date('2026-05-21T10:31:00Z'))).toBe(false);
    expect(isMarketOpen('RELIANCE', new Date('2026-05-23T04:30:00Z'))).toBe(false);
  });

  test('rounds numeric values to requested decimals', () => {
    expect(roundToDecimals(1.234567, 5)).toBe(1.23457);
    expect(roundToDecimals(145.6789, 3)).toBe(145.679);
  });
});
