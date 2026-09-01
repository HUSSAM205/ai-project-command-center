"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string; organization_name: string }) => Promise<void>;
  startDemo: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const token = getToken();
    const demoFlag = typeof window !== "undefined" && window.localStorage.getItem("aipcc_demo") === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing auth state from localStorage on mount
    setIsDemo(demoFlag);
    if (!token) {
      setIsLoading(false);
      return;
    }
    // Demo sessions are anonymous — there is no real user row, so `/auth/me` 404s.
    // Restore the synthetic user we stashed at demo start instead of calling it.
    if (demoFlag) {
      const stored = window.localStorage.getItem("aipcc_demo_user");
      if (stored) {
        try {
          setUser(JSON.parse(stored) as User);
        } catch {
          clearToken();
          window.localStorage.removeItem("aipcc_demo");
          window.localStorage.removeItem("aipcc_demo_user");
        }
      } else {
        clearToken();
        window.localStorage.removeItem("aipcc_demo");
      }
      setIsLoading(false);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        clearToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.access_token);
    window.localStorage.removeItem("aipcc_demo");
    window.localStorage.removeItem("aipcc_demo_user");
    setIsDemo(false);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (payload: { email: string; password: string; full_name: string; organization_name: string }) => {
      const res = await api.register(payload);
      setToken(res.access_token);
      window.localStorage.removeItem("aipcc_demo");
      setIsDemo(false);
      setUser(res.user);
    },
    [],
  );

  const startDemo = useCallback(async () => {
    const res = await api.demoSession();
    setToken(res.access_token);
    window.localStorage.setItem("aipcc_demo", "1");
    window.localStorage.setItem("aipcc_demo_user", JSON.stringify(res.user));
    setIsDemo(true);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    window.localStorage.removeItem("aipcc_demo");
    window.localStorage.removeItem("aipcc_demo_user");
    setUser(null);
    setIsDemo(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      isDemo,
      login,
      register,
      startDemo,
      logout,
    }),
    [user, isLoading, isDemo, login, register, startDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
