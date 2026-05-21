import { create } from 'zustand';
import { DashboardData, MarketData, Trade, Signal } from '@/types';
import { dashboardAPI, tradeAPI, signalAPI } from '@/lib/api';

interface DashboardState {
  dashboardData: DashboardData | null;
  marketData: MarketData[];
  openTrades: Trade[];
  recentSignals: Signal[];
  isLoading: boolean;
  fetchDashboard: () => Promise<void>;
  fetchMarketData: () => Promise<void>;
  fetchOpenTrades: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboardData: null,
  marketData: [],
  openTrades: [],
  recentSignals: [],
  isLoading: false,

  fetchDashboard: async () => {
    set({ isLoading: true });
    try {
      const response = await dashboardAPI.getOverview();
      set({ dashboardData: response.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchMarketData: async () => {
    try {
      const response = await dashboardAPI.getMarketOverview();
      set({ marketData: response.data.marketData });
    } catch {
      // Silent fail
    }
  },

  fetchOpenTrades: async () => {
    try {
      const response = await tradeAPI.getOpenTrades();
      set({ openTrades: response.data.trades });
    } catch {
      // Silent fail
    }
  },
}));