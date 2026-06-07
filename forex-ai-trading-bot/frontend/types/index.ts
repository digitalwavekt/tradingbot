export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'subadmin' | 'user' | 'auditor';
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface DashboardData {
  account: {
    balance: number;
    equity: number;
    openPositions: number;
    paperTradingDays: number;
    paperTotalReturn: number;
  };
  today: {
    pnl: number;
    trades: number;
  };
  isLiveEnabled: boolean;
  currentMode: TradingMode;
  botMode?: TradingMode;
  systemHealth: SystemHealth[];
}

export type TradingMode = 'LEARNING' | 'PAPER' | 'DEMO' | 'HUMAN_APPROVAL' | 'LIVE_MANUAL' | 'LIVE_AUTO';

export interface SystemHealth {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  latency?: number;
  lastChecked: string;
}

export interface Trade {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  monetaryPnl: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING';
  mode: TradingMode;
  createdAt: string;
  closedAt?: string;
}

export interface Signal {
  id: string;
  symbol: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  reasoning: string;
  riskNotes: string;
  tradeAllowed: boolean;
  suggestedSetup: {
    entry: number;
    stopLoss: number;
    target: number;
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  createdAt: string;
}

export interface Performance {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface BacktestResult {
  id: string;
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  createdAt: string;
}

export interface RiskConfig {
  mode?: TradingMode;
  currentMode?: TradingMode;
  riskPerTradePercent: number;
  dailyMaxLossPercent: number;
  maxOpenTrades: number;
  minRiskReward: number;
  maxDrawdownPercent: number;
  minConfidenceScore: number;
  killSwitchTriggered: boolean;
  killSwitchReason?: string;
  isLiveTradingEnabled: boolean;
}

export interface AdminRuntimeStatus {
  timestamp: string;
  effectiveMode: TradingMode;
  modeSource: 'env' | 'database' | 'default';
  env: {
    nodeEnv: string | null;
    tradingMode: string | null;
    allowLiveTrading: boolean;
    enableLiveAuto: boolean;
    aiEnabled: boolean;
    ruleBasedTrading: boolean;
    strategyMode: string;
    defaultStrategy: string;
    watchlistMode: string;
    enableScheduler: boolean;
    enableMarketSync: boolean;
    enableCandleSync: boolean;
    enableDhanHistoricalSync: boolean;
    enableDhanAutoToken: boolean;
    dhanClientConfigured: boolean;
    dhanAccessTokenConfigured: boolean;
  };
  config: RiskConfig | null;
  account: {
    broker: string;
    accountType: string;
    accountId?: string;
    isConnected: boolean;
    healthCheckStatus?: string;
    tokenStatus?: string;
    authMode?: string;
    lastTokenSource?: string;
    tokenExpiry?: string;
    apiLatencyMs?: number;
    balance: number | null;
    equity: number | null;
    paperBalance: number | null;
    paperEquity: number | null;
    displayBalance: number | null;
    displayEquity: number | null;
    marginUsed: number | null;
    freeMargin: number | null;
    openPositions: number;
    unrealizedPnl: number;
    paperTradingDays: number;
    paperTotalReturn: number;
    updatedAt?: string;
    lastConnectedAt?: string;
    lastError?: string;
    lastErrorAt?: string;
  } | null;
  trading: {
    openPaperTrades: number;
    pendingPaperTrades: number;
    openTrades: number;
    todayClosedTrades: number;
    todayPnl: number;
  };
  watchlist: {
    mode: string;
    count: number;
    hasTataMotors: boolean;
    hasLtim: boolean;
  };
  systemHealth: SystemHealth[];
}

export interface AuditLog {
  id: string;
  action: string;
  userEmail: string;
  severity: 'info' | 'warning' | 'critical';
  details: Record<string, any>;
  createdAt: string;
}

export interface MarketData {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}
