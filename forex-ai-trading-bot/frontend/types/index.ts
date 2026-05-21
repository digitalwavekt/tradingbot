export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'subadmin' | 'user' | 'auditor';
  lastLogin?: string;
}

export interface Trade {
  tradeId: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  positionSize: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  mode: 'PAPER' | 'DEMO' | 'LIVE';
  monetaryPnl?: number;
  pipsGained?: number;
  exitReason?: string;
  createdAt: string;
  closedAt?: string;
}

export interface Signal {
  signalId: string;
  pair: string;
  direction: 'BUY' | 'SELL' | 'WAIT' | 'NO_TRADE';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  aiAnalysis?: {
    marketSummary: string;
    finalRecommendation: string;
    confidencePercentage: number;
    riskWarning: string;
  };
  createdAt: string;
}

export interface BotConfig {
  mode: 'LEARNING' | 'PAPER' | 'DEMO' | 'HUMAN_APPROVAL' | 'LIVE_AUTO';
  isLiveTradingEnabled: boolean;
  riskPerTradePercent: number;
  dailyMaxLossPercent: number;
  weeklyMaxLossPercent: number;
  maxOpenTrades: number;
  minRiskReward: number;
  killSwitchTriggered: boolean;
  killSwitchReason?: string;
  activeBroker: string;
}

export interface DashboardData {
  botMode: string;
  killSwitchActive: boolean;
  killSwitchReason?: string;
  isLiveEnabled: boolean;
  account: {
    balance: number;
    equity: number;
    marginUsed: number;
    openPositions: number;
    paperTradingDays: number;
    paperTotalReturn: number;
  };
  today: {
    trades: number;
    pnl: number;
  };
  signals: {
    total: number;
    pending: number;
  };
  recentNews?: Array<{
    title: string;
    currency: string;
    impact: string;
    scheduledTime: string;
  }>;
  systemHealth?: Array<{
    component: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | string;
  }>;
}

export interface MarketData {
  pair: string;
  bid: number;
  ask: number;
  spread: number;
  spreadPips: number;
  timestamp: string;
  session: string;
  volatilityRegime: string;
}

export interface BacktestResult {
  backtestId: string;
  strategyName: string;
  pair: string;
  status: string;
  results?: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    netProfitPercent: number;
    maxDrawdownPercent: number;
  };
  validation?: {
    rejected: boolean;
    rejectionReasons: string[];
  };
  createdAt: string;
}
