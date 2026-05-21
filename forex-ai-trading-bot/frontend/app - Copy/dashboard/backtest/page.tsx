'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { backtestAPI } from '@/lib/api';
import { BacktestResult } from '@/types';
import { Play, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

const allowedPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD'];
const allowedTimeframes = ['1m', '5m', '15m', '1h', '4h', '1D'];

export default function BacktestPage() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [formData, setFormData] = useState({
    pair: 'EUR/USD',
    timeframe: '1h',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    riskPerTrade: 0.5,
    minRiskReward: 2,
    maxOpenTrades: 3,
  });

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await backtestAPI.getResults();
      setResults(response.data.results);
    } catch (error) {
      toast.error('Failed to fetch backtest results');
    }
  };

  const handleRunBacktest = async () => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);

    if (!allowedPairs.includes(formData.pair) || !allowedTimeframes.includes(formData.timeframe)) {
      toast.error('Invalid pair or timeframe selected');
      return;
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      toast.error('Choose a valid date range');
      return;
    }

    if (formData.riskPerTrade < 0.1 || formData.riskPerTrade > 2) {
      toast.error('Risk per trade must be between 0.1% and 2%');
      return;
    }

    if (formData.minRiskReward < 1 || formData.minRiskReward > 5 || formData.maxOpenTrades < 1 || formData.maxOpenTrades > 10) {
      toast.error('Strategy limits are outside the allowed range');
      return;
    }

    setIsRunning(true);
    try {
      await backtestAPI.run({
        pair: formData.pair,
        timeframe: formData.timeframe,
        startDate: formData.startDate,
        endDate: formData.endDate,
        strategyParams: {
          name: 'EMA Crossover Strategy',
          riskPerTrade: formData.riskPerTrade,
          minRiskReward: formData.minRiskReward,
          maxOpenTrades: formData.maxOpenTrades,
        }
      });
      toast.success('Backtest started');
      setTimeout(fetchResults, 3000);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to start backtest');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
        <section className="mb-6">
          <div className="page-kicker">Strategy lab</div>
          <h2 className="page-title">Backtesting Engine</h2>
          <p className="page-copy">Validate strategy assumptions against historical data before any production workflow.</p>
        </section>

        <Card className="surface rounded-lg mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Play className="w-5 h-5" />
              Run New Backtest
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="soft-label">Pair</label>
                <select
                  value={formData.pair}
                  onChange={(e) => setFormData({ ...formData, pair: e.target.value })}
                  className="soft-input"
                >
                  {allowedPairs.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="soft-label">Timeframe</label>
                <select
                  value={formData.timeframe}
                  onChange={(e) => setFormData({ ...formData, timeframe: e.target.value })}
                  className="soft-input"
                >
                  {allowedTimeframes.map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="soft-label">Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="2"
                  value={formData.riskPerTrade}
                  onChange={(e) => setFormData({ ...formData, riskPerTrade: Number(e.target.value) })}
                  className="soft-input"
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
              <div>
                <label className="soft-label">Min Risk-Reward</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={formData.minRiskReward}
                  onChange={(e) => setFormData({ ...formData, minRiskReward: Number(e.target.value) })}
                  className="soft-input"
                />
              </div>
            </div>
            <Button
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="w-full md:w-auto"
            >
              <Play className="w-4 h-4 mr-2" />
              {isRunning ? 'Running...' : 'Run Backtest'}
            </Button>
          </CardContent>
        </Card>

        <Card className="surface rounded-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Backtest Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Win Rate</TableHead>
                  <TableHead>Profit Factor</TableHead>
                  <TableHead>Net Profit</TableHead>
                  <TableHead>Max DD</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.backtestId}>
                    <TableCell className="text-slate-400 text-xs">
                      {new Date(result.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-white">{result.strategyName}</TableCell>
                    <TableCell className="text-slate-300">{result.pair}</TableCell>
                    <TableCell className="text-white">{result.results?.totalTrades || 0}</TableCell>
                    <TableCell>
                      <span className={`${(result.results?.winRate || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.results?.winRate?.toFixed(1) || 0}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`${(result.results?.profitFactor || 0) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {result.results?.profitFactor?.toFixed(2) || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`${(result.results?.netProfitPercent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(result.results?.netProfitPercent || 0) >= 0 ? '+' : ''}
                        {result.results?.netProfitPercent?.toFixed(2) || 0}%
                      </span>
                    </TableCell>
                    <TableCell className="text-red-400">
                      {result.results?.maxDrawdownPercent?.toFixed(1) || 0}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        result.status === 'COMPLETED' ? 'success' :
                        result.status === 'RUNNING' ? 'warning' :
                        result.status === 'REJECTED' ? 'danger' : 'secondary'
                      }>
                        {result.status}
                      </Badge>
                      {result.validation?.rejected && (
                        <div className="text-xs text-red-400 mt-1">
                          {result.validation.rejectionReasons.join(', ')}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!results.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                      No backtest results yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </>
  );
}
