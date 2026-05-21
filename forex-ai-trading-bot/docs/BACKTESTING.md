# Backtesting Guide

## Overview

The backtesting engine allows you to test trading strategies on historical data before deploying them live.

## Running a Backtest

### Via API
```bash
curl -X POST http://localhost:5000/api/backtest/run   -H "Content-Type: application/json"   -H "Authorization: Bearer YOUR_TOKEN"   -d '{
    "pair": "EUR/USD",
    "timeframe": "1h",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "strategyParams": {
      "name": "EMA Crossover",
      "riskPerTrade": 0.5,
      "minRiskReward": 2,
      "maxOpenTrades": 3,
      "spread": 0.0002,
      "slippage": 0.0001,
      "commission": 0
    }
  }'
```

### Via Frontend
1. Navigate to Backtest page
2. Select pair and timeframe
3. Set date range
4. Configure risk parameters
5. Click "Run Backtest"

## Strategy Parameters

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| riskPerTrade | Risk per trade (%) | 0.5 | 0.1 - 2.0 |
| minRiskReward | Minimum risk-reward ratio | 2 | 1 - 5 |
| maxOpenTrades | Maximum concurrent trades | 3 | 1 - 10 |
| spread | Average spread | 0.0002 | - |
| slippage | Average slippage | 0.0001 | - |
| commission | Per trade commission | 0 | - |

## Metrics Explained

### Win Rate
Percentage of winning trades. Good strategies typically have 40-60% win rate.

### Profit Factor
Gross profit / Gross loss. Values above 1.5 are considered good.

### Max Drawdown
Largest peak-to-trough decline. Should be below 20% for safety.

### Sharpe Ratio
Risk-adjusted return. Values above 1.0 are good, above 2.0 excellent.

### Sortino Ratio
Similar to Sharpe but only considers downside risk.

## Validation Checks

The system automatically rejects strategies that:
- Have insufficient sample size (< 100 trades)
- Show signs of overfitting (> 85% win rate)
- Have profit factor below 1.5
- Have max drawdown above 20%
- Only work in one market condition

## Best Practices

1. **Test Multiple Timeframes**: Verify strategy works on 1H, 4H, and 1D
2. **Include Spread/Slippage**: Always use realistic values
3. **Check Different Periods**: Test bull, bear, and sideways markets
4. **Validate Out-of-Sample**: Keep 20% of data for final validation
5. **Start Conservative**: Use lower risk in live trading than backtest