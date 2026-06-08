'use client';

import { create } from 'zustand';
import { User } from '@/types';
import { authAPI } from '@/lib/api';

type JwtPayload = {
  exp?: number;
};

const decodeJwt = (token: string): JwtPayload | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

const getTokenExpiry = (token: string) => {
  const payload = decodeJwt(token);
  return payload?.exp ? payload.exp * 1000 : null;
};

const setTokenCookie = (token: string) => {
  if (typeof document === 'undefined') return;
  // FIX: max-age matches JWT access token expiry (15min = 900s)
  document.cookie = `token=${token}; path=/; max-age=900; SameSite=Lax`;
};

const clearStoredAuth = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
};

const getStored = () => {
  if (typeof window === 'undefined') return { token: null, refreshToken: null };
  return {
    token: localStorage.getItem('token'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
};

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  tokenExpiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    // FIX: authAPI.login now hits /auth/login correctly
    const response = await authAPI.login(email, password);
    const token = response.data.accessToken || response.data.token;
    const { refreshToken, user } = response.data;

    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    }
    setTokenCookie(token);

    set({
      user,
      token,
      refreshToken: refreshToken ?? null,
      tokenExpiresAt: getTokenExpiry(token),
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: async () => {
    const { refreshToken } = get();
    try {
      // FIX: call backend logout to revoke refresh token
      await authAPI.logout();
    } catch {
      // ignore errors — clear local state regardless
    }
    clearStoredAuth();
    set({
      user: null,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isAuthenticated: false,
      isLoading: false,
    });
    window.location.href = '/login';
  },

  checkAuth: async () => {
    const { token, refreshToken } = getStored();
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const response = await authAPI.me();
      set({
        user: response.data.user,
        token,
        refreshToken,
        tokenExpiresAt: getTokenExpiry(token),
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      clearStoredAuth();
      set({
        user: null,
        token: null,
        refreshToken: null,
        tokenExpiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  refreshSession: async () => {
    const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (!storedRefresh) throw new Error('Missing refresh token');

    // FIX: authAPI.refresh now hits /auth/refresh correctly
    const response = await authAPI.refresh(storedRefresh);
    const token = response.data.accessToken || response.data.token;
    const nextRefreshToken = response.data.refreshToken || storedRefresh;

    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      if (nextRefreshToken) localStorage.setItem('refreshToken', nextRefreshToken);
    }
    setTokenCookie(token);

    set({
      token,
      refreshToken: nextRefreshToken,
      tokenExpiresAt: getTokenExpiry(token),
      isAuthenticated: true,
      isLoading: false,
    });
  },
}));
