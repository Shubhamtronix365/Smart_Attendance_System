"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (String(user.role || "").toLowerCase() !== "admin") {
        router.replace("/employee/dashboard");
      }
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-xs font-mono">Verifying administrative access...</p>
      </div>
    );
  }

  if (!user || String(user.role || "").toLowerCase() !== "admin") {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 max-w-md">
          <p className="text-amber-300 font-semibold text-sm">Administrative Privileges Required</p>
          <p className="text-white/50 text-xs mt-1">
            You are currently signed in as an Employee. Redirecting to your personal portal...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
