"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Menu } from "lucide-react";

interface EmployeeTopBarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function EmployeeTopBar({
  title,
  subtitle,
  onRefresh,
  isRefreshing = false,
}: EmployeeTopBarProps) {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setDate(
        now.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleMobileToggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-employee-sidebar"));
  };

  return (
    <header
      className="fixed top-0 right-0 h-16 z-30 flex items-center px-4 md:px-8 transition-all"
      style={{
        left: 0,
        background: "rgba(10, 15, 30, 0.85)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={handleMobileToggle}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-all"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="ml-2 md:ml-64 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs hidden sm:inline">Employee Portal</span>
          <span className="text-white/20 text-xs hidden sm:inline">/</span>
          <h1 className="text-white font-bold text-sm sm:text-base">{title}</h1>
        </div>
        {subtitle && <p className="text-white/40 text-[11px] hidden sm:block">{subtitle}</p>}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-cyan-400 hover:bg-white/5 transition-all disabled:opacity-50"
            title="Refresh portal data"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-cyan-400" : ""} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        )}

        <div className="hidden sm:block text-right border-l border-white/10 pl-3">
          <p className="text-white/80 text-xs font-mono font-medium">{time}</p>
          <p className="text-white/30 text-[10px]">{date}</p>
        </div>

        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase"
          style={{
            background: "rgba(0, 245, 255, 0.1)",
            color: "#00f5ff",
            border: "1px solid rgba(0, 245, 255, 0.25)",
          }}
        >
          Employee
        </span>
      </div>
    </header>
  );
}
