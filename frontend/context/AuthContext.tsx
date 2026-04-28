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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start true so we don't flash redirect before token check
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await AuthAPI.me();
      setUser(response.user as unknown as User);
    } catch {
      // Token invalid / expired — clear silently
      removeToken();
      setUser(null);
    } finally {
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
      setUser(response.user as unknown as User);
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

      setUser(response.user as unknown as User);
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
        setUser(response.user as unknown as User);
      } else {
        removeToken();
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
        isAuthenticated: !!user,
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
