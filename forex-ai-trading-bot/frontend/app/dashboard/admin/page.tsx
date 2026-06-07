'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { adminAPI, brokerAPI, healthAPI, tradeAPI } from '@/lib/api';
import { AdminRuntimeStatus, AuditLog, RiskConfig, SystemHealth, TradingMode, User } from '@/types';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Power,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const tradingModes: TradingMode[] = ['LEARNING', 'PAPER', 'LIVE_MANUAL', 'LIVE_AUTO'];

const modeStyles: Record<TradingMode, { bg: string; text: string; border: string; label: string }> = {
  LEARNING: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', label: 'Learning' },
  PAPER: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Paper Trading' },
  DEMO: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', label: 'Demo' },
  HUMAN_APPROVAL: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Human Approval' },
  LIVE_MANUAL: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', label: 'Live Manual' },
  LIVE_AUTO: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', label: 'Live Auto' },
};

type LoadError = {
  source: string;
  message: string;
};

type BrokerLiveState = {
  status?: any;
  funds?: any;
  fundsError?: string;
};

const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Unavailable';
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-IN') : 'Unavailable';
  return String(value);
};

const statusTone = (ok: boolean | undefined) => {
  if (ok === true) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  if (ok === false) return 'border-red-500/20 bg-red-500/10 text-red-400';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
};

const healthOk = (status?: string) => {
  const s = String(status || '').toUpperCase();
  return s === 'HEALTHY' || s === 'OK' || s === 'CONNECTED';
};

