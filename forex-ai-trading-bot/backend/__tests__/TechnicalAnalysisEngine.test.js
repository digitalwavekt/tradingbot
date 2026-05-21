jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

jest.mock('../src/models', () => ({
  CandleData: {
    find: jest.fn()
  }
}));

const technicalAnalysis = require('../src/services/analysis/TechnicalAnalysisEngine');

const buildCandles = (count, closeFactory = i => 1 + i * 0.001) => {
  return Array.from({ length: count }, (_, i) => {
    const close = closeFactory(i);
    return {
      open: close - 0.0002,
      high: close + 0.0005,
      low: close - 0.0005,
      close
    };
  }).reverse();
};

describe('TechnicalAnalysisEngine calculations', () => {
  test('returns stable EMA values for flat candles', () => {
    const candles = buildCandles(60, () => 1.25);

    expect(technicalAnalysis.calculateEMAs(candles, [20, 50])).toEqual({
      ema20: 1.25,
      ema50: 1.25
    });
  });

  test('returns RSI of 100 for an uninterrupted upward sequence', () => {
    const candles = buildCandles(20, i => 1 + i * 0.001);

    expect(technicalAnalysis.calculateRSI(candles)).toBe(100);
  });

  test('calculates Bollinger bands with zero bandwidth for flat prices', () => {
    const candles = buildCandles(25, () => 1.1);

    expect(technicalAnalysis.calculateBollingerBands(candles)).toEqual({
      upper: 1.1,
      middle: 1.1,
      lower: 1.1,
      bandwidth: 0
    });
  });

  test('marks at least three bullish timeframe trends as aligned', () => {
    const result = technicalAnalysis.checkTimeframeAlignment({
      '5m': { trend: 'STRONG_UPTREND' },
      '15m': { trend: 'WEAK_UPTREND' },
      '1h': { trend: 'STRONG_UPTREND' },
      '4h': { trend: 'NEUTRAL' }
    });

    expect(result.alignment).toBe('BULLISH');
    expect(result.aligned).toBe(true);
    expect(result.bullishCount).toBe(3);
  });
});
