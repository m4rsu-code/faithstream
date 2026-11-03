import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { requestApi, TOKEN_KEY, USER_KEY } from '../utils/api';
import type { AuthUser, LoginResponse } from '../utils/types';

interface AdminAuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null') as AuthUser | null;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const clearSession = useCallback((): void => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const result = await requestApi<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email_address: email, password }),
    });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      if (sessionStorage.getItem(TOKEN_KEY)) {
        await requestApi<{ message: string }>('/logout', { method: 'POST' });
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AdminAuthContextValue>(() => ({
    token,
    user,
    isAuthenticated: Boolean(token && user),
    login,
    logout,
    clearSession,
  }), [clearSession, login, logout, token, user]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used inside AdminAuthProvider.');
  }
  return context;
}
