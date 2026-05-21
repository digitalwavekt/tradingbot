# Testing Guide

## Unit Tests

### Backend
```bash
cd backend
npm test
```

Test coverage includes:
- Risk Engine validation rules
- Technical analysis calculations
- Trade decision logic
- Authentication and authorization
- API endpoint validation

### Frontend
```bash
cd frontend
npm test
```

## Integration Tests

### API Testing
Use the provided Postman collection or test manually:

1. Login: `POST /api/auth/login`
2. Get dashboard: `GET /api/dashboard/overview`
3. Analyze pair: `POST /api/signals/analyze/EUR/USD`
4. View trades: `GET /api/trades`

### WebSocket Testing
Connect to `ws://localhost:5000/ws` and subscribe to channels:
```json
{"type": "subscribe", "channel": "market"}
```

## Manual Testing Checklist

### Authentication
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (should fail)
- [ ] Account lockout after 5 failed attempts
- [ ] Token refresh
- [ ] Access control (admin vs user)

### Risk Management
- [ ] Kill switch activation
- [ ] Kill switch reset
- [ ] Daily loss limit enforcement
- [ ] Weekly loss limit enforcement
- [ ] Max open trades limit
- [ ] Risk-reward validation
- [ ] News filter blocking trades

### Trading Modes
- [ ] LEARNING mode (analysis only)
- [ ] PAPER mode (fake trades)
- [ ] HUMAN_APPROVAL mode (manual approval)
- [ ] LIVE mode (requires approval)

### Backtesting
- [ ] Run backtest with valid parameters
- [ ] Verify overfitting detection
- [ ] Check profit factor calculation
- [ ] Validate drawdown calculation

### Emergency Procedures
- [ ] Activate kill switch from admin panel
- [ ] Close all trades manually
- [ ] Verify all trades closed after kill switch
- [ ] Check audit logs for emergency actions