import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Activity, BarChart3, LineChart, ShieldCheck } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    redirect('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3 text-slate-950 no-underline hover:no-underline">
            <div className="brand-mark">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold leading-tight text-slate-950">NiveshAI Guard</div>
              <div className="text-xs text-slate-500">Dhan trading command center</div>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700 hover:no-underline">
              <Activity className="mr-2 inline h-4 w-4" />
              Dashboard
            </Link>
            <Link href="/dashboard/signals" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700 hover:no-underline">
              <LineChart className="mr-2 inline h-4 w-4" />
              Signals
            </Link>
            <Link href="/dashboard/trades" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700 hover:no-underline">
              <BarChart3 className="mr-2 inline h-4 w-4" />
              Trades
            </Link>
            <Link href="/dashboard/backtest" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700 hover:no-underline">
              Backtest
            </Link>
            <Link href="/dashboard/admin" className="rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-100 no-underline hover:bg-blue-500/20 hover:no-underline">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="page-container">
        {children}
      </main>
    </div>
  );
}
