# Indian Market AI Trading Agent

## Capital Protection First, Profit Second

A production-grade, India-focused AI trading assistant for Indian equity and intraday workflows, using DhanHQ API as the first broker integration. The system is compliance-aware, audit-first, and designed so AI can advise only. AI output is never allowed to directly execute an order.

## Important Disclaimer

Trading and investing carry significant risk. This application does not guarantee profit, cannot eliminate market risk, and must not be treated as financial advice. Use only with capital you can afford to lose. Live trading must remain disabled until paper trading, risk controls, broker validation, audit logging, and admin approvals are fully tested.

This project does not integrate offshore forex brokers or unauthorized forex platforms. The first supported scope is Indian exchange-traded equity/intraday via DhanHQ. Indian exchange-traded currency derivatives may be considered later only if supported by the broker and legally available to the user.

## Safety Model

1. AI is advisory only and returns schema-validated JSON.
2. Paper trading is the default mode.
3. Live trading is disabled unless an admin explicitly unlocks it.
4. Every order must pass deterministic risk rules before broker submission.
5. Emergency kill switch blocks new trades and can close/flatten supported positions.
6. Every signal, AI analysis, risk decision, broker call, order, mode change, config change, and kill switch action is audit logged.
7. Idempotency keys prevent duplicate order placement.
8. Human approval mode can require manual approval for every trade.

## Trading Modes

- `LEARNING`: observe markets, generate analysis, do not place orders.
- `PAPER`: simulate orders and P&L using live/historical market data.
- `HUMAN_APPROVAL`: generate approved signals, wait for admin/user approval.
- `LIVE_AUTO`: guarded live execution only after admin unlock, paper stats, risk approval, broker health, and idempotency checks.

## Architecture

```text
Frontend: Next.js App Router, TypeScript, Tailwind, Shadcn-style UI, Recharts, Zustand, WebSocket client
Backend: Node.js, Express, MongoDB/Mongoose, Redis, JWT auth, Winston logs, Bull-ready background jobs
Broker: BrokerAdapter interface with DhanAdapter as first implementation
AI: OpenAI advisory analysis with strict JSON schema validation
Risk: deterministic capital-protection engine
Deployment: Vercel frontend, AWS EC2 backend, PM2/Docker, MongoDB Atlas, Redis, Nginx SSL, GitHub Actions
```

## Broker Layer

The broker module uses a `BrokerAdapter` interface so future brokers such as Zerodha or Fyers can be added without rewriting strategy, risk, signal, or UI layers.

Current implementation:

- `DhanAuthService`
- `DhanMarketDataService`
- `DhanHistoricalDataService`
- `DhanOrderService`
- `DhanPortfolioService`
- `DhanInstrumentService`
- `DhanWebSocketService`
- `DhanHealthService`

Supported DhanHQ capabilities in progress:

- Profile and funds
- Instrument master sync and symbol to security ID resolution
- Market quote/LTP
- Historical daily and intraday OHLC candles
- Live market feed WebSocket connection/subscription scaffold
- Place, modify, cancel, status, order book, trade book
- Positions and holdings
- Error handling, request audit logging, secret redaction, and idempotency checks

## Backend Modules

- Auth: admin registration, login, refresh, logout, role-based access
- Broker: Dhan adapter, health, market/order/portfolio services
- Market Data: watchlists, LTP, candles, historical sync, market status
- Strategy: EMA crossover, RSI, VWAP, opening range breakout, volume breakout
- AI Analysis: schema-validated advisory market analysis
- Signal Engine: combines strategy, AI, market data, and risk decisions
- Risk Engine: deterministic rules for trade approval/rejection
- Paper Trading: simulated fills, slippage/charges, P&L, paper/live comparison
- Live Trading: disabled by default and guarded by admin unlock plus risk checks
- Backtesting: historical strategy simulation with drawdown and performance metrics
- Admin: mode, risk config, strategies, kill switch, logs, health, users
- Notifications: WebSocket, email/Telegram optional

## Required Environment Variables

See `.env.example`.

Key safety defaults:

```env
TRADING_MODE=LEARNING
RISK_PER_TRADE=0.005
MAX_RISK_PER_TRADE=0.01
DAILY_MAX_LOSS=0.02
WEEKLY_MAX_LOSS=0.05
MAX_OPEN_TRADES=3
MIN_RISK_REWARD=2
ALLOW_LIVE_TRADING=false
ENABLE_KILL_SWITCH=false
```

## API Routes

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Broker:

