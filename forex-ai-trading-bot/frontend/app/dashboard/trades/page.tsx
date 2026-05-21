'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { tradeAPI } from '@/lib/api';
import { Trade } from '@/types';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchTrades();
    fetchPerformance();
  }, []);

  const fetchTrades = async () => {
    try {
      const response = await tradeAPI.getTrades();
      setTrades(response.data.trades);
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
    } catch (error) {
      toast.error('Failed to close trade');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
        <section className="mb-6">
          <div className="page-kicker">Execution ledger</div>
          <h2 className="page-title">Trade History</h2>
          <p className="page-copy">Review positions, realized performance, and manual close controls from the same operational record.</p>
        </section>

        {performance && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="surface rounded-lg">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Total Trades</div>
                <div className="text-2xl font-bold text-white">{performance.totalTrades}</div>
              </CardContent>
            </Card>
            <Card className="surface rounded-lg">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Win Rate</div>
                <div className={`text-2xl font-bold ${performance.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {performance.winRate}%
                </div>
              </CardContent>
            </Card>
            <Card className="surface rounded-lg">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Profit Factor</div>
                <div className={`text-2xl font-bold ${performance.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {performance.profitFactor}
                </div>
              </CardContent>
            </Card>
            <Card className="surface rounded-lg">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Net P&L</div>
                <div className={`text-2xl font-bold ${performance.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {performance.totalPnl >= 0 ? '+' : ''}${performance.totalPnl}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="surface rounded-lg">
          <CardHeader>
            <CardTitle className="text-white">All Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>SL / TP</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade.tradeId}>
                    <TableCell className="text-white font-medium">{trade.pair}</TableCell>
                    <TableCell>
                      <Badge variant={trade.direction === 'BUY' ? 'success' : 'danger'}>
                        {trade.direction === 'BUY' ? (
                          <TrendingUp className="w-3 h-3 mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 mr-1" />
                        )}
                        {trade.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{trade.entryPrice}</TableCell>
                    <TableCell className="text-slate-400 text-xs">
                      <div>SL: {trade.stopLoss}</div>
                      <div>TP: {trade.takeProfit}</div>
                    </TableCell>
                    <TableCell className="text-slate-300">{trade.positionSize}</TableCell>
                    <TableCell className={`font-medium ${(trade.monetaryPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(trade.monetaryPnl || 0) >= 0 ? '+' : ''}
                      ${trade.monetaryPnl?.toFixed(2) || '0.00'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade.status === 'OPEN' ? 'info' : trade.status === 'CLOSED' ? 'secondary' : 'default'}>
                        {trade.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade.mode === 'LIVE' ? 'danger' : trade.mode === 'PAPER' ? 'success' : 'warning'}>
                        {trade.mode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {trade.status === 'OPEN' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCloseTrade(trade.tradeId)}
                          disabled={isLoading}
                        >
                          <X className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!trades.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                      No trades found.
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
