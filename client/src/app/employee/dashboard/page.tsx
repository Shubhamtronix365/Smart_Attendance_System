"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays, Clock, TrendingUp, DollarSign,
  CheckCircle2, Send, Download, Fingerprint,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { useCountUp } from "@/hooks/useCountUp";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/services/api";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const EMPLOYEE = {
  name: "Arjun Sharma",
  empId: "EMP001",
  designation: "Sr. Software Engineer",
  department: "Engineering",
  avatar: "AS",
  joiningDate: "2022-03-15",
};

const MY_ATTENDANCE = Array.from({ length: 15 }, (_, i) => {
  const d = new Date(2026, 5, i + 1);
  const statuses = ["present","present","present","late","present","wfh","present","absent","present","present"] as const;
  return {
    id: String(i + 1),
    date: d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" }),
    checkIn:  statuses[i % statuses.length] === "absent" ? "—" : `0${8 + (i % 2)}:${String(Math.floor(Math.random()*59)).padStart(2,"0")}`,
    checkOut: statuses[i % statuses.length] === "absent" ? "—" : `1${7 + (i % 2)}:${String(Math.floor(Math.random()*59)).padStart(2,"0")}`,
    hours:    statuses[i % statuses.length] === "absent" ? "—" : `${8 + (i % 2)}h ${Math.floor(Math.random()*59)}m`,
    status:   statuses[i % statuses.length],
  };
});

const WORKING_HOURS_DATA = Array.from({ length: 13 }, (_, i) => ({
  day: `Jun ${i + 1}`,
  hours: 7.5 + Math.random() * 2.5,
}));

const MY_PAYSLIPS = [
  { id:"1", month:"May 2026",  net:89300,  status:"paid" },
  { id:"2", month:"Apr 2026",  net:88500,  status:"paid" },
  { id:"3", month:"Mar 2026",  net:91000,  status:"paid" },
  { id:"4", month:"Feb 2026",  net:87200,  status:"paid" },
];

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Paid Leave", "Maternity Leave", "Unpaid Leave"];

// ─── Stat Card ────────────────────────────────────────────────────────────────
function EmpStatCard({ title, value, suffix = "", icon, color, index }: {
  title: string; value: number; suffix?: string; icon: React.ReactNode; color: string; index: number;
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
      <p className="text-3xl font-black mb-1" style={{ color }}>{count}{suffix}</p>
      <p className="text-white/50 text-sm">{title}</p>
    </motion.div>
  );
}

