import { useCallback, useEffect, useState } from "react";

import type { NativeApi, User } from "@acme/contracts";

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(api: NativeApi | undefined): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }

    void api.auth
      .getSession()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [api]);

  const login = useCallback(async () => {
    if (!api) return;
    setError(null);
    setLoading(true);
    try {
      const u = await api.auth.login();
      setUser(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }, [api]);

  const logout = useCallback(async () => {
    if (!api) return;
    await api.auth.logout();
    setUser(null);
  }, [api]);

  return { user, loading, error, login, logout };
}
