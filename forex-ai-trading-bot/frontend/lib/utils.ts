import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'active':
    case 'approved':
    case 'open':
      return 'text-emerald-400';
    case 'warning':
    case 'pending':
    case 'human_approval':
      return 'text-amber-400';
    case 'critical':
    case 'error':
    case 'rejected':
    case 'closed':
      return 'text-red-400';
    case 'learning':
    case 'paper':
      return 'text-blue-400';
    default:
      return 'text-slate-400';
  }
}

export function getStatusBg(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'active':
    case 'approved':
    case 'open':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'warning':
    case 'pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'critical':
    case 'error':
    case 'rejected':
    case 'closed':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'learning':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'paper':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}