const getFundsBalance = (funds: any) => {
  if (!funds) return null;
  const candidates = [
    funds.availableBalance,
    funds.available_balance,
    funds.availabelBalance,
    funds.sodLimit,
    funds.dhanClientId ? funds.availabelBalance : undefined,
    funds.data?.availableBalance,
    funds.data?.availabelBalance,
    funds.data?.sodLimit,
  ];
  const value = candidates.find((item) => Number.isFinite(Number(item)));
  return value === undefined ? null : Number(value);
};

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [runtime, setRuntime] = useState<AdminRuntimeStatus | null>(null);
  const [apiHealth, setApiHealth] = useState<any | null>(null);
  const [brokerLive, setBrokerLive] = useState<BrokerLiveState>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'mode' | 'risk' | 'logs' | 'users'>('status');

  const canAdminWrite = user?.role === 'super_admin' || user?.role === 'admin';
  const canReadAdmin = canAdminWrite || user?.role === 'subadmin';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const errors: LoadError[] = [];

    const [runtimeRes, configRes, healthRes, brokerStatusRes, fundsRes, auditRes, usersRes] = await Promise.allSettled([
      adminAPI.getRuntimeStatus(),
      adminAPI.getConfig(),
      healthAPI.check(),
      brokerAPI.getStatus(),
      brokerAPI.getDhanFunds(),
      adminAPI.getAuditLogs(),
      canAdminWrite ? adminAPI.getUsers() : Promise.resolve({ data: { users: [] } }),
    ]);

    if (runtimeRes.status === 'fulfilled') setRuntime(runtimeRes.value.data);
    else errors.push({ source: 'Runtime', message: runtimeRes.reason?.response?.data?.error || runtimeRes.reason?.message || 'Failed' });

    if (configRes.status === 'fulfilled') setConfig(configRes.value.data.config);
    else errors.push({ source: 'Config', message: configRes.reason?.response?.data?.error || configRes.reason?.message || 'Failed' });

    if (healthRes.status === 'fulfilled') setApiHealth(healthRes.value.data);
    else errors.push({ source: 'API Health', message: healthRes.reason?.response?.data?.error || healthRes.reason?.message || 'Failed' });

    if (brokerStatusRes.status === 'fulfilled') {
      setBrokerLive((prev) => ({ ...prev, status: brokerStatusRes.value.data }));
    } else {
      errors.push({ source: 'Broker Status', message: brokerStatusRes.reason?.response?.data?.error || brokerStatusRes.reason?.message || 'Failed' });
      setBrokerLive((prev) => ({ ...prev, status: null }));
    }

    if (fundsRes.status === 'fulfilled') {
      setBrokerLive((prev) => ({ ...prev, funds: fundsRes.value.data, fundsError: undefined }));
    } else {
      setBrokerLive((prev) => ({
        ...prev,
        funds: null,
        fundsError: fundsRes.reason?.response?.data?.error || fundsRes.reason?.message || 'Unavailable',
      }));
    }

    if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value.data.logs || []);
    else errors.push({ source: 'Audit Logs', message: auditRes.reason?.response?.data?.error || auditRes.reason?.message || 'Failed' });

    if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.users || []);
    else errors.push({ source: 'Users', message: usersRes.reason?.response?.data?.error || usersRes.reason?.message || 'Failed' });

    setLoadErrors(errors);
    setIsLoading(false);
  }, [canAdminWrite]);

  useEffect(() => {
    if (!canReadAdmin) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [canReadAdmin, fetchData, router]);

  const effectiveMode = runtime?.effectiveMode || config?.mode || 'PAPER';
  const liveEnvAllowed = runtime?.env.allowLiveTrading === true;
  const liveAutoAllowed = liveEnvAllowed && runtime?.env.enableLiveAuto === true;
  const displayedBalance = runtime?.account?.displayBalance ?? null;
  const displayedEquity = runtime?.account?.displayEquity ?? null;
  const dhanFundsBalance = getFundsBalance(brokerLive.funds);

  const statusCards = useMemo(() => [
    {
      label: 'Effective Mode',
      value: effectiveMode,
      detail: runtime?.modeSource ? `Source: ${runtime.modeSource}` : 'Source unavailable',
      icon: Power,
      ok: effectiveMode === 'PAPER',
    },
    {
      label: 'Paper Balance',
      value: formatMoney(displayedBalance),
      detail: `Equity: ${formatMoney(displayedEquity)}`,
      icon: Wallet,
      ok: displayedBalance !== null,
    },
    {
      label: 'Dhan Funds',
      value: formatMoney(dhanFundsBalance),
      detail: brokerLive.fundsError ? `Error: ${brokerLive.fundsError}` : 'Fetched from broker API',
      icon: RadioTower,
      ok: dhanFundsBalance !== null,
    },
    {
      label: 'API Health',
      value: apiHealth?.status || 'Unavailable',
      detail: apiHealth?.timestamp ? new Date(apiHealth.timestamp).toLocaleString() : 'No health response',
      icon: Activity,
      ok: healthOk(apiHealth?.status),
    },
    {
      label: 'Database',
      value: apiHealth?.checks?.database?.status || 'Unavailable',
      detail: apiHealth?.checks?.database?.latency !== undefined ? `${apiHealth.checks.database.latency}ms` : 'No latency',
      icon: Database,
      ok: healthOk(apiHealth?.checks?.database?.status),
    },
    {
      label: 'Watchlist',
      value: runtime?.watchlist.count ?? 'Unavailable',
      detail: runtime ? `${runtime.watchlist.mode} mode` : 'No runtime data',
      icon: Shield,
      ok: runtime ? !runtime.watchlist.hasTataMotors && !runtime.watchlist.hasLtim && runtime.watchlist.count > 0 : undefined,
    },
  ], [apiHealth, brokerLive.fundsError, dhanFundsBalance, displayedBalance, displayedEquity, effectiveMode, runtime]);

  const handleModeChange = async (mode: TradingMode) => {
    setIsLoading(true);
    try {
      await adminAPI.setMode(mode);
      toast.success(`Mode changed to ${modeStyles[mode].label}`);
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to change mode');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!confirm('Activate kill switch and halt trading?')) return;
    setIsLoading(true);
    try {
      await adminAPI.triggerKillSwitch('Manual activation by admin');
      toast.success('Kill switch activated');
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to activate kill switch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetKillSwitch = async () => {
    setIsLoading(true);
    try {
      await adminAPI.resetKillSwitch();
      toast.success('Kill switch reset');
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reset kill switch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseAllTrades = async () => {
    if (!confirm('Close all open trades?')) return;
    setIsLoading(true);
    try {
      await tradeAPI.closeAll('Manual close by admin');
      toast.success('All trades closed');
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to close trades');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableLive = async (enable: boolean) => {
    if (enable && !liveEnvAllowed) {
      toast.error('Live trading is blocked by ALLOW_LIVE_TRADING=false');
      return;
    }

    setIsLoading(true);
    try {
      await adminAPI.enableLive(enable);
      toast.success(`Live trading ${enable ? 'enabled' : 'disabled'}`);
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to toggle live trading');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStatusPill = (ok: boolean | undefined, label?: string) => (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(ok)}`}>
      {label || (ok === true ? 'Healthy' : ok === false ? 'Issue' : 'Unknown')}
    </span>
  );

  return (
    <div className="page-container">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="page-kicker">Governance Console</p>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-copy">
            Live operational state from backend config, environment flags, health checks, broker status, and account records.
          </p>
        </div>
        <button onClick={fetchData} disabled={isLoading} className="btn-secondary w-fit">
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {config?.killSwitchTriggered && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 animate-pulse-red">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <div>
              <p className="text-lg font-bold text-red-400">KILL SWITCH ACTIVE</p>
              <p className="text-sm text-red-300/80">
                Reason: {config.killSwitchReason || 'Not recorded'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!!loadErrors.length && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Some live checks are unavailable</p>
              <p className="mt-1 text-xs text-amber-200/80">
                {loadErrors.map((err) => `${err.source}: ${err.message}`).join(' | ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {statusCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
                </div>
                <div className={`rounded-lg border p-2 ${statusTone(card.ok)}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-white/[0.06] pb-1">
        {[
          { id: 'status', label: 'Live Status', icon: Activity },
          { id: 'mode', label: 'Trading Mode', icon: Power },
          { id: 'risk', label: 'Risk Config', icon: Settings },
          { id: 'logs', label: 'Audit Logs', icon: FileText },
          { id: 'users', label: 'Users', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-400 bg-blue-500/5 text-blue-400'
                  : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {activeTab === 'status' && (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="surface p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Environment</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {runtime?.env ? Object.entries({
                  TRADING_MODE: runtime.env.tradingMode || 'Not set',
                  ALLOW_LIVE_TRADING: runtime.env.allowLiveTrading,
                  AI_ENABLED: runtime.env.aiEnabled,
                  RULE_BASED_TRADING: runtime.env.ruleBasedTrading,
                  STRATEGY_MODE: runtime.env.strategyMode,
                  DEFAULT_STRATEGY: runtime.env.defaultStrategy,
                  WATCHLIST_MODE: runtime.env.watchlistMode,
                  ENABLE_SCHEDULER: runtime.env.enableScheduler,
                  ENABLE_MARKET_SYNC: runtime.env.enableMarketSync,
                  ENABLE_CANDLE_SYNC: runtime.env.enableCandleSync,
                  DHAN_CLIENT_ID: runtime.env.dhanClientConfigured ? 'Configured' : 'Missing',
                  DHAN_ACCESS_TOKEN: runtime.env.dhanAccessTokenConfigured ? 'Configured' : 'Missing',
                }).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs text-slate-500">{key}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatValue(value)}</p>
                  </div>
                )) : (
                  <p className="text-sm text-slate-500">Runtime environment unavailable.</p>
                )}
              </div>
            </div>

            <div className="surface p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Account & Trading</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Broker', runtime?.account?.broker],
                  ['Account Type', runtime?.account?.accountType],
                  ['Connection', runtime?.account?.isConnected ? 'Connected' : 'Disconnected'],
                  ['Health', runtime?.account?.healthCheckStatus],
                  ['Token Status', runtime?.account?.tokenStatus],
                  ['Open Paper Trades', runtime?.trading.openPaperTrades],
                  ['Pending Paper Trades', runtime?.trading.pendingPaperTrades],
                  ['Today P&L', formatMoney(runtime?.trading.todayPnl)],
                  ['Paper Days', runtime?.account?.paperTradingDays],
                  ['Paper Return', runtime?.account?.paperTotalReturn !== undefined ? `${runtime.account.paperTotalReturn}%` : undefined],
                ].map(([key, value]) => (
                  <div key={String(key)} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs text-slate-500">{key}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatValue(value)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface overflow-hidden xl:col-span-2">
              <div className="border-b border-white/[0.06] px-6 py-4">
                <h3 className="text-lg font-semibold text-white">API Components</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="table-header px-6 py-3">Component</th>
                      <th className="table-header px-6 py-3">Status</th>
                      <th className="table-header px-6 py-3">Latency</th>
                      <th className="table-header px-6 py-3">Last Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(apiHealth?.components || runtime?.systemHealth || []).map((health: SystemHealth) => (
                      <tr key={`${health.component}-${health.lastChecked || ''}`} className="border-b border-white/[0.04]">
                        <td className="table-cell px-6 font-medium text-white">{health.component}</td>
                        <td className="table-cell px-6">{renderStatusPill(health.status === 'healthy', health.status)}</td>
                        <td className="table-cell px-6 text-slate-400">{health.latency !== undefined ? `${health.latency}ms` : 'Unavailable'}</td>
                        <td className="table-cell px-6 text-slate-500">
                          {health.lastChecked ? new Date(health.lastChecked).toLocaleString() : 'Unavailable'}
                        </td>
                      </tr>
                    ))}
                    {!(apiHealth?.components || runtime?.systemHealth || []).length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-sm text-slate-500">No health records returned.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mode' && (
          <div className="space-y-6">
            <div className="surface p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Trading Mode Control</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {tradingModes.map((mode) => {
                  const style = modeStyles[mode];
                  const isLiveMode = mode === 'LIVE_MANUAL' || mode === 'LIVE_AUTO';
                  const disabled = isLoading || !canAdminWrite || (isLiveMode && !liveEnvAllowed) || (mode === 'LIVE_AUTO' && !liveAutoAllowed);
                  const isActive = effectiveMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => handleModeChange(mode)}
                      disabled={disabled}
                      className={`rounded-xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isActive
                          ? `${style.bg} ${style.border} ring-1 ring-blue-500/30`
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-sm font-semibold ${isActive ? style.text : 'text-slate-300'}`}>
                          {style.label}
                        </span>
                        {isActive && <CheckCircle2 className={`h-4 w-4 ${style.text}`} />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {isLiveMode && !liveEnvAllowed ? 'Blocked by ALLOW_LIVE_TRADING=false' :
                          mode === 'LIVE_AUTO' && !liveAutoAllowed ? 'Blocked by ENABLE_LIVE_AUTO=false' :
                            mode === 'PAPER' ? 'Paper execution only' :
                              mode === 'LEARNING' ? 'Analysis only' : 'Admin gated'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="surface p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Live Trading Gate</h3>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    {renderStatusPill(config?.isLiveTradingEnabled === true, config?.isLiveTradingEnabled ? 'Config Enabled' : 'Config Disabled')}
                    <p className="mt-2 text-xs text-slate-500">
                      Env gate: {runtime?.env.allowLiveTrading ? 'ALLOW_LIVE_TRADING=true' : 'ALLOW_LIVE_TRADING=false'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleEnableLive(!config?.isLiveTradingEnabled)}
                    disabled={isLoading || !canAdminWrite || (!config?.isLiveTradingEnabled && !liveEnvAllowed)}
                    className={`btn-${config?.isLiveTradingEnabled ? 'secondary' : 'primary'}`}
                  >
                    {config?.isLiveTradingEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              <div className="surface p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Emergency Actions</h3>
                <div className="space-y-3">
                  <button onClick={handleKillSwitch} disabled={isLoading || !canAdminWrite || config?.killSwitchTriggered} className="btn-danger w-full">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Activate Kill Switch
                  </button>
                  {config?.killSwitchTriggered && (
                    <button onClick={handleResetKillSwitch} disabled={isLoading || !canAdminWrite} className="btn-secondary w-full">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset Kill Switch
                    </button>
                  )}
                  <button onClick={handleCloseAllTrades} disabled={isLoading || !canAdminWrite} className="btn-secondary w-full">
                    <XCircle className="mr-2 h-4 w-4" />
                    Close All Trades
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="surface p-6">
            <h3 className="mb-6 text-lg font-semibold text-white">Risk Configuration</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Risk Per Trade', value: config?.riskPerTradePercent, unit: '%' },
                { label: 'Daily Max Loss', value: config?.dailyMaxLossPercent, unit: '%' },
                { label: 'Max Open Trades', value: config?.maxOpenTrades, unit: '' },
                { label: 'Min Risk-Reward', value: config?.minRiskReward, unit: ':1', prefix: '1:' },
                { label: 'Max Drawdown', value: config?.maxDrawdownPercent, unit: '%' },
                { label: 'Confidence Threshold', value: config?.minConfidenceScore, unit: '%' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {item.value === undefined || item.value === null ? 'Unavailable' : `${item.prefix || ''}${item.value}${item.unit}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="surface overflow-hidden">
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h3 className="text-lg font-semibold text-white">Recent Audit Logs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="table-header px-6 py-3">Time</th>
                    <th className="table-header px-6 py-3">Action</th>
                    <th className="table-header px-6 py-3">User</th>
                    <th className="table-header px-6 py-3">Severity</th>
                    <th className="table-header px-6 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 20).map((log: any) => {
                    const severity = String(log.severity || 'INFO').toLowerCase();
                    return (
                      <tr key={log.id || log._id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="table-cell px-6">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="table-cell px-6">
                          <span className={`badge ${
                            severity === 'critical' ? 'border-red-500/20 bg-red-500/10 text-red-400' :
                              severity === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
                                'border-blue-500/20 bg-blue-500/10 text-blue-400'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="table-cell px-6 text-slate-400">{log.userEmail || log.userId?.email || 'System'}</td>
                        <td className="table-cell px-6 capitalize text-slate-300">{severity}</td>
                        <td className="table-cell max-w-xs truncate px-6 text-xs text-slate-500">{JSON.stringify(log.details || {})}</td>
                      </tr>
                    );
                  })}
                  {!auditLogs.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">No audit logs returned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && canAdminWrite && (
          <div className="surface overflow-hidden">
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h3 className="text-lg font-semibold text-white">Users</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="table-header px-6 py-3">Name</th>
                    <th className="table-header px-6 py-3">Email</th>
                    <th className="table-header px-6 py-3">Role</th>
                    <th className="table-header px-6 py-3">Status</th>
                    <th className="table-header px-6 py-3">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id || u._id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="table-cell px-6 font-medium text-white">{u.name || 'Unnamed'}</td>
                      <td className="table-cell px-6 text-slate-400">{u.email}</td>
                      <td className="table-cell px-6">
                        <span className="badge border-blue-500/20 bg-blue-500/10 text-blue-400">{u.role}</span>
                      </td>
                      <td className="table-cell px-6">
                        <span className={`flex items-center gap-1.5 text-xs ${u.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                          <span className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell px-6 text-slate-500">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">No users returned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && !canAdminWrite && (
          <div className="surface p-6 text-sm text-slate-400">User management requires admin access.</div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-4 w-4" />
          Last runtime refresh: {runtime?.timestamp ? new Date(runtime.timestamp).toLocaleString() : 'Unavailable'}
        </div>
      </div>
    </div>
  );
}