- `GET /api/broker/status`
- `POST /api/broker/dhan/connect`
- `GET /api/broker/dhan/profile`
- `GET /api/broker/dhan/funds`
- `GET /api/broker/dhan/positions`
- `GET /api/broker/dhan/holdings`
- `GET /api/broker/dhan/orders`
- `GET /api/broker/dhan/trades`
- `GET /api/broker/dhan/instruments`
- `POST /api/broker/dhan/sync-instruments`

Market:

- `GET /api/market/watchlist`
- `POST /api/market/watchlist`
- `DELETE /api/market/watchlist/:id`
- `GET /api/market/ltp/:symbol`
- `GET /api/market/candles/:symbol`
- `POST /api/market/historical/sync`

Existing planned modules also include signals, trades, admin, dashboard, health, and backtests.

## AI Advisory Schema

```json
{
  "symbol": "",
  "bias": "BULLISH|BEARISH|NEUTRAL",
  "confidence": 0,
  "reasoning": "",
  "risk_notes": "",
  "trade_allowed": false,
  "suggested_setup": {
    "entry": 0,
    "stop_loss": 0,
    "target": 0
  }
}
```

AI output must be validated, logged, and passed through deterministic risk rules. It must never submit directly to Dhan or any broker.

## Deterministic Risk Rules

- Kill switch must be off
- Live trading requires explicit admin unlock
- Stop loss and target are mandatory
- Minimum risk reward is 1:2
- Risk per trade cannot exceed configured or absolute max
- Daily and weekly loss limits are enforced
- Max open trades and correlated trades are enforced
- No martingale and no revenge trading
- Consecutive-loss lockout
- Duplicate signals/orders rejected
- Spread, liquidity, volatility, market-open, broker-health, API-latency, funds, position-size, and symbol-whitelist checks
- Human approval required in `HUMAN_APPROVAL` mode

## Frontend Pages

- Login
- Admin Dashboard
- User Dashboard
- Market Watch
- Strategy Builder
- Signal Center
- Paper Trading Dashboard
- Live Trading Dashboard
- Backtesting Dashboard
- Risk Management
- Broker Connection Status
- AI Analysis Logs
- Audit Logs
- Settings
- Emergency Kill Switch Panel

## WebSocket Channels

- `market:ltp`
- `market:candle`
- `signal:new`
- `signal:update`
- `order:update`
- `trade:update`
- `bot:status`
- `broker:status`
- `risk:alert`
- `admin:alert`

## Development Phases

Phase 1: monorepo structure, backend/frontend setup, MongoDB, Redis, auth, RBAC, AppConfig, AuditLog, health.

Phase 2: Dhan API client, BrokerAdapter, Dhan instrument sync, historical candles, live market WebSocket scaffold, watchlist.

Phase 3: strategies, indicators, signal generation, risk engine, AI schema validation, paper trading.

Phase 4: dashboards, signal center, paper dashboard, risk UI, WebSocket live updates.

Phase 5: backtesting, analytics, logs, notifications, broker health monitoring.

Phase 6: guarded live trading, manual approval, order lifecycle tracking, kill switch, production deployment.

## Local Development

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

## Testing Checklist

- Risk engine unit tests
- Position sizing tests
- AI JSON schema validation tests
- Mock Dhan API tests
- Paper trading simulation tests
- Backtest accuracy tests
- Auth and RBAC tests
- API route tests
- Kill switch tests
- Duplicate order prevention tests
- WebSocket reconnect tests

## Security Checklist

- Never log broker tokens, JWT secrets, or API keys
- Encrypt stored broker credentials
- Use short-lived access tokens and refresh-token rotation
- Protect all broker/admin routes with RBAC
- Enable rate limiting and Helmet headers
- Keep live trading disabled by default
- Require static IP whitelisting where Dhan requires it
- Keep complete audit logs for regulated decision reconstruction
- Use least-privilege production environment variables
- Back up MongoDB daily and test rollback regularly

## Current Implementation Status

Completed in the scaffold:

- Express app, MongoDB, Redis, JWT auth/RBAC, audit model
- Dhan `BrokerAdapter` implementation skeleton
- Dhan API client with secret redaction and audit logging
- Dhan profile/funds/positions/holdings/orders/trades service calls
- Dhan instrument master sync starter
- Dhan historical OHLC normalization
- Dhan LTP/quote service starter
- Market watchlist and candle sync routes
- Environment examples updated for Indian-market/Dhan workflow

Next:

- Harden risk engine around Indian equities
- Add AI schema validation service
- Implement paper trading engine before any live order workflow
- Add mock Dhan tests and risk tests
