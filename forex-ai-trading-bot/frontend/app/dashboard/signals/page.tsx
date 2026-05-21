'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { signalAPI } from '@/lib/api';
import { Signal } from '@/types';
import { Check, X, Zap, Brain } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchSignals();
  }, []);

  const fetchSignals = async () => {
    try {
      const response = await signalAPI.getSignals();
      setSignals(response.data.signals);
    } catch (error) {
      toast.error('Failed to fetch signals');
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
      await signalAPI.reject(signalId, 'Manually rejected');
      toast.success('Signal rejected');
      fetchSignals();
    } catch (error) {
      toast.error('Failed to reject signal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async (pair: string) => {
    setIsLoading(true);
    try {
      const response = await signalAPI.analyze(pair);
      toast.success(`Analysis complete: ${response.data.decision}`);
      fetchSignals();
    } catch (error) {
      toast.error('Analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
        <section className="mb-6">
          <div className="page-kicker">Signal review</div>
          <h2 className="page-title">Trading Signals</h2>
          <p className="page-copy">Run analysis, inspect confidence, and approve only the signals that pass your risk workflow.</p>
        </section>

        <Card className="surface rounded-lg mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Manual Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'].map((pair) => (
                <Button
                  key={pair}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAnalyze(pair)}
                  disabled={isLoading}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Analyze {pair}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="surface rounded-lg">
          <CardHeader>
            <CardTitle className="text-white">Signal History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry / SL / TP</TableHead>
                  <TableHead>RR</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Reasoning</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => (
                  <TableRow key={signal.signalId}>
                    <TableCell className="text-slate-400 text-xs">
                      {new Date(signal.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-white font-medium">{signal.pair}</TableCell>
                    <TableCell>
                      <Badge variant={
                        signal.direction === 'BUY' ? 'success' :
                        signal.direction === 'SELL' ? 'danger' :
                        signal.direction === 'WAIT' ? 'warning' : 'secondary'
                      }>
                        {signal.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">
                      <div>E: {signal.entryPrice}</div>
                      <div>SL: {signal.stopLoss}</div>
                      <div>TP: {signal.takeProfit}</div>
                    </TableCell>
                    <TableCell className="text-white">1:{signal.riskReward}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${signal.confidence >= 70 ? 'bg-emerald-500' : signal.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{signal.confidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        signal.status === 'EXECUTED' ? 'success' :
                        signal.status === 'APPROVED' ? 'info' :
                        signal.status === 'REJECTED' ? 'danger' :
                        signal.status === 'PENDING' ? 'warning' : 'secondary'
                      }>
                        {signal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs max-w-xs">
                      {signal.aiAnalysis?.marketSummary?.substring(0, 60) || 'N/A'}...
                    </TableCell>
                    <TableCell>
                      {signal.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleApprove(signal.signalId)}
                            disabled={isLoading}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleReject(signal.signalId)}
                            disabled={isLoading}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!signals.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                      No signals found.
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
