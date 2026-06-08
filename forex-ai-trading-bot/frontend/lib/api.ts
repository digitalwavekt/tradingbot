import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const setTokenCookie = (token: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `token=${token}; path=/; max-age=900; SameSite=Lax`;
};

const clearTokenCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — auto refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (!refreshToken) throw new Error('No refresh token');

    // FIX: correct endpoint /auth/refresh (was /admin/refresh)
    const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        const token = response.data.accessToken || response.data.token;
        const nextRefreshToken = response.data.refreshToken || refreshToken;

        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          if (nextRefreshToken) localStorage.setItem('refreshToken', nextRefreshToken);
        }
        setTokenCookie(token);
        originalRequest.headers.Authorization = `Bearer ${token}`;

        return api(originalRequest);
      } catch {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        }
        clearTokenCookie();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
   // FIX: was /admin/login — correct route is /auth/login
   login: (email: string, password: string) => api.post('/auth/login', { email, password }),
   register: (data: any) => api.post('/auth/register', data),

   // FIX: was /admin/refresh — correct route is /auth/refresh
   refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
};

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
  getMarketOverview: () => api.get('/dashboard/market-overview'),
  getPerformanceChart: (days?: number) => api.get(`/dashboard/performance-chart?days=${days || 30}`),
};

export const tradeAPI = {
  getTrades: (params?: any) => api.get('/trades', { params }),
  getOpenTrades: () => api.get('/trades/open'),
  getPerformance: () => api.get('/trades/performance'),
  closeTrade: (tradeId: string, reason?: string) => api.post(`/trades/close/${tradeId}`, { reason }),
  closeAll: (reason?: string) => api.post('/trades/close-all', { reason }),
};

export const signalAPI = {
  getSignals: (params?: any) => api.get('/signals', { params }),
  getPendingApproval: () => api.get('/signals/pending-approval'),
  analyze: (pair: string) => api.post(`/signals/analyze/${pair}`),
  approve: (signalId: string) => api.post(`/signals/approve/${signalId}`),
  reject: (signalId: string, reason?: string) => api.post(`/signals/reject/${signalId}`, { reason }),
};

export const adminAPI = {
  getConfig: () => api.get('/admin/config'),
  getRuntimeStatus: () => api.get('/admin/runtime-status'),
  updateConfig: (data: any) => api.put('/admin/config', data),
  setMode: (mode: string) => api.post('/admin/mode', { mode }),
  enableLive: (enable: boolean) => api.post('/admin/enable-live', { enable }),
  triggerKillSwitch: (reason: string) => api.post('/admin/kill-switch', { reason }),
  resetKillSwitch: () => api.post('/admin/reset-kill-switch'),
  getAuditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
  getRiskLogs: (params?: any) => api.get('/admin/risk-logs', { params }),
  getUsers: () => api.get('/admin/users'),
};

export const brokerAPI = {
  getStatus: () => api.get('/broker/status'),
  getDhanProfile: () => api.get('/broker/dhan/profile'),
  getDhanFunds: () => api.get('/broker/dhan/funds'),
};

export const backtestAPI = {
  run: (data: any) => api.post('/backtest/run', data),
  getResults: (params?: any) => api.get('/backtest/results', { params }),
  getResult: (backtestId: string) => api.get(`/backtest/results/${backtestId}`),
};

export const healthAPI = {
  check: () => api.get('/health'),
};
