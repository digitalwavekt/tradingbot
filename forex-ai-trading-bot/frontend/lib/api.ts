import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const setTokenCookie = (token: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Lax`;
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
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post(`${API_URL}/api/admin/refresh`, { refreshToken });
        const token = response.data.accessToken || response.data.token;
        const nextRefreshToken = response.data.refreshToken || refreshToken;

        localStorage.setItem('token', token);
        if (nextRefreshToken) localStorage.setItem('refreshToken', nextRefreshToken);
        setTokenCookie(token);
        originalRequest.headers.Authorization = `Bearer ${token}`;

        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        clearTokenCookie();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  login: (email: string, password: string) => api.post('/admin/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  refresh: (refreshToken: string) => api.post('/admin/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
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
