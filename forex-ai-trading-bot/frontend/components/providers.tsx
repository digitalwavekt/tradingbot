'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/hooks/useAuth';

export function Providers({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const tokenExpiresAt = useAuthStore((state) => state.tokenExpiresAt);
 const refreshTokenExpiresAt = useAuthStore((state) => state.tokenExpiresAt);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!tokenExpiresAt || !refreshTokenExpiresAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const accessRemaining = tokenExpiresAt - now;
      const refreshRemaining = refreshTokenExpiresAt - now;

      if (accessRemaining > 0 && accessRemaining <= 120000 && refreshRemaining > 0) {
        refreshSession().catch(() => undefined);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshSession, refreshTokenExpiresAt, tokenExpiresAt]);

  return <>{children}</>;
}
