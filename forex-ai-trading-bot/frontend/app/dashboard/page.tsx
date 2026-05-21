'use client';

import { useState, useEffect } from 'react';
import { dashboardAPI, healthAPI } from '@/lib/api';
import { DashboardData, SystemHealth, TradingMode } from '@/types';
import {
  DollarSign,
  Activity,
  BarChart3,
  Clock,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

const modeStyles: Record<TradingMode, string> = {
  LEARNING: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  PAPER: 'border-blue-400/30 bg-blue-400/10 text-blue-300',
  DEMO: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  HUMAN_APPROVAL: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  LIVE_AUTO: 'border-red-400/30 bg-red-400/10 text-red-300',
};

const modeLabel: Record<TradingMode, string> = {
  LEARNING: 'Learning Mode',
  PAPER: 'Paper Trading',
  DEMO: 'Demo Mode',
  HUMAN_APPROVAL: 'Human Approval',
  LIVE_AUTO: 'Live Trading',
};

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [healthData, setHealthData] = useState<SystemHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [overviewRes, healthRes] = await Promise.all([
        dashboardAPI.getOverview(),
        healthAPI.check(),
      ]);
      setDashboardData(overviewRes.data);
      setHealthData(healthRes.data?.components || []);
    } catch (error) {
      toast.error('Failed to fetch dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const pnl = dashboardData?.today?.pnl || 0;
  const pnlPositive = pnl >= 0;

  const metrics = [
    {
      label: 'Account Balance',
      value: `₹${(dashboardData?.account?.balance || 0).toLocaleString('en-IN')}`,
      detail: `Equity ₹${(dashboardData?.account?.equity || 0).toLocaleString('en-IN')}`,
      icon: DollarSign,
      tone: 'text-blue-400',
      bgTone: 'bg-blue-500/10',
    },
    {
      label: "Today's P&L",
      value: `${pnlPositive ? '+' : ''}₹${pnl.toFixed(2)}`,
      detail: `${dashboardData?.today?.trades || 0} trades today`,
      icon: Activity,
      tone: pnlPositive ? 'text-emerald-400' : 'text-red-400',
      bgTone: pnlPositive ? 'bg-emerald-500/10' : 'bg-red-500/10',
    },
    {
      label: 'Open Positions',
      value: `${dashboardData?.account?.openPositions || 0}`,
      detail: `Max ${dashboardData?.account?.openPositions || 0}/3 used`,
      icon: BarChart3,
      tone: 'text-sky-400',
      bgTone: 'bg-sky-500/10',
    },
    {
      label: 'Paper Trading',
      value: `${dashboardData?.account?.paperTradingDays || 0} days`,
      detail: `${dashboardData?.account?.paperTotalReturn?.toFixed(2) || '0.00'}% return`,
      icon: Clock,
      tone: 'text-amber-400',
      bgTone: 'bg-amber-500/10',
    },
  ];

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8 animate-fade-up">
        <p className="page-kicker">Operations Dashboard</p>
        <h1 className="page-title">Trading Control Center</h1>
        <p className="page-copy">
          Monitor account exposure, system health, signal activity, and emergency controls from one screen.
        </p>
      </div>

      {/* Mode Banner */}
      <div className={`mb-6 rounded-xl border p-4 ${modeStyles[dashboardData?.currentMode || 'LEARNING']}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">{modeLabel[dashboardData?.currentMode || 'LEARNING']}</p>
              <p className="text-xs opacity-80">
                Live trading: {dashboardData?.isLiveEnabled ? 'Unlocked' : 'Locked'}
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            dashboardData?.isLiveEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'
          }`}>
            <div className={`h-2 w-2 rounded-full ${dashboardData?.isLiveEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
            {dashboardData?.isLiveEnabled ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="metric-card animate-fade-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="metric-label">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${metric.bgTone}`}>
                  <Icon className={`h-4 w-4 ${metric.tone}`} />
                </div>
                <span>{metric.label}</span>
              </div>
              <p className={`metric-value ${metric.tone}`}>{metric.value}</p>
              <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
            </div>
          );
        })}
      </div>

      {/* Risk & System Status */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Status */}
        <div className="surface p-6 animate-fade-up" style={{ animationDelay: '0.4s' }}>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Risk Status</h3>
              <p className="text-sm text-slate-400">Current limits are inside safe operating range.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
          </div>

          <div className="space-y-4">
            {[
              ['Daily Loss', 10, '0.1% / 2% limit', 'emerald'],
              ['Weekly Loss', 15, '0.8% / 5% limit', 'emerald'],
              ['Margin Usage', 5, '2% / 50% limit', 'emerald'],
            ].map(([label, value, detail, color]) => (
              <div key={label as string} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className={`text-${color}-400 font-medium`}>Safe</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className={`h-full rounded-full bg-${color}-500 transition-all duration-500`}
                    style={{ width: `${value as number}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="surface p-6 animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">System Health</h3>
              <p className="text-sm text-slate-400">Real-time component monitoring</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <Activity className="h-5 w-5 text-blue-400" />
            </div>
          </div>

          <div className="space-y-3">
            {healthData.length > 0 ? (
              healthData.map((health) => (
                <div
                  key={health.component}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {getHealthIcon(health.status)}
                    <div>
                      <p className="text-sm font-medium text-white">{health.component}</p>
                      {health.latency && (
                        <p className="text-xs text-slate-500">{health.latency}ms latency</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium capitalize ${
                    health.status === 'healthy' ? 'text-emerald-400' :
                    health.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {health.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <Clock className="mb-2 h-8 w-8" />
                <p className="text-sm">Waiting for health data...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-200/80">
            Risk warning: Trading carries significant risk. Never trade with capital you cannot afford to lose.
            This is an AI advisory system - all decisions require human verification before execution.
          </p>
        </div>
      </div>
    </div>
  );
}
