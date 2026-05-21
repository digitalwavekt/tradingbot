'use client';

import { useState, useEffect } from 'react';
import { tradeAPI } from '@/lib/api';
import { Trade, Performance } from '@/types';
import {
  History,
  TrendingUp,
  TrendingDown,
  X,
  Trophy,
  Target,
  BarChart3,
  DollarSign,
  Activity,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchTrades();
    fetchPerformance();
  }, []);

  const fetchTrades = async () => {
    try {
      const response = await tradeAPI.getTrades();
      setTrades(response.data.trades || []);
    } catch (error) {
      toast.error('Failed to fetch trades');
    }
  };

  const fetchPerformance = async () => {
    try {
      const response = await tradeAPI.getPerformance();
      setPerformance(response.data);
    } catch (error) {
      // Silent fail
    }
  };

  const handleCloseTrade = async (tradeId: string) => {
    if (!confirm('Close this trade?')) return;
    setIsLoading(true);
    try {
      await tradeAPI.closeTrade(tradeId, 'Manual close');
      toast.success('Trade closed');
      fetchTrades();
      fetchPerformance();
    } catch (error) {
      toast.error('Failed to close trade');
    } finally {
      setIsLoading(false);
    }
  };

  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <p className="page-kicker">Execution Ledger</p>
        <h1 className="page-title">Trade History</h1>
        <p className="page-copy">
          Review positions, realized performance, and manual close controls from the same operational record.
        </p>
      </div>

      {/* Performance Cards */}
      {performance && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Total Trades',
              value: performance.totalTrades,
              icon: BarChart3,
              tone: 'text-blue-400',
              bgTone: 'bg-blue-500/10',
            },
            {
              label: 'Win Rate',
              value: `${performance.winRate}%`,
              icon: Trophy,
              tone: performance.winRate >= 50 ? 'text-emerald-400' : 'text-red-400',
              bgTone: performance.winRate >= 50 ? 'bg-emerald-500/10' : 'bg-red-500/10',
            },
            {
              label: 'Profit Factor',
              value: performance.profitFactor,
              icon: Target,
              tone: performance.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400',
              bgTone: performance.profitFactor >= 1.5 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
            },
            {
              label: 'Net P&L',
              value: `${performance.totalPnl >= 0 ? '+' : ''}₹${performance.totalPnl}`,
              icon: DollarSign,
              tone: performance.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
              bgTone: performance.totalPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
            },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="metric-card">
                <div className="metric-label">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${metric.bgTone}`}>
                    <Icon className={`h-4 w-4 ${metric.tone}`} />
                  </div>
                  <span>{metric.label}</span>
                </div>
                <p className={`metric-value ${metric.tone}`}>{metric.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            Open Positions ({openTrades.length})
          </h3>
          <div className="grid gap-4">
            {openTrades.map((trade) => (
              <div
                key={trade.id}
                className={`surface p-5 ${trade.direction === 'BUY' ? 'trade-card-buy' : 'trade-card-sell'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      trade.direction === 'BUY' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}>
                      {trade.direction === 'BUY' ? (
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">{trade.pair}</span>
                        <span className={`badge border ${
                          trade.direction === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {trade.direction}
                        </span>
                        <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {trade.mode}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-slate-400">
                        <span>Entry: ₹{trade.entryPrice}</span>
                        <span>SL: ₹{trade.stopLoss}</span>
                        <span>TP: ₹{trade.takeProfit}</span>
                        <span>Size: {trade.positionSize}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${
                      (trade.monetaryPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {(trade.monetaryPnl || 0) >= 0 ? '+' : ''}₹{trade.monetaryPnl?.toFixed(2) || '0.00'}
                    </p>
                    <button
                      onClick={() => handleCloseTrade(trade.id)}
                      disabled={isLoading}
                      className="mt-2 btn-secondary text-xs"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Trades Table */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">All Trades</h3>
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="table-header px-6 py-3">Pair</th>
                  <th className="table-header px-6 py-3">Direction</th>
                  <th className="table-header px-6 py-3">Entry</th>
                  <th className="table-header px-6 py-3">SL / TP</th>
                  <th className="table-header px-6 py-3">Size</th>
                  <th className="table-header px-6 py-3">P&L</th>
                  <th className="table-header px-6 py-3">Status</th>
                  <th className="table-header px-6 py-3">Mode</th>
                  <th className="table-header px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="table-cell px-6 font-medium text-white">{trade.pair}</td>
                    <td className="table-cell px-6">
                      <span className={`badge border ${
                        trade.direction === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {trade.direction === 'BUY' ? (
                          <TrendingUp className="mr-1 h-3 w-3" />
                        ) : (
                          <TrendingDown className="mr-1 h-3 w-3" />
                        )}
                        {trade.direction}
                      </span>
                    </td>
                    <td className="table-cell px-6">₹{trade.entryPrice}</td>
                    <td className="table-cell px-6 text-xs text-slate-400">
                      <div>SL: ₹{trade.stopLoss}</div>
                      <div>TP: ₹{trade.takeProfit}</div>
                    </td>
                    <td className="table-cell px-6">{trade.positionSize}</td>
                    <td className={`table-cell px-6 font-medium ${
                      (trade.monetaryPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {(trade.monetaryPnl || 0) >= 0 ? '+' : ''}₹{trade.monetaryPnl?.toFixed(2) || '0.00'}
                    </td>
                    <td className="table-cell px-6">
                      <span className={`badge border ${
                        trade.status === 'OPEN'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : trade.status === 'CLOSED'
                          ? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="table-cell px-6">
                      <span className="text-xs text-slate-400">{trade.mode}</span>
                    </td>
                    <td className="table-cell px-6">
                      {trade.status === 'OPEN' && (
                        <button
                          onClick={() => handleCloseTrade(trade.id)}
                          disabled={isLoading}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          <X className="mr-1 h-3 w-3" />
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!trades.length && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                      <History className="mx-auto mb-2 h-8 w-8" />
                      No trades found.
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
