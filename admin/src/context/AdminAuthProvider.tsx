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

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return typeof user.id === 'number' && Number.isFinite(user.id)
    && typeof user.name === 'string'
    && typeof user.email_address === 'string'
    && typeof user.role === 'string';
}

type AuthSession =
  | { phase: 'authenticated'; token: string; user: AuthUser }
  | { phase: 'anonymous' };

function readStoredSession(): AuthSession {
  const token = sessionStorage.getItem(TOKEN_KEY);
  try {
    const user: unknown = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    if (token && isAuthUser(user)) return { phase: 'authenticated', token, user };
  } catch {
    // A corrupt user record should never leave a token-only session behind.
  }
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  return { phase: 'anonymous' };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  // Keep token and identity in one state value so React cannot observe a half-authenticated session.
  const [session, setSession] = useState<AuthSession>(readStoredSession);
  const token = session.phase === 'authenticated' ? session.token : null;
  const user = session.phase === 'authenticated' ? session.user : null;

  const clearSession = useCallback((): void => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setSession({ phase: 'anonymous' });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const result = await requestApi<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email_address: email, password }),
    });
    try {
      sessionStorage.setItem(TOKEN_KEY, result.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      throw error;
    }
    setSession({ phase: 'authenticated', token: result.token, user: result.user });
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
