'use client';

import { useState, useEffect } from 'react';
import { signalAPI } from '@/lib/api';
import { Signal } from '@/types';
import {
  Signal as SignalIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Brain,
  AlertTriangle,
  Clock,
  Target,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [pendingSignals, setPendingSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [analyzeSymbol, setAnalyzeSymbol] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchSignals = async () => {
    try {
      const [signalsRes, pendingRes] = await Promise.all([
        signalAPI.getSignals(),
        signalAPI.getPendingApproval(),
      ]);
      setSignals(signalsRes.data.signals || []);
      setPendingSignals(pendingRes.data.signals || []);
    } catch (error) {
      // Silent fail for auto-refresh
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeSymbol.trim()) {
      toast.error('Please enter a symbol');
      return;
    }
    setIsAnalyzing(true);
    try {
      await signalAPI.analyze(analyzeSymbol.toUpperCase());
      toast.success(`Analysis started for ${analyzeSymbol.toUpperCase()}`);
      setAnalyzeSymbol('');
      fetchSignals();
    } catch (error) {
      toast.error('Failed to analyze symbol');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApprove = async (signalId: string) => {
    setIsLoading(true);
    try {
      await signalAPI.approve(signalId);
      toast.success('Signal approved');
      fetchSignals();
    } catch (error) {
      toast.error('Failed to approve signal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (signalId: string) => {
    setIsLoading(true);
    try {
      await signalAPI.reject(signalId, 'Manually rejected by user');
      toast.success('Signal rejected');
      fetchSignals();
    } catch (error) {
      toast.error('Failed to reject signal');
    } finally {
      setIsLoading(false);
    }
  };

  const getBiasIcon = (bias: string) => {
    switch (bias) {
      case 'BULLISH':
        return <TrendingUp className="h-5 w-5 text-emerald-400" />;
      case 'BEARISH':
        return <TrendingDown className="h-5 w-5 text-red-400" />;
      default:
        return <Minus className="h-5 w-5 text-slate-400" />;
    }
  };

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'BULLISH':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'BEARISH':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'REJECTED':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'EXECUTED':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <p className="page-kicker">Signal Intelligence</p>
        <h1 className="page-title">Signal Center</h1>
        <p className="page-copy">
          AI-generated trading signals with confidence scores, risk analysis, and manual approval workflow.
        </p>
      </div>

      {/* Analyze Input */}
      <div className="mb-6 surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">AI Market Analysis</h3>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={analyzeSymbol}
            onChange={(e) => setAnalyzeSymbol(e.target.value)}
            placeholder="Enter symbol (e.g., RELIANCE, NIFTY50)"
            className="soft-input flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="btn-primary"
          >
            {isAnalyzing ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Analyzing...
              </div>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Analyze
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingSignals.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Pending Approval ({pendingSignals.length})
          </h3>
          <div className="grid gap-4">
            {pendingSignals.map((signal) => (
              <div key={signal.id} className="surface p-5 border-l-4 border-l-amber-500">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getBiasIcon(signal.bias)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">{signal.symbol}</span>
                        <span className={`badge border ${getBiasColor(signal.bias)}`}>
                          {signal.bias}
                        </span>
                        <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {signal.confidence}% Confidence
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{signal.reasoning}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(signal.id)}
                      disabled={isLoading}
                      className="btn-primary"
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(signal.id)}
                      disabled={isLoading}
                      className="btn-secondary"
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </div>
                {signal.suggestedSetup && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Entry</p>
                      <p className="text-lg font-semibold text-white">₹{signal.suggestedSetup.entry}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Stop Loss</p>
                      <p className="text-lg font-semibold text-red-400">₹{signal.suggestedSetup.stopLoss}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Target</p>
                      <p className="text-lg font-semibold text-emerald-400">₹{signal.suggestedSetup.target}</p>
                    </div>
                  </div>
                )}
                {signal.riskNotes && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
                    <p className="text-sm text-amber-300/80">{signal.riskNotes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Signals */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Signal History</h3>
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="table-header px-6 py-3">Symbol</th>
                  <th className="table-header px-6 py-3">Bias</th>
                  <th className="table-header px-6 py-3">Confidence</th>
                  <th className="table-header px-6 py-3">Setup</th>
                  <th className="table-header px-6 py-3">Status</th>
                  <th className="table-header px-6 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => (
                  <tr key={signal.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="table-cell px-6">
                      <div className="flex items-center gap-2">
                        {getBiasIcon(signal.bias)}
                        <span className="font-medium text-white">{signal.symbol}</span>
                      </div>
                    </td>
                    <td className="table-cell px-6">
                      <span className={`badge border ${getBiasColor(signal.bias)}`}>
                        {signal.bias}
                      </span>
                    </td>
                    <td className="table-cell px-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-white/[0.1]">
                          <div
                            className={`h-full rounded-full ${
                              signal.confidence >= 70 ? 'bg-emerald-500' :
                              signal.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-400">{signal.confidence}%</span>
                      </div>
                    </td>
                    <td className="table-cell px-6">
                      {signal.suggestedSetup ? (
                        <div className="text-xs text-slate-400">
                          <span className="text-white">₹{signal.suggestedSetup.entry}</span>
                          <span className="mx-1">→</span>
                          <span className="text-emerald-400">₹{signal.suggestedSetup.target}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">No setup</span>
                      )}
                    </td>
                    <td className="table-cell px-6">
                      <span className={`badge border ${getStatusBadge(signal.status)}`}>
                        {signal.status}
                      </span>
                    </td>
                    <td className="table-cell px-6 text-slate-500">
                      {new Date(signal.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!signals.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      <SignalIcon className="mx-auto mb-2 h-8 w-8" />
                      No signals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
