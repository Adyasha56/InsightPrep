"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import * as authApi from "@/lib/api/auth";
import { PublicUser } from "@/types/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: PublicUser | null;
  status: AuthStatus;
  login: (input: authApi.LoginInput) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// Session state lives here, not in a route: the httpOnly cookie can't be
// read by client JS (that's the point of httpOnly), so the only way to know
// whether a session exists is to ask the API. Every page that needs auth
// state reads it through useAuth() rather than re-fetching independently.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    authApi
      .getCurrentUser()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("unauthenticated");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: authApi.LoginInput) => {
    const { user } = await authApi.login(input);
    setUser(user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (input: authApi.RegisterInput) => {
    const { user } = await authApi.register(input);
    setUser(user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return <AuthContext.Provider value={{ user, status, login, register, logout }}>{children}</AuthContext.Provider>;
}
