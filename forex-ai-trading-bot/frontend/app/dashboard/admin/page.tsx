'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { adminAPI, tradeAPI } from '@/lib/api';
import { RiskConfig, AuditLog, User, TradingMode } from '@/types';
import {
  Shield,
  AlertTriangle,
  Power,
  Settings,
  Users,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';

const tradingModes: TradingMode[] = ['LEARNING', 'PAPER', 'DEMO', 'HUMAN_APPROVAL', 'LIVE_AUTO'];

const modeStyles: Record<TradingMode, { bg: string; text: string; border: string; label: string }> = {
  LEARNING: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', label: 'Learning' },
  PAPER: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Paper Trading' },
  DEMO: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', label: 'Demo' },
  HUMAN_APPROVAL: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Human Approval' },
  LIVE_AUTO: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', label: 'Live Auto' },
};

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'mode' | 'risk' | 'logs' | 'users'>('mode');

  const fetchData = useCallback(async () => {
    try {
      const [configRes, auditRes, usersRes] = await Promise.all([
        adminAPI.getConfig(),
        adminAPI.getAuditLogs(),
        adminAPI.getUsers(),
      ]);
      setConfig(configRes.data.config);
      setAuditLogs(auditRes.data.logs || []);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      toast.error('Failed to fetch admin data');
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'subadmin') {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [fetchData, router, user]);

  const handleModeChange = async (mode: TradingMode) => {
    setIsLoading(true);
    try {
      await adminAPI.setMode(mode);
      toast.success(`Mode changed to ${modeLabel(mode)}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to change mode');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!confirm('Are you sure you want to activate the KILL SWITCH? This will close ALL trades immediately.')) {
      return;
    }
    setIsLoading(true);
    try {
      await adminAPI.triggerKillSwitch('Manual activation by admin');
      toast.success('Kill switch activated');
      fetchData();
    } catch (error) {
      toast.error('Failed to activate kill switch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetKillSwitch = async () => {
    setIsLoading(true);
    try {
      await adminAPI.resetKillSwitch();
      toast.success('Kill switch reset');
      fetchData();
    } catch (error) {
      toast.error('Failed to reset kill switch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseAllTrades = async () => {
    if (!confirm('Close ALL open trades?')) return;
    try {
      await tradeAPI.closeAll('Manual close by admin');
      toast.success('All trades closed');
    } catch (error) {
      toast.error('Failed to close trades');
    }
  };

  const handleEnableLive = async (enable: boolean) => {
    setIsLoading(true);
    try {
      await adminAPI.enableLive(enable);
      toast.success(`Live trading ${enable ? 'enabled' : 'disabled'}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to toggle live trading');
    } finally {
      setIsLoading(false);
    }
  };

  const modeLabel = (mode: TradingMode) => modeStyles[mode].label;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <p className="page-kicker">Governance Console</p>
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-copy">
          Control trading mode, emergency actions, risk configuration, audit trails, and user access.
        </p>
      </div>

      {/* Kill Switch Alert */}
      {config?.killSwitchTriggered && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 animate-pulse-red">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <div>
              <p className="text-lg font-bold text-red-400">KILL SWITCH ACTIVE</p>
              <p className="text-sm text-red-300/80">
                Reason: {config.killSwitchReason}. All trading has been halted. Review before resetting.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/[0.06] pb-1">
        {[
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
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all rounded-t-lg ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Trading Mode Control */}
        {activeTab === 'mode' && (
          <div className="space-y-6">
            <div className="surface p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Trading Mode Control</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tradingModes.map((mode) => {
                  const style = modeStyles[mode];
                  const isActive = config && config.isLiveTradingEnabled ? mode === 'LIVE_AUTO' : mode === (config?.currentMode || 'LEARNING');
                  return (
                    <button
                      key={mode}
                      onClick={() => handleModeChange(mode)}
                      disabled={isLoading}
                      className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                        isActive
                          ? `${style.bg} ${style.border} ring-1 ring-${style.text.split('-')[1]}-500/30`
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${isActive ? style.text : 'text-slate-300'}`}>
                          {style.label}
                        </span>
                        {isActive && <CheckCircle2 className={`h-4 w-4 ${style.text}`} />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {mode === 'LEARNING' && 'Observe only, no orders'}
                        {mode === 'PAPER' && 'Simulate orders & P&L'}
                        {mode === 'DEMO' && 'Demo environment'}
                        {mode === 'HUMAN_APPROVAL' && 'Require manual approval'}
                        {mode === 'LIVE_AUTO' && 'Guarded live execution'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="surface p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Live Trading</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${config?.isLiveTradingEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {config?.isLiveTradingEnabled ? 'ENABLED' : 'DISABLED'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {config?.isLiveTradingEnabled ? 'Live orders will be executed' : 'Only paper/demo trading allowed'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleEnableLive(!config?.isLiveTradingEnabled)}
                    disabled={isLoading}
                    className={`btn-${config?.isLiveTradingEnabled ? 'secondary' : 'primary'}`}
                  >
                    {config?.isLiveTradingEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              <div className="surface p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Emergency Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={handleKillSwitch}
                    disabled={isLoading || config?.killSwitchTriggered}
                    className="btn-danger w-full"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Activate Kill Switch
                  </button>
                  {config?.killSwitchTriggered && (
                    <button
                      onClick={handleResetKillSwitch}
                      disabled={isLoading}
                      className="btn-secondary w-full"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset Kill Switch
                    </button>
                  )}
                  <button
                    onClick={handleCloseAllTrades}
                    className="btn-secondary w-full"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Close All Trades
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Configuration */}
        {activeTab === 'risk' && (
          <div className="surface p-6">
            <h3 className="mb-6 text-lg font-semibold text-white">Risk Configuration</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Risk Per Trade', value: config?.riskPerTradePercent || 0.5, unit: '%', key: 'riskPerTradePercent' },
                { label: 'Daily Max Loss', value: config?.dailyMaxLossPercent || 2, unit: '%', key: 'dailyMaxLossPercent' },
                { label: 'Max Open Trades', value: config?.maxOpenTrades || 3, unit: '', key: 'maxOpenTrades' },
                { label: 'Min Risk-Reward', value: config?.minRiskReward || 2, unit: ':1', key: 'minRiskReward', prefix: '1:' },
                { label: 'Max Drawdown', value: config?.maxDrawdownPercent || 10, unit: '%', key: 'maxDrawdownPercent' },
                { label: 'Confidence Threshold', value: config?.minConfidenceScore || 65, unit: '%', key: 'minConfidenceScore' },
              ].map((item) => (
                <div key={item.key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {item.prefix || ''}{item.value}{item.unit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Logs */}
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
                  {auditLogs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="table-cell px-6">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="table-cell px-6">
                        <span className={`badge ${
                          log.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          log.severity === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="table-cell px-6 text-slate-400">{log.userEmail}</td>
                      <td className="table-cell px-6">
                        <span className={`capitalize ${
                          log.severity === 'critical' ? 'text-red-400' :
                          log.severity === 'warning' ? 'text-amber-400' :
                          'text-blue-400'
                        }`}>
                          {log.severity}
                        </span>
                      </td>
                      <td className="table-cell px-6 text-xs text-slate-500 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                  {!auditLogs.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No audit logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === 'users' && user?.role === 'admin' && (
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
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="table-cell px-6 font-medium text-white">{u.name}</td>
                      <td className="table-cell px-6 text-slate-400">{u.email}</td>
                      <td className="table-cell px-6">
                        <span className={`badge ${
                          u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          u.role === 'subadmin' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="table-cell px-6">
                        <span className={`flex items-center gap-1.5 text-xs ${u.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                          <div className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
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
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
