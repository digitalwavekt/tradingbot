'use client';

import { useState, useEffect } from 'react';
import { backtestAPI } from '@/lib/api';
import { BacktestResult } from '@/types';
import {
  TestTube,
  Play,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function BacktestPage() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [formData, setFormData] = useState({
    strategy: 'EMA_CROSSOVER',
    symbol: 'RELIANCE',
    startDate: '',
    endDate: '',
    initialCapital: 100000,
  });

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await backtestAPI.getResults();
      setResults(response.data.results || []);
    } catch (error) {
      // Silent fail
    }
  };

  const handleRunBacktest = async () => {
    if (!formData.startDate || !formData.endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    setIsRunning(true);
    try {
      await backtestAPI.run(formData);
      toast.success('Backtest started successfully');
      fetchResults();
    } catch (error) {
      toast.error('Failed to run backtest');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <p className="page-kicker">Strategy Validation</p>
        <h1 className="page-title">Backtesting Engine</h1>
        <p className="page-copy">
          Test your strategies against historical data to validate performance before live deployment.
        </p>
      </div>

      {/* Backtest Form */}
      <div className="mb-8 surface p-6">
        <div className="flex items-center gap-3 mb-6">
          <TestTube className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Run New Backtest</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="soft-label">Strategy</label>
            <select
              value={formData.strategy}
              onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}
              className="soft-input"
            >
              <option value="EMA_CROSSOVER">EMA Crossover</option>
              <option value="RSI">RSI Strategy</option>
              <option value="VWAP">VWAP</option>
              <option value="ORB">Opening Range Breakout</option>
              <option value="VOLUME_BREAKOUT">Volume Breakout</option>
            </select>
          </div>

          <div>
            <label className="soft-label">Symbol</label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
              className="soft-input"
              placeholder="RELIANCE"
            />
          </div>

          <div>
            <label className="soft-label">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="soft-input"
            />
          </div>

          <div>
            <label className="soft-label">End Date</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="soft-input"
            />
          </div>
        </div>

        <div className="mt-4 flex items-end gap-4">
          <div className="flex-1">
            <label className="soft-label">Initial Capital (₹)</label>
            <input
              type="number"
              value={formData.initialCapital}
              onChange={(e) => setFormData({ ...formData, initialCapital: Number(e.target.value) })}
              className="soft-input"
              min="10000"
              step="10000"
            />
          </div>
          <button
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="btn-primary h-11"
          >
            {isRunning ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running...
              </div>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Backtest
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Backtest Results</h3>
        <div className="space-y-4">
          {results.map((result) => (
            <div key={result.id} className="surface p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    result.totalReturn >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
                  }`}>
                    {result.totalReturn >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-white">{result.strategy}</h4>
                    <p className="text-sm text-slate-400">{result.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${
                    result.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {result.totalReturn >= 0 ? '+' : ''}{result.totalReturn.toFixed(2)}%
                  </p>
                  <p className="text-xs text-slate-500">Total Return</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <DollarSign className="h-3 w-3" />
                    Initial Capital
                  </div>
                  <p className="text-lg font-semibold text-white">₹{result.initialCapital.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Target className="h-3 w-3" />
                    Final Capital
                  </div>
                  <p className="text-lg font-semibold text-white">₹{result.finalCapital.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Total Trades
                  </div>
                  <p className="text-lg font-semibold text-white">{result.totalTrades}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <TrendingDown className="h-3 w-3" />
                    Max Drawdown
                  </div>
                  <p className="text-lg font-semibold text-red-400">{result.maxDrawdown.toFixed(2)}%</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Target className="h-3 w-3" />
                    Win Rate
                  </div>
                  <p className="text-lg font-semibold text-white">{result.winRate.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Profit Factor
                  </div>
                  <p className="text-lg font-semibold text-white">{result.profitFactor.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Calendar className="h-3 w-3" />
                    Period
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {new Date(result.startDate).toLocaleDateString()} - {new Date(result.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {!results.length && (
            <div className="surface p-8 text-center">
              <TestTube className="mx-auto mb-3 h-12 w-12 text-slate-600" />
              <p className="text-slate-400">No backtest results yet.</p>
              <p className="text-sm text-slate-600 mt-1">Run your first backtest to see results here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
