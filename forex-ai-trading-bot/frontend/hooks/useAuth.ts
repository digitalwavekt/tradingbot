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
  document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Lax`;
};

const clearStoredAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
};

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  tokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const response = await authAPI.login(email, password);
    const token = response.data.accessToken || response.data.token;
    const { refreshToken, user } = response.data;

    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    setTokenCookie(token);

    set({
      user,
      token,
      refreshToken,
      tokenExpiresAt: getTokenExpiry(token),
      refreshTokenExpiresAt: getTokenExpiry(refreshToken),
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: () => {
    clearStoredAuth();
    set({
      user: null,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      isAuthenticated: false,
      isLoading: false,
    });
    window.location.href = '/login';
  },

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }

      const response = await authAPI.me();
      set({
        user: response.data.user,
        token,
        refreshToken,
        tokenExpiresAt: getTokenExpiry(token),
        refreshTokenExpiresAt: refreshToken ? getTokenExpiry(refreshToken) : null,
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
        refreshTokenExpiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  refreshSession: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('Missing refresh token');

    const response = await authAPI.refresh(refreshToken);
    const token = response.data.accessToken || response.data.token;
    const nextRefreshToken = response.data.refreshToken || refreshToken;

    localStorage.setItem('token', token);
    if (nextRefreshToken) localStorage.setItem('refreshToken', nextRefreshToken);
    setTokenCookie(token);

    set({
      token,
      refreshToken: nextRefreshToken,
      tokenExpiresAt: getTokenExpiry(token),
      refreshTokenExpiresAt: nextRefreshToken ? getTokenExpiry(nextRefreshToken) : null,
      isAuthenticated: true,
      isLoading: false,
    });
  },
}));
