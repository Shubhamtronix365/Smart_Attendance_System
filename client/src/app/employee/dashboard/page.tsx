"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays, Clock, TrendingUp, DollarSign,
  CheckCircle2, Send, Download, Fingerprint,
  ChevronLeft, ChevronRight, LogOut, Loader2,
  Calendar, RefreshCw,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { useCountUp } from "@/hooks/useCountUp";
import { useAuth } from "@/context/AuthContext";
import { authApi, employeeSelfApi, leaveApi, payrollApi } from "@/services/api";
import { formatTime, formatDate } from "@/utils/formatters";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const LEAVE_TYPES = [
  { label: "Casual Leave", value: "casual" },
  { label: "Sick Leave", value: "sick" },
  { label: "Paid Leave", value: "paid" },
  { label: "Unpaid Leave", value: "unpaid" },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────
function EmpStatCard({ title, value, suffix = "", prefix = "", icon, color, index }: {
  title: string; value: number; suffix?: string; prefix?: string; icon: React.ReactNode; color: string; index: number;
}) {
  const count = useCountUp(value, 1400, index * 100);
  return (
    <motion.div
      initial={{ opacity:0, y:20, scale:0.97 }}
      animate={{ opacity:1, y:0, scale:1 }}
      transition={{ delay: index * 0.1, type:"spring", stiffness:90, damping:16 }}
      whileHover={{ scale:1.02, y:-3 }}
      className="neo-card p-6 cursor-default"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background:`${color}15`, border:`1px solid ${color}30` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-black mb-1" style={{ color }}>{prefix}{count.toLocaleString("en-IN")}{suffix}</p>
      <p className="text-white/50 text-sm">{title}</p>
    </motion.div>
  );
}

// ─── Apply Leave Form ─────────────────────────────────────────────────────────
function ApplyLeaveForm({ onLeaveSubmitted }: { onLeaveSubmitted: () => void }) {
  const { success, error } = useToast();
  const [form, setForm] = useState({ type: "casual", from: "", to: "", reason: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from || !form.to) {
      error("Please choose both start and end dates.");
      return;
    }
    if (form.from > form.to) {
      error("Start date cannot be after end date.");
      return;
    }

    try {
      setIsSubmitting(true);
      await leaveApi.request({
        leave_type: form.type,
        start_date: form.from,
        end_date: form.to,
        reason: form.reason || "General leave",
      });
      setSubmitted(true);
      success("Leave request submitted successfully!");
      onLeaveSubmitted();
      setTimeout(() => {
        setSubmitted(false);
        setForm({ type: "casual", from: "", to: "", reason: "" });
      }, 3000);
    } catch (err: any) {
      console.error("Error submitting leave request:", err);
      const detail = err.response?.data?.detail || "Failed to submit leave request.";
      error(typeof detail === "string" ? detail : "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div id="leave-section" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }} className="neo-card p-6">
      <h3 className="text-white font-bold text-base mb-4">Apply for Leave</h3>
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div key="success"
            initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.9 }}
            className="flex flex-col items-center justify-center py-8 text-center">
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:0.1, type:"spring", stiffness:300 }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle2 size={32} className="text-green-400" />
            </motion.div>
            <p className="text-white font-bold text-lg">Request Submitted!</p>
            <p className="text-white/40 text-sm mt-1">Your leave request is pending approval.</p>
          </motion.div>
        ) : (
          <motion.form key="form" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-white/50 text-xs font-medium mb-1.5 block">Leave Type</label>
              <select value={form.type} onChange={(e) => set("type")(e.target.value)}
                className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl appearance-none"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0a0f1e]">{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/50 text-xs font-medium mb-1.5 block">From Date</label>
                <input type="date" value={form.from} onChange={(e) => set("from")(e.target.value)} required
                  className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div>
                <label className="text-white/50 text-xs font-medium mb-1.5 block">To Date</label>
                <input type="date" value={form.to} onChange={(e) => set("to")(e.target.value)} required
                  className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
              </div>
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium mb-1.5 block">Reason</label>
              <textarea value={form.reason} onChange={(e) => set("reason")(e.target.value)} rows={3} required
                placeholder="Briefly explain the reason for leave..."
                className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl resize-none"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
            </div>
            <motion.button type="submit" disabled={isSubmitting} whileHover={{ scale: isSubmitting ? 1 : 1.02 }} whileTap={{ scale: isSubmitting ? 1 : 0.97 }}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-black disabled:opacity-50"
              style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={14} />Submit Request
                </>
              )}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Working Hours Chart ──────────────────────────────────────────────────────
function WorkingHoursChart({
  attendance,
  monthName,
  year,
}: {
  attendance: any[];
  monthName: string;
  year: number;
}) {
  const chartData = useMemo(() => {
    if (!attendance || attendance.length === 0) return [];
    const sorted = [...attendance].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.map((r) => {
      const d = new Date(r.date);
      const dayLabel = `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
      return {
        day: dayLabel,
        hours: Number(r.working_hours) || 0,
      };
    });
  }, [attendance]);

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.6 }} className="neo-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-white font-bold text-base">Working Hours Trend</h3>
        <span className="text-cyan-400 text-xs font-medium">Daily logged hours</span>
      </div>
      <p className="text-white/40 text-xs mb-5">Records for {monthName} {year}</p>

      {chartData.length === 0 ? (
        <div className="h-[180px] flex flex-col items-center justify-center text-white/30 text-xs">
          <Calendar size={24} className="mb-2 opacity-30" />
          No attendance records logged for {monthName} {year} yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top:5, right:8, left:-24, bottom:0 }}>
            <defs>
              <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00f5ff" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill:"rgba(255,255,255,0.35)", fontSize:10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, "auto"]} tick={{ fill:"rgba(255,255,255,0.35)", fontSize:10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background:"rgba(10,15,30,0.95)", border:"1px solid rgba(0,245,255,0.2)", borderRadius:"12px", fontSize:"12px" }}
              itemStyle={{ color:"#00f5ff" }}
              formatter={(v: any) => [`${Number(v).toFixed(1)} hrs`, "Working Time"]}
            />
            <Area type="monotone" dataKey="hours" stroke="#00f5ff" strokeWidth={2.5} fill="url(#hoursGrad)"
              dot={{ fill:"#00f5ff", r:3, strokeWidth:0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}

// ─── My Payslips ──────────────────────────────────────────────────────────────
function MyPayslips({
  payslips,
  isLoading,
}: {
  payslips: any[];
  isLoading: boolean;
}) {
  const { success, error } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (payrollId: string, monthNum: number, yearNum: number) => {
    try {
      setDownloadingId(payrollId);
      const res = await payrollApi.payslip(payrollId);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `Payslip_${MONTH_NAMES[monthNum - 1]}_${yearNum}.pdf`;
      link.click();
      success(`Downloaded payslip for ${MONTH_NAMES[monthNum - 1]} ${yearNum}.`);
    } catch (err) {
      console.error("Error downloading payslip:", err);
      error("Failed to download payslip PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <motion.div id="payslips-section" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.7 }} className="neo-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-base">My Payslips</h3>
          <p className="text-white/40 text-xs">Official monthly salary statements</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center text-white/30 text-xs gap-2">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          Loading payslips...
        </div>
      ) : payslips.length === 0 ? (
        <div className="py-8 text-center text-white/30 text-xs">
          No generated payslips found for this year yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
          {payslips.map((p) => {
            const mLabel = `${MONTH_NAMES[(p.month || 1) - 1]} ${p.year}`;
            const isDown = downloadingId === String(p.payroll_id);
            return (
              <div key={p.payroll_id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors"
                style={{ border:"1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <p className="text-white text-sm font-semibold">{mLabel}</p>
                  <p className="text-green-400 text-xs font-bold">₹{Number(p.final_salary || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.is_paid ? "paid" : "unpaid"} size="sm" />
                  <button onClick={() => handleDownload(String(p.payroll_id), p.month, p.year)}
                    disabled={isDown}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-cyan-400 hover:bg-cyan-400/10 transition-all disabled:opacity-50"
                    title="Download Payslip PDF">
                    {isDown ? <Loader2 size={14} className="animate-spin text-cyan-400" /> : <Download size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Change Password Form ──────────────────────────────────────────────────────
function ChangePasswordForm() {
  const { success, error } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      error("Please fill in both password fields.");
      return;
    }
    try {
      setIsUpdating(true);
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      console.error(err);
      error(err.response?.data?.detail || "Failed to change password. Make sure current password is correct.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.8 }} className="neo-card p-6">
      <h3 className="text-white font-bold text-base mb-1">Change Password</h3>
      <p className="text-white/40 text-xs mb-4">Secure your employee portal credentials</p>
      
      <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3">
        <div>
          <label className="text-white/50 text-[11px] font-medium mb-1 block">Current Password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl"
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <div>
          <label className="text-white/50 text-[11px] font-medium mb-1 block">New Password</label>
          <input
            type="password"
            required
            minLength={4}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl"
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <button
          type="submit"
          disabled={isUpdating}
          className="w-full py-2.5 rounded-xl text-xs font-bold text-black flex items-center justify-center gap-1.5 transition-all mt-2"
          style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}
        >
          {isUpdating ? "Updating..." : "Update Password"}
        </button>
      </form>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { error } = useToast();

  const [activeSection, setActiveSection] = useState<"dashboard" | "attendance" | "leave" | "payslips">("dashboard");

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const [attendance, setAttendance] = useState<any[]>([]);
  const [stats, setStats] = useState({
    present_days: 0,
    absent_days: 0,
    late_days: 0,
    leave_days: 0,
    overtime_hours: 0,
    total_working_hours: 0,
  });
  const [leaveBalance, setLeaveBalance] = useState({
    casual: 0,
    sick: 0,
    paid: 0,
    unpaid: 0,
    total_remaining: 0,
  });
  const [payslips, setPayslips] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [attPage, setAttPage] = useState(1);
  const perPage = 7;

  // Route Guard: redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Data fetching callback
  const loadEmployeeData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingData(true);
      const [attRes, statsRes, balanceRes, payRes] = await Promise.all([
        employeeSelfApi.myAttendance(selectedMonth, selectedYear),
        employeeSelfApi.myStats(selectedMonth, selectedYear),
        employeeSelfApi.myLeaveBalance().catch(() => ({ data: { casual: 0, sick: 0, paid: 0, unpaid: 0, total_remaining: 0 } })),
        employeeSelfApi.myPayroll(selectedYear).catch(() => ({ data: [] })),
      ]);

      setAttendance(attRes.data || []);
      if (statsRes.data) setStats(statsRes.data);
      if (balanceRes.data) setLeaveBalance(balanceRes.data);
      if (payRes.data) setPayslips(payRes.data);
    } catch (err: any) {
      console.error("Error fetching employee dashboard data:", err);
      error("Failed to load employee records.");
    } finally {
      setIsLoadingData(false);
    }
  }, [isAuthenticated, selectedMonth, selectedYear, error]);

  useEffect(() => {
    loadEmployeeData();
  }, [loadEmployeeData]);

  // Real-time WebSocket synchronization
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            ["attendance_updated", "live_attendance", "leave_updated", "leave_approved", "leave_rejected"].includes(
              data.event
            )
          ) {
            loadEmployeeData();
          }
        } catch {}
      };
    } catch {}

    const interval = setInterval(loadEmployeeData, 30000);

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [loadEmployeeData]);

  // Derived user details from authenticated session
  const employeeName = user?.name || "Employee";
  const employeeEmpId = user?.empId || `EMP${String(user?.id || 0).padStart(3, "0")}`;
  const employeeDesignation = user?.designation || "Staff Member";
  const employeeDepartment = user?.department || "General";
  const employeeAvatar = user?.avatar || (employeeName.charAt(0) || "E");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Pagination for real attendance
  const totalPages = Math.max(1, Math.ceil(attendance.length / perPage));
  const paginatedAttendance = attendance.slice((attPage - 1) * perPage, attPage * perPage);

  // Latest Net Salary
  const latestPayslip = payslips.length > 0 ? payslips[0] : null;
  const netSalary = latestPayslip ? Number(latestPayslip.final_salary || 0) : 0;

  // Sidebar navigation click
  const handleNavClick = (section: "dashboard" | "attendance" | "leave" | "payslips") => {
    setActiveSection(section);
    if (section === "dashboard") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.getElementById(`${section}-section`);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0f1e" }}>
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      {/* Employee Sidebar */}
      <aside
        className="fixed left-0 top-0 h-screen w-60 flex flex-col z-30"
        style={{
          background: "rgba(10,15,30,0.95)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 h-16 cursor-pointer"
          onClick={() => handleNavClick("dashboard")}
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg,rgba(0,245,255,0.2),rgba(124,58,237,0.2))",
              border: "1px solid rgba(0,245,255,0.3)",
            }}
          >
            <Fingerprint size={16} className="text-cyan-400" />
          </div>
          <span
            className="font-black text-sm"
            style={{
              background: "linear-gradient(135deg,#00f5ff,#7c3aed)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SmartAttend
          </span>
        </div>

        {/* Functional Nav */}
        <nav className="flex-1 py-4 px-3">
          {[
            { id: "dashboard", label: "Dashboard", icon: <TrendingUp size={16} /> },
            { id: "attendance", label: "Attendance", icon: <CalendarDays size={16} /> },
            { id: "leave", label: "Leave", icon: <Clock size={16} /> },
            { id: "payslips", label: "Payslips", icon: <DollarSign size={16} /> },
          ].map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id as any)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all"
                style={{
                  background: isActive ? "rgba(0,245,255,0.1)" : "transparent",
                  color: isActive ? "#00f5ff" : "rgba(255,255,255,0.4)",
                  border: isActive ? "1px solid rgba(0,245,255,0.2)" : "1px solid transparent",
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="px-3 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div
            className="flex items-center gap-3 px-3 py-3 mt-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
              style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
            >
              {employeeAvatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{employeeName.split(" ")[0]}</p>
              <p className="text-white/40 text-xs truncate">{employeeDesignation}</p>
            </div>
            <button
              onClick={logout}
              className="text-white/30 hover:text-red-400 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header
        className="fixed top-0 right-0 h-16 z-20 flex items-center px-6"
        style={{
          left: "240px",
          background: "rgba(10,15,30,0.85)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
        }}
      >
        <h2 className="text-white font-bold text-lg mr-auto">My Dashboard</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={loadEmployeeData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/50 hover:text-cyan-400 hover:bg-white/5 transition-all"
            title="Refresh real-time data"
          >
            <RefreshCw size={12} className={isLoadingData ? "animate-spin" : ""} />
            Sync
          </button>
          <div className="text-right hidden md:block">
            <p className="text-white/70 text-xs font-mono">{new Date().toLocaleTimeString("en-IN")}</p>
            <p className="text-white/30 text-xs">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="min-h-screen pt-16" style={{ marginLeft: "240px" }}>
        <div className="p-6 lg:p-8">
          {/* Welcome Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-cyan-400/60 text-sm font-medium uppercase tracking-widest mb-1">
              {greeting}
            </p>
            <h1 className="text-3xl font-black text-white">{employeeName} 👋</h1>
            <p className="text-white/40 mt-1">
              {employeeDesignation} · {employeeDepartment} · {employeeEmpId}
            </p>
          </motion.div>

          {/* Real Data Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <EmpStatCard
              title={`Present Days (${MONTH_NAMES[selectedMonth - 1]})`}
              value={stats.present_days}
              icon={<CalendarDays size={18} />}
              color="#22c55e"
              index={0}
            />
            <EmpStatCard
              title="Absent Days"
              value={stats.absent_days}
              icon={<Clock size={18} />}
              color="#ef4444"
              index={1}
            />
            <EmpStatCard
              title="Leave Balance"
              value={leaveBalance.total_remaining}
              suffix=" days"
              icon={<TrendingUp size={18} />}
              color="#3b82f6"
              index={2}
            />
            <EmpStatCard
              title="Net Salary (Latest)"
              value={netSalary}
              prefix="₹"
              icon={<DollarSign size={18} />}
              color="#a78bfa"
              index={3}
            />
          </div>

          {/* Grid: Attendance table + Apply leave */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Attendance Table */}
            <div id="attendance-section" className="xl:col-span-2">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="neo-card overflow-hidden"
              >
                <div
                  className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div>
                    <p className="text-white font-bold">My Attendance</p>
                    <p className="text-white/40 text-xs">
                      {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                    </p>
                  </div>

                  {/* Month/Year selector */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(Number(e.target.value));
                        setAttPage(1);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-white/[0.05] border border-white/10 outline-none"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1} className="bg-[#0a0f1e]">
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(Number(e.target.value));
                        setAttPage(1);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-white/[0.05] border border-white/10 outline-none"
                    >
                      {[today.getFullYear(), today.getFullYear() - 1].map((y) => (
                        <option key={y} value={y} className="bg-[#0a0f1e]">
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        {["Date", "Check-In", "Check-Out", "Hours", "Status"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingData ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-white/30 text-xs">
                            <Loader2 className="animate-spin inline mr-2 text-cyan-400" size={14} />
                            Fetching attendance records...
                          </td>
                        </tr>
                      ) : attendance.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-white/30 text-xs">
                            No attendance punches recorded for this month.
                          </td>
                        </tr>
                      ) : (
                        paginatedAttendance.map((r, i) => (
                          <motion.tr
                            key={r.attendance_id || i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="hover:bg-white/[0.02] transition-colors"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                          >
                            <td className="px-4 py-3 text-white/70 text-sm font-medium">
                              {formatDate(r.date)}
                            </td>
                            <td className="px-4 py-3 text-white/60 text-sm font-mono">
                              {formatTime(r.check_in, true)}
                            </td>
                            <td className="px-4 py-3 text-white/60 text-sm font-mono">
                              {formatTime(r.check_out, true)}
                            </td>
                            <td className="px-4 py-3 text-white/60 text-sm">
                              {r.working_hours ? `${r.working_hours}h` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                status={
                                  r.status === "half_day"
                                    ? "halfday"
                                    : (r.status as "present" | "absent" | "late" | "wfh" | "leave")
                                }
                                size="sm"
                              />
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div
                    className="flex items-center justify-between px-6 py-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p className="text-white/30 text-xs">
                      Page {attPage} of {totalPages}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAttPage((p) => Math.max(1, p - 1))}
                        disabled={attPage === 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/5 transition-all"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        onClick={() => setAttPage((p) => Math.min(totalPages, p + 1))}
                        disabled={attPage === totalPages}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/5 transition-all"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Apply Leave */}
            <ApplyLeaveForm onLeaveSubmitted={loadEmployeeData} />
          </div>

          {/* Bottom row: Chart + Payslips + Change Password */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <WorkingHoursChart
                attendance={attendance}
                monthName={MONTH_NAMES[selectedMonth - 1]}
                year={selectedYear}
              />
            </div>
            <div className="flex flex-col gap-6">
              <MyPayslips payslips={payslips} isLoading={isLoadingData} />
              <ChangePasswordForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
