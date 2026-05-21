'use client';

import { useEffect, useState } from 'react';
import { Activity, Database, RadioTower, ShieldCheck } from 'lucide-react';

type HealthResponse = {
  status?: string;
  checks?: {
    api?: { status?: string };
    database?: { status?: string };
    redis?: { status?: string };
  };
  brokers?: {
    status?: string;
    ok?: boolean;
    broker?: string;
    activeBroker?: string;
    latencyMs?: number;
    error?: string;
  };
};

const statusTone = (healthy: boolean) =>
  healthy ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700';

export function SystemStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Health check failed (${response.status})`);
        const data = await response.json();
        if (mounted) {
          setHealth(data);
          setError('');
        }
      } catch (err: any) {
        if (mounted) setError(err.message || 'Health check failed');
      }
    };

    loadHealth();
    const timer = window.setInterval(loadHealth, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const apiOk = health?.checks?.api?.status === 'HEALTHY';
  const dbOk = health?.checks?.database?.status === 'HEALTHY';
  const brokerOk = health?.brokers?.status === 'HEALTHY' || health?.brokers?.ok === true;

  const items = [
    { label: 'API', ok: apiOk, icon: Activity },
    { label: 'Database', ok: dbOk, icon: Database },
    { label: health?.brokers?.activeBroker || health?.brokers?.broker || 'Broker', ok: brokerOk, icon: RadioTower }
  ];

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
        System check failed: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${statusTone(item.ok)}`}>
            <Icon className="h-4 w-4" />
            {item.label}: {item.ok ? 'Connected' : 'Checking'}
          </div>
        );
      })}
      {brokerOk && health?.brokers?.latencyMs !== undefined && (
        <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
          <ShieldCheck className="h-4 w-4" />
          Dhan {health.brokers.latencyMs}ms
        </div>
      )}
    </div>
  );
}