// ─── Apply Leave Form ─────────────────────────────────────────────────────────
function ApplyLeaveForm() {
  const { success } = useToast();
  const [form, setForm] = useState({ type:"Casual Leave", from:"", to:"", reason:"" });
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    success("Leave request submitted successfully!");
    setTimeout(() => { setSubmitted(false); setForm({ type:"Casual Leave", from:"", to:"", reason:"" }); }, 3000);
  };

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }} className="neo-card p-6">
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
                {LEAVE_TYPES.map(t => <option key={t} value={t} className="bg-[#0a0f1e]">{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[["from","From Date"],["to","To Date"]].map(([k, label]) => (
                <div key={k}>
                  <label className="text-white/50 text-xs font-medium mb-1.5 block">{label}</label>
                  <input type="date" value={form[k as "from"|"to"]} onChange={(e) => set(k as "from"|"to")(e.target.value)} required
                    className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                    style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium mb-1.5 block">Reason</label>
              <textarea value={form.reason} onChange={(e) => set("reason")(e.target.value)} rows={3} required
                placeholder="Briefly explain the reason for leave..."
                className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl resize-none"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
            </div>
            <motion.button type="submit" whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-black"
              style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
              <Send size={14} />Submit Request
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Working Hours Chart ──────────────────────────────────────────────────────
function WorkingHoursChart() {
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.6 }} className="neo-card p-6">
      <h3 className="text-white font-bold text-base mb-1">Working Hours Trend</h3>
      <p className="text-white/40 text-xs mb-5">Daily hours — June 2026</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={WORKING_HOURS_DATA} margin={{ top:5, right:8, left:-28, bottom:0 }}>
          <defs>
            <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#00f5ff" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill:"rgba(255,255,255,0.25)", fontSize:10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[6, 12]} tick={{ fill:"rgba(255,255,255,0.25)", fontSize:10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background:"rgba(10,15,30,0.95)", border:"1px solid rgba(0,245,255,0.2)", borderRadius:"12px", fontSize:"12px" }}
            itemStyle={{ color:"#00f5ff" }}
            formatter={(v: any) => [`${Number(v).toFixed(1)}h`, "Hours"]}
          />
          <Area type="monotone" dataKey="hours" stroke="#00f5ff" strokeWidth={2.5} fill="url(#hoursGrad)"
            dot={{ fill:"#00f5ff", r:3, strokeWidth:0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── My Payslips ──────────────────────────────────────────────────────────────
function MyPayslips() {
  const { success } = useToast();
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.7 }} className="neo-card p-6">
      <h3 className="text-white font-bold text-base mb-4">My Payslips</h3>
      <div className="flex flex-col gap-2">
        {MY_PAYSLIPS.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors"
            style={{ border:"1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <p className="text-white text-sm font-semibold">{p.month}</p>
              <p className="text-green-400 text-xs font-bold">₹{p.net.toLocaleString("en-IN")}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status="paid" size="sm" />
              <button onClick={() => success(`Downloading payslip for ${p.month}...`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-cyan-400 hover:bg-cyan-400/10 transition-all">
                <Download size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
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
  const { user, logout } = useAuth();
  const [attPage, setAttPage] = useState(1);
  const perPage = 7;
  const totalPages = Math.ceil(MY_ATTENDANCE.length / perPage);
  const paginated = MY_ATTENDANCE.slice((attPage - 1) * perPage, attPage * perPage);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const employeeName = user?.name || EMPLOYEE.name;
  const employeeEmpId = user?.empId || EMPLOYEE.empId;
  const employeeDesignation = user?.designation || EMPLOYEE.designation;
  const employeeDepartment = user?.department || EMPLOYEE.department;
  const employeeAvatar = user?.avatar || EMPLOYEE.avatar;

  return (
    <div className="min-h-screen" style={{ background:"#0a0f1e" }}>
      {/* Employee Sidebar (simplified) */}
      <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col z-30"
        style={{ background:"rgba(10,15,30,0.95)", borderRight:"1px solid rgba(255,255,255,0.06)" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16" style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,rgba(0,245,255,0.2),rgba(124,58,237,0.2))", border:"1px solid rgba(0,245,255,0.3)" }}>
            <Fingerprint size={16} className="text-cyan-400" />
          </div>
          <span className="font-black text-sm" style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            SmartAttend
          </span>
        </div>
        {/* Nav */}
        <nav className="flex-1 py-4 px-3">
          {[
            { label:"Dashboard",   icon:<TrendingUp size={16} />, active:true  },
            { label:"Attendance",  icon:<CalendarDays size={16} />, active:false },
            { label:"Leave",       icon:<Clock size={16} />, active:false },
            { label:"Payslips",    icon:<DollarSign size={16} />, active:false },
          ].map(item => (
            <button key={item.label} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all"
              style={{
                background: item.active ? "rgba(0,245,255,0.1)" : "transparent",
                color: item.active ? "#00f5ff" : "rgba(255,255,255,0.4)",
                border: item.active ? "1px solid rgba(0,245,255,0.2)" : "1px solid transparent",
              }}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
        {/* User */}
        <div className="px-3 pb-4" style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 px-3 py-3 mt-3 rounded-xl" style={{ background:"rgba(255,255,255,0.03)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
              style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
              {employeeAvatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{employeeName.split(" ")[0]}</p>
              <p className="text-white/40 text-xs truncate">{employeeDesignation}</p>
            </div>
            <button onClick={logout} className="text-white/30 hover:text-red-400 transition-colors shrink-0" title="Sign out"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed top-0 right-0 h-16 z-20 flex items-center px-6"
        style={{ left:"240px", background:"rgba(10,15,30,0.85)", borderBottom:"1px solid rgba(255,255,255,0.06)", backdropFilter:"blur(20px)" }}>
        <h2 className="text-white font-bold text-lg mr-auto">My Dashboard</h2>
        <div className="text-right hidden md:block">
          <p className="text-white/70 text-xs font-mono">{new Date().toLocaleTimeString("en-IN")}</p>
          <p className="text-white/30 text-xs">{new Date().toLocaleDateString("en-IN", { weekday:"long", month:"long", day:"numeric" })}</p>
        </div>
      </header>

      {/* Main content */}
      <main className="min-h-screen pt-16" style={{ marginLeft:"240px" }}>
        <div className="p-6 lg:p-8">

          {/* Welcome */}
          <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-8">
            <p className="text-cyan-400/60 text-sm font-medium uppercase tracking-widest mb-1">{greeting}</p>
            <h1 className="text-3xl font-black text-white">{employeeName} 👋</h1>
            <p className="text-white/40 mt-1">{employeeDesignation} · {employeeDepartment} · {employeeEmpId}</p>
          </motion.div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <EmpStatCard title="Present Days (June)" value={22} icon={<CalendarDays size={18} />} color="#22c55e" index={0} />
            <EmpStatCard title="Absent Days"          value={2}  icon={<Clock size={18} />}         color="#ef4444" index={1} />
            <EmpStatCard title="Leave Balance"        value={12} suffix=" days" icon={<TrendingUp size={18} />}  color="#3b82f6" index={2} />
            <EmpStatCard title="Net Salary (May)"     value={89300} icon={<DollarSign size={18} />} color="#a78bfa" index={3} />
          </div>

          {/* Grid: Attendance table + Leave form */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

            {/* Attendance table */}
            <div className="xl:col-span-2">
              <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }} className="neo-card overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <p className="text-white font-bold">My Attendance</p>
                    <p className="text-white/40 text-xs">Last 30 days</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        {["Date","Check-In","Check-Out","Hours","Status"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((r, i) => (
                        <motion.tr key={r.id}
                          initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.04 }}
                          className="hover:bg-white/[0.02] transition-colors"
                          style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-3 text-white/60 text-sm">{r.date}</td>
                          <td className="px-4 py-3 text-white/60 text-sm font-mono">{r.checkIn}</td>
                          <td className="px-4 py-3 text-white/60 text-sm font-mono">{r.checkOut}</td>
                          <td className="px-4 py-3 text-white/60 text-sm">{r.hours}</td>
                          <td className="px-4 py-3"><StatusBadge status={r.status as "present"|"absent"|"late"|"wfh"} size="sm" /></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-3" style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-white/30 text-xs">Page {attPage} of {totalPages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setAttPage(p => Math.max(1, p-1))} disabled={attPage === 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/5 transition-all">
                      <ChevronLeft size={13} />
                    </button>
                    <button onClick={() => setAttPage(p => Math.min(totalPages, p+1))} disabled={attPage === totalPages}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/5 transition-all">
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Apply leave */}
            <ApplyLeaveForm />
          </div>

          {/* Bottom row: Chart + Payslips + Change Password */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <WorkingHoursChart />
            </div>
            <div className="flex flex-col gap-6">
              <MyPayslips />
              <ChangePasswordForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
