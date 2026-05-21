'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { useDashboardStore } from '@/hooks/useDashboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  DollarSign,
  Lock,
  LogOut,
  RotateCw,
  ShieldCheck,
  Signal,
  Zap
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, refreshSession, tokenExpiresAt, refreshTokenExpiresAt } = useAuthStore();
  const { dashboardData, fetchDashboard } = useDashboardStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const mode = dashboardData?.botMode || 'LEARNING';
  const pnl = dashboardData?.today?.pnl || 0;
  const pnlPositive = pnl >= 0;

  const sessionRemainingMs = Math.max((tokenExpiresAt || 0) - now, 0);
  const refreshRemainingMs = Math.max((refreshTokenExpiresAt || 0) - now, 0);
  const sessionLabel = useMemo(() => {
    if (!tokenExpiresAt) return 'Unknown';
    const totalSeconds = Math.max(Math.floor(sessionRemainingMs / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [sessionRemainingMs, tokenExpiresAt]);

  const sessionStatus =
    sessionRemainingMs <= 60_000 ? 'text-red-300' :
    sessionRemainingMs <= 180_000 ? 'text-amber-300' :
    'text-emerald-300';

  const modeStyles: Record<string, string> = {
    LEARNING: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
    PAPER: 'border-blue-400/25 bg-blue-400/10 text-blue-100',
    DEMO: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
    HUMAN_APPROVAL: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    LIVE_AUTO: 'border-red-400/25 bg-red-400/10 text-red-200'
  };

  const modeLabel: Record<string, string> = {
    LEARNING: 'Learning',
    PAPER: 'Paper',
    DEMO: 'Demo',
    HUMAN_APPROVAL: 'Approval',
    LIVE_AUTO: 'Live'
  };

  const metrics = [
    {
      label: 'Account balance',
      value: `$${dashboardData?.account?.balance?.toLocaleString() || '0'}`,
      detail: `Equity $${dashboardData?.account?.equity?.toLocaleString() || '0'}`,
      icon: DollarSign,
      tone: 'text-blue-300'
    },
    {
      label: "Today's P&L",
      value: `${pnlPositive ? '+' : ''}$${pnl.toFixed(2)}`,
      detail: `${dashboardData?.today?.trades || 0} trades today`,
      icon: Activity,
      tone: pnlPositive ? 'text-emerald-300' : 'text-red-300'
    },
    {
      label: 'Open positions',
      value: `${dashboardData?.account?.openPositions || 0}`,
      detail: `Max ${dashboardData?.account?.openPositions || 0}/3 used`,
      icon: BarChart3,
      tone: 'text-sky-300'
    },
    {
      label: 'Paper trading',
      value: `${dashboardData?.account?.paperTradingDays || 0} days`,
      detail: `${dashboardData?.account?.paperTotalReturn?.toFixed(2) || '0.00'}% return`,
      icon: Clock,
      tone: 'text-amber-300'
    }
  ];

  return (
    <div className="space-y-8">
      <section className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="page-kicker">Operations dashboard</div>
          <h1 className="page-title">Trading Control Center</h1>
          <p className="page-copy">
            Monitor account exposure, system health, signal activity, and emergency controls from one screen.
          </p>
        </div>
        <div className="surface-muted rounded-lg px-4 py-3 text-sm text-slate-300">
          <span className="text-slate-500">Live trading:</span>{' '}
          <span className={dashboardData?.isLiveEnabled ? 'text-red-300' : 'text-emerald-300'}>
            {dashboardData?.isLiveEnabled ? 'Unlocked' : 'Locked'}
          </span>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="metric-card">
              <div className="flex items-start justify-between gap-3">
                <div className="metric-label">
                  <Icon className={`h-4 w-4 ${metric.tone}`} />
                  {metric.label}
                </div>
              </div>
              <div className={`metric-value ${metric.tone}`}>{metric.value}</div>
              <div className="mt-1 text-sm text-slate-500">{metric.detail}</div>
            </div>
          );
        })}
      </section>

      <section className="mb-6 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3">
        <div className="flex items-start gap-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Risk warning: trading carries significant risk. Never trade with capital you cannot afford to lose.</span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="surface rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Risk Status</h2>
              <p className="mt-1 text-sm text-slate-500">Current limits are inside safe operating range.</p>
            </div>
            <Badge variant="success">Safe</Badge>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {[
              ['Daily loss', 10, '0.1% / 2% limit'],
              ['Weekly loss', 15, '0.8% / 5% limit'],
              ['Margin usage', 5, '2% / 50% limit']
            ].map(([label, value, detail]) => (
              <div key={label as string} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-xs font-medium text-emerald-300">Safe</span>
                </div>
                <Progress value={value as number} max={100} variant="success" />
                <div className="mt-2 text-xs text-slate-500">{detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
            <div className="mt-4 grid gap-3">
              <Button variant="outline" onClick={() => router.push('/dashboard/admin')} className="justify-start border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
                <Lock className="mr-2 h-4 w-4" />
                Admin Panel
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard/trades')} className="justify-start border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Trades
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard/signals')} className="justify-start border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
                <Zap className="mr-2 h-4 w-4" />
                View Signals
              </Button>
            </div>
          </div>

          <div className="surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white">System Status</h2>
            <div className="mt-4 space-y-3">
              {dashboardData?.systemHealth?.length ? (
                dashboardData.systemHealth.map((health) => (
                  <div key={health.component} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-300">
                      <Signal className="h-4 w-4 text-slate-500" />
                      {health.component}
                    </span>
                    <Badge variant={health.status === 'HEALTHY' ? 'success' : health.status === 'DEGRADED' ? 'warning' : 'danger'}>
                      {health.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-500">
                  Waiting for health data...
                </div>
              )}
            </div>
          </div>
        </div>
        </section>
    </div>
  );
}
