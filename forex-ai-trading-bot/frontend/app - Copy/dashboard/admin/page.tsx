'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Shield, AlertTriangle, Power, PowerOff, Settings, Users,
  Activity, Lock, Unlock, TrendingUp, TrendingDown
} from 'lucide-react';
import { adminAPI, tradeAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [config, setConfig] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [riskLogs, setRiskLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchData = useCallback(async () => {
    try {
      const [configRes, auditRes, riskRes, usersRes] = await Promise.all([
        adminAPI.getConfig(),
        adminAPI.getAuditLogs(),
        adminAPI.getRiskLogs(),
        adminAPI.getUsers()
      ]);
      setConfig(configRes.data.config);
      setAuditLogs(auditRes.data.logs);
      setRiskLogs(riskRes.data.logs);
      setUsers(usersRes.data.users);
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

  const handleModeChange = async (mode: string) => {
    setIsLoading(true);
    try {
      await adminAPI.setMode(mode);
      toast.success(`Mode changed to ${mode}`);
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

  return (
    <>
        <section className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
          <div className="page-kicker">Governance console</div>
          <h2 className="page-title">Admin Panel</h2>
          <p className="page-copy">Control trading mode, emergency actions, risk configuration, audit trails, and user access.</p>
          </div>
          {config?.killSwitchTriggered && (
            <Badge variant="danger" className="animate-pulse">KILL SWITCH ACTIVE</Badge>
          )}
        </section>

        {config?.killSwitchTriggered && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-lg font-bold">EMERGENCY KILL SWITCH ACTIVE</AlertTitle>
            <AlertDescription>
              Reason: {config.killSwitchReason}. All trading has been halted. Review before resetting.
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={handleResetKillSwitch} disabled={isLoading}>
                  <Unlock className="w-4 h-4 mr-2" />
                  Reset Kill Switch (Admin Only)
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card className="surface rounded-lg mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Trading Mode Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {['LEARNING', 'PAPER', 'DEMO', 'HUMAN_APPROVAL', 'LIVE_AUTO'].map((mode) => (
                <Button
                  key={mode}
                  variant={config?.mode === mode ? 'default' : 'outline'}
                  className={config?.mode === mode ? 'ring-2 ring-blue-400' : ''}
                  onClick={() => handleModeChange(mode)}
                  disabled={isLoading || config?.killSwitchTriggered}
                >
                  {mode === 'LIVE_AUTO' && <AlertTriangle className="w-4 h-4 mr-1" />}
                  {mode.replace('_', ' ')}
                </Button>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Live Trading</span>
                  <Badge variant={config?.isLiveTradingEnabled ? 'success' : 'secondary'}>
                    {config?.isLiveTradingEnabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleEnableLive(true)}
                    disabled={isLoading || config?.isLiveTradingEnabled}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Enable Live
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleEnableLive(false)}
                    disabled={isLoading || !config?.isLiveTradingEnabled}
                  >
                    <Unlock className="w-4 h-4 mr-2" />
                    Disable Live
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface rounded-lg mb-8 border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Emergency Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Button
              variant="danger"
              size="lg"
              onClick={handleKillSwitch}
              disabled={isLoading || config?.killSwitchTriggered}
            >
              <PowerOff className="w-5 h-5 mr-2" />
              ACTIVATE KILL SWITCH
            </Button>
            <Button
              variant="warning"
              size="lg"
              onClick={handleCloseAllTrades}
              disabled={isLoading}
            >
              <TrendingDown className="w-5 h-5 mr-2" />
              Close All Trades
            </Button>
          </CardContent>
        </Card>

        <Card className="surface rounded-lg mb-8">
          <CardHeader>
            <CardTitle className="text-white">Risk Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm text-slate-400">Risk Per Trade</label>
                <div className="text-xl font-bold text-white">{config?.riskPerTradePercent || 0.5}%</div>
                <Progress value={config?.riskPerTradePercent || 0.5} max={2} variant="warning" />
              </div>
              <div>
                <label className="text-sm text-slate-400">Daily Max Loss</label>
                <div className="text-xl font-bold text-white">{config?.dailyMaxLossPercent || 2}%</div>
                <Progress value={config?.dailyMaxLossPercent || 2} max={5} variant="danger" />
              </div>
              <div>
                <label className="text-sm text-slate-400">Max Open Trades</label>
                <div className="text-xl font-bold text-white">{config?.maxOpenTrades || 3}</div>
              </div>
              <div>
                <label className="text-sm text-slate-400">Min Risk-Reward</label>
                <div className="text-xl font-bold text-white">1:{config?.minRiskReward || 2}</div>
              </div>
              <div>
                <label className="text-sm text-slate-400">Max Drawdown</label>
                <div className="text-xl font-bold text-white">{config?.maxDrawdownPercent || 10}%</div>
              </div>
              <div>
                <label className="text-sm text-slate-400">Confidence Threshold</label>
                <div className="text-xl font-bold text-white">{config?.minConfidenceScore || 65}%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface rounded-lg mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Audit Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.slice(0, 10).map((log) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-slate-400 text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.severity === 'CRITICAL' ? 'danger' : log.severity === 'WARNING' ? 'warning' : 'default'}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{log.userEmail}</TableCell>
                    <TableCell>
                      <Badge variant={log.severity === 'CRITICAL' ? 'danger' : log.severity === 'WARNING' ? 'warning' : 'info'}>
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </TableCell>
                  </TableRow>
                ))}
                {!auditLogs.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {user?.role === 'admin' && (
          <Card className="surface rounded-lg">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u._id}>
                      <TableCell className="text-white">{u.name}</TableCell>
                      <TableCell className="text-slate-400">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'subadmin' ? 'warning' : 'default'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? 'success' : 'secondary'}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!users.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
    </>
  );
}
