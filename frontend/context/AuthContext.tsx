// context/AuthContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { AuthAPI, ApiUser, getToken, setToken, removeToken } from "@/lib/api";

type User = ApiUser;

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    needsVerification?: boolean;
  }>;
  register: (
    data: RegisterData,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  name: string;
  company_name: string;
  company_size: string;
  rera_no: string;
  phone: string;
  city: string;
  email: string;
  address: string;
  password: string;
  password_confirmation: string;
}

interface ApiError {
  status?: number;
  message?: string;
  errors?: Record<string, string[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_USER_CACHE_KEY = "cp_user";

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
    return null;
  }
}

function cacheUser(user: User | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasSession, setHasSession] = useState(false);
  // Start true so we don't flash redirect before token check
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setHasSession(false);
      cacheUser(null);
      setIsLoading(false);
      return;
    }
    setHasSession(true);

    const cachedUser = readCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoading(false);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await AuthAPI.me(controller.signal);
      const freshUser = response.user as unknown as User;
      setUser(freshUser);
      cacheUser(freshUser);
    } catch (error: unknown) {
      // Token invalid / expired — clear silently
      const status = (error as ApiError)?.status;
      if (status === 401 || status === 403) {
        removeToken();
        setHasSession(false);
        cacheUser(null);
        setUser(null);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, []);

  // On mount — restore session from stored token
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // ── Refresh user data (call after updates) ───────────
  const refreshUser = useCallback(async () => {
    try {
      const response = await AuthAPI.me();
      const freshUser = response.user as unknown as User;
      setUser(freshUser);
      cacheUser(freshUser);
    } catch {
      // ignore
    }
  }, []);

  // ── Login ─────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    try {
      const response = await AuthAPI.login({ email, password });

      if (!response.token) {
        return {
          success: false,
          error: "Login failed. Token not received.",
        };
      }

      if (!response.user.email_verified) {
        return {
          success: false,
          error:
            "Please verify your email before logging in. Check your inbox.",
          needsVerification: true,
        };
      }

      if (!response.user.is_active) {
        return {
          success: false,
          error: "Your account has been disabled. Contact administrator.",
        };
      }

      setToken(response.token);
      setHasSession(true);

      const loggedInUser = response.user as unknown as User;
      setUser(loggedInUser);
      cacheUser(loggedInUser);
      return { success: true };
    } catch (error: unknown) {
      const e = error as ApiError;
      return {
        success: false,
        error: e.message || "Invalid email or password.",
      };
    }
  };

  // ── Register ──────────────────────────────────────────
  const register = async (data: RegisterData) => {
    try {
      const response = await AuthAPI.register(data);
      if (response.token) {
        setToken(response.token);
        setHasSession(true);
        const registeredUser = response.user as unknown as User;
        setUser(registeredUser);
        cacheUser(registeredUser);
      } else {
        removeToken();
        setHasSession(false);
        cacheUser(null);
        setUser(null);
      }
      return { success: true };
    } catch (error: unknown) {
      const e = error as ApiError;

      if (e.errors && typeof e.errors === "object") {
        const firstKey = Object.keys(e.errors)[0];
        if (firstKey) {
          return {
            success: false,
            error: e.errors[firstKey][0] || "Registration failed.",
          };
        }
      }
      return {
        success: false,
        error: e.message || "Registration failed. Please try again.",
      };
    }
  };

  // ── Logout ────────────────────────────────────────────
  const logout = async () => {
    try {
      await AuthAPI.logout();
    } catch {
      // ignore
    } finally {
      removeToken();
      setHasSession(false);
      cacheUser(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isAuthenticated: Boolean(user) || hasSession,
        isLoading,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
