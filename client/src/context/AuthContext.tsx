"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { authApi } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: string;
  employee_id?: number;
  name: string;
  email: string;
  role: "admin" | "employee";
  avatar?: string;
  department?: string;
  empId?: string;
  employee_code?: string;
  designation?: string;
  salary?: number | string;
  phone?: string;
  fingerprint_id?: number | null;
  rfid_uid?: string | null;
  joining_date?: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<User>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount — try to fetch current user if token exists
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setIsLoading(false);
      return;
    }

    authApi.me()
      .then((res) => {
        const dbUser = res.data;
        setUser({
          id: String(dbUser.employee_id),
          employee_id: dbUser.employee_id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role as "admin" | "employee",
          department: dbUser.department || "",
          designation: dbUser.designation || "",
          empId: `EMP${String(dbUser.employee_id).padStart(3, "0")}`,
          employee_code: dbUser.employee_code || `EMP${String(dbUser.employee_id).padStart(3, "0")}`,
          avatar: dbUser.name.split(" ").map((n: string) => n[0]).join("").toUpperCase(),
          salary: dbUser.salary || 0,
          phone: dbUser.phone || "",
          fingerprint_id: dbUser.fingerprint_id ?? null,
          rfid_uid: dbUser.rfid_uid ?? null,
          joining_date: dbUser.joining_date ?? null,
        });
      })
      .catch(() => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("role");
        }
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    const res = await authApi.login(email, password, rememberMe);
    const token = res.data?.access_token;
    if (token && typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
      localStorage.setItem("role", res.data?.role || "");
    }
    const meRes = await authApi.me();
    const dbUser = meRes.data;
    const mappedUser: User = {
      id: String(dbUser.employee_id),
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role as "admin" | "employee",
      department: dbUser.department || "",
      designation: dbUser.designation || "",
      empId: `EMP${String(dbUser.employee_id).padStart(3, "0")}`,
      avatar: dbUser.name.split(" ").map((n: string) => n[0]).join("").toUpperCase(),
    };
    setUser(mappedUser);
    return mappedUser;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("role");
      window.location.href = "/login";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
