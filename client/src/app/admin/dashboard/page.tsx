"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users, UserCheck, UserX, Clock, FileWarning,
  IndianRupee, CalendarDays, TrendingUp, Activity,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatCard from "@/components/StatCard";
import LiveAttendanceFeed from "@/components/LiveAttendanceFeed";
import ChartsSection from "@/components/ChartsSection";
import { attendanceApi, leaveApi, payrollApi, employeesApi } from "@/services/api";
import { formatTime } from "@/utils/formatters";

// ─── Status Configuration ─────────────────────────────────────────────────────

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  "on-time": { color: "#22c55e", bg: "rgba(34,197,94,0.1)", label: "On Time" },
  "late": { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "Late" },
  "pending": { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", label: "Pending" },
  "overtime": { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Overtime" },
};

// ─── Attendance Ring Chart (CSS only) ─────────────────────────────────────────
function AttendanceRing({ present, total }: { present: number; total: number }) {
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  const circumference = 2 * Math.PI * 54; // r=54
  const dash = (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {/* Progress */}
          <motion.circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="url(#cyan-violet)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - dash }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="cyan-violet" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f5ff" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-white">{percentage}%</span>
          <span className="text-white/40 text-xs">Attendance</span>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-xs">
        <span className="text-green-400">{present} Present</span>
        <span className="text-white/30">|</span>
        <span className="text-red-400">{Math.max(total - present, 0)} Absent</span>
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 72 : 240;

  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, late: 0, leave: 0 });
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [payrollThisMonth, setPayrollThisMonth] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Fetch stats, leaves, payroll, and live checkins
      const [statsRes, leavesRes, payrollRes, liveRes] = await Promise.all([
        attendanceApi.stats().catch(() => ({ data: { total: 0, present: 0, absent: 0, late: 0, leave: 0 } })),
        leaveApi.list().catch(() => ({ data: [] })),
        payrollApi.list(month, year).catch(() => ({ data: [] })),
        attendanceApi.live().catch(() => ({ data: [] })),
      ]);

      setStats(statsRes.data);
      
      const pendingCount = leavesRes.data.filter((l: any) => l.approval_status === "pending").length;
      setPendingLeavesCount(pendingCount);

      let payrollTotal = payrollRes.data.reduce((acc: number, p: any) => acc + (Number(p.final_salary) || 0), 0);
      if (payrollTotal === 0) {
        try {
          const empRes = await employeesApi.list({ size: "100" });
          payrollTotal = empRes.data.reduce((acc: number, e: any) => acc + (Number(e.salary || e.basic_salary) || 0), 0);
        } catch {}
      }
      setPayrollThisMonth(payrollTotal);

      // Map live feed to RECENT_ACTIVITY format (last 5 records)
      const mappedActivity = liveRes.data.slice(0, 5).map((r: any) => {
        const hasCheckOut = !!r.check_out;
        const timeStr = hasCheckOut ? r.check_out : r.check_in;
        const mappedStatus = hasCheckOut ? "overtime" : (r.status === "late" ? "late" : (r.status === "absent" ? "pending" : "on-time"));
        const rawTime = timeStr || r.created_at;
        return {
          id: r.attendance_id,
          name: r.employee_name || "Unknown",
          action: hasCheckOut ? "Clocked Out" : "Clocked In",
          time: formatTime(rawTime, true),
          status: mappedStatus,
          avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
        };
      });
      setRecentActivity(mappedActivity);
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Poll every 15 seconds as a fallback
    const interval = setInterval(fetchDashboardData, 15000);

    // WebSocket for real-time updates
    let ws: WebSocket | null = null;
    const WS_EVENTS = ["attendance_updated", "live_attendance", "employee_created", "employee_deleted", "all_employees_cleared"];
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (WS_EVENTS.includes(data.event)) {
            fetchDashboardData();
          }
        } catch {}
      };
      ws.onerror = () => {}; // silently ignore — polling covers us
    } catch {}

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [fetchDashboardData]);

  // Construct dynamic cards list
  const cards = [
    {
      title: "Total Employees",
      value: stats.total,
      icon: <Users size={20} />,
      color: "#3b82f6",
      glowColor: "#3b82f6",
      trend: "Active workforce",
      trendUp: true,
    },
    {
      title: "Present Today",
      value: stats.present,
      icon: <UserCheck size={20} />,
      color: "#22c55e",
      glowColor: "#22c55e",
      trend: "At office / WFH",
      trendUp: true,
    },
    {
      title: "Absent Today",
      value: stats.absent,
      icon: <UserX size={20} />,
      color: "#ef4444",
      glowColor: "#ef4444",
      trend: "Not checked in",
      trendUp: false,
    },
    {
      title: "Late Arrivals",
      value: stats.late,
      icon: <Clock size={20} />,
      color: "#f59e0b",
      glowColor: "#f59e0b",
      trend: "After office hours",
      trendUp: false,
    },
    {
      title: "Pending Leaves",
      value: pendingLeavesCount,
      icon: <FileWarning size={20} />,
      color: "#f97316",
      glowColor: "#f97316",
      trend: "Awaiting review",
      trendUp: false,
    },
    {
      title: "Payroll This Month",
      value: payrollThisMonth,
      prefix: "₹",
      icon: <IndianRupee size={20} />,
      color: "#a78bfa",
      glowColor: "#7c3aed",
      trend: "Summed final salary",
      trendUp: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0f1e" }}>
        <div className="flex flex-col items-center gap-3">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 rounded-full border-4 border-cyan-400 border-t-transparent" />
          <p className="text-white/50 text-sm font-medium">Loading command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      {/* Sidebar */}
      <AdminSidebar userName="Admin User" userRole="Administrator" />

      {/* Top Bar */}
      <AdminTopBar
        title="Dashboard"
        userName="Admin User"
        userRole="Administrator"
        sidebarCollapsed={sidebarCollapsed}
      />

      {/* Main content area */}
      <main
        className="min-h-screen pt-16 transition-all duration-300"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <div className="p-6 lg:p-8">

          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity size={20} className="text-cyan-400" />
              <span className="text-cyan-400/60 text-sm font-medium uppercase tracking-widest">Overview</span>
            </div>
            <h1 className="text-3xl font-black text-white">
              Good morning, Admin 👋
            </h1>
            <p className="text-white/40 mt-1">Here&apos;s what&apos;s happening across your organization today.</p>
          </motion.div>

          {/* ── Stat Cards Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {cards.map((card, i) => (
              <StatCard
                key={card.title}
                title={card.title}
                value={card.value}
                prefix={card.prefix}
                icon={card.icon}
                color={card.color}
                glowColor={card.glowColor}
                trend={card.trend}
                trendUp={card.trendUp}
                index={i}
              />
            ))}
          </div>

          {/* ── Second Row: Attendance Ring + Activity Feed ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

            {/* Attendance summary card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 90 }}
              className="neo-card p-6 flex flex-col items-center justify-center gap-4"
            >
              <div className="text-center mb-2">
                <p className="text-white font-bold text-base">Today&apos;s Attendance</p>
                <p className="text-white/40 text-xs">{new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}</p>
              </div>
              <AttendanceRing present={stats.present} total={stats.total} />
              <div className="grid grid-cols-2 gap-3 w-full mt-2">
                {[
                  { label: "On Time", value: String(stats.present - stats.late), color: "#22c55e" },
                  { label: "Late", value: String(stats.late), color: "#f59e0b" },
                  { label: "On Leave", value: String(stats.leave), color: "#a78bfa" },
                  { label: "Absent", value: String(stats.absent), color: "#ef4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-white/50 text-xs">{label}</span>
                    <span className="text-white text-xs font-bold ml-auto">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Recent Activity Feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, type: "spring", stiffness: 90 }}
              className="neo-card p-6 lg:col-span-2"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-white font-bold text-base">Recent Activity</p>
                  <p className="text-white/40 text-xs">Live attendance updates</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-white/30 text-xs">
                    No activity logs recorded today.
                  </div>
                ) : (
                  recentActivity.map((item, i) => {
                    const s = statusConfig[item.status] || statusConfig["on-time"];
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.9 + i * 0.08 }}
                        className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.03]"
                        style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
                          style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}>
                          {item.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{item.name}</p>
                          <p className="text-white/40 text-xs">{item.action}</p>
                        </div>
                        <span className="text-white/30 text-xs shrink-0">{item.time}</span>
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
                          style={{ background: s.bg, color: s.color }}
                        >
                          {s.label}
                        </span>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>

          {/* ── Quick Actions ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
          >
            <p className="text-white/50 text-sm font-medium mb-3 uppercase tracking-widest">Quick Actions</p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Mark Attendance", icon: <UserCheck size={16} />, color: "#22c55e", path: "/admin/attendance" },
                { label: "Process Payroll", icon: <IndianRupee size={16} />, color: "#a78bfa", path: "/admin/payroll" },
                { label: "View Reports", icon: <CalendarDays size={16} />, color: "#3b82f6", path: "/admin/reports" },
                { label: "Add Employee", icon: <Users size={16} />, color: "#f59e0b", path: "/admin/employees" },
              ].map(({ label, icon, color, path }) => (
                <motion.button
                  key={label}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push(path)}
                  className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium text-white/70 transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}40`;
                    (e.currentTarget as HTMLButtonElement).style.color = color;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
                  }}
                >
                  <span style={{ color }}>{icon}</span>
                  {label}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* ── Charts Section ── */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-white/50 text-sm font-medium uppercase tracking-widest">Analytics</span>
            </div>
            <ChartsSection />
          </div>

          {/* ── Live Attendance Feed ── */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-white/50 text-sm font-medium uppercase tracking-widest">Live Feed</span>
            </div>
            <LiveAttendanceFeed />
          </div>

        </div>
      </main>
    </div>
  );
}
