"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, Calendar, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { leaveApi } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type LeaveStatus = "pending" | "approved" | "rejected";
type LeaveType   = "casual" | "sick" | "paid" | "maternity" | "unpaid";

interface LeaveRequest {
  id: string;
  empId: string;
  name: string;
  department: string;
  avatar: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
}

const LEAVE_TYPE_COLOR: Record<LeaveType, { color: string; bg: string }> = {
  casual:    { color:"#3b82f6", bg:"rgba(59,130,246,0.12)" },
  sick:      { color:"#ef4444", bg:"rgba(239,68,68,0.12)"  },
  paid:      { color:"#22c55e", bg:"rgba(34,197,94,0.12)"  },
  maternity: { color:"#a78bfa", bg:"rgba(167,139,250,0.12)"},
  unpaid:    { color:"#f59e0b", bg:"rgba(245,158,11,0.12)" },
};

// ─── Leave Calendar ───────────────────────────────────────────────────────────
function LeaveCalendar({ leaves }: { leaves: LeaveRequest[] }) {
  const today = new Date();
  const [month, setMonth] = useState(today);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const approvedLeaves = leaves.filter(l => l.status === "approved");

  const getLeavesOnDay = (day: number) => {
    const d = new Date(year, mon, day);
    return approvedLeaves.filter(l => {
      const from = new Date(l.fromDate);
      const to   = new Date(l.toDate);
      return d >= from && d <= to;
    });
  };

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }} className="neo-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-bold">Leave Calendar</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(new Date(year, mon - 1, 1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all">
            <ChevronLeft size={14} />
          </button>
          <span className="text-white/70 text-sm font-medium">
            {month.toLocaleDateString("en-IN", { month:"long", year:"numeric" })}
          </span>
          <button onClick={() => setMonth(new Date(year, mon + 1, 1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} className="text-center text-white/30 text-xs py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const leavesOnDay = getLeavesOnDay(day);
          const isToday = day === new Date().getDate() && mon === new Date().getMonth() && year === new Date().getFullYear();
          return (
            <div key={day} className="relative rounded-lg p-1 min-h-[40px] group"
              style={{
                background: leavesOnDay.length > 0 ? "rgba(255,255,255,0.04)" : "transparent",
                border: isToday ? "1px solid rgba(0,245,255,0.4)" : "1px solid transparent",
              }}>
              <span className="text-xs font-medium" style={{ color: isToday ? "#00f5ff" : "rgba(255,255,255,0.5)" }}>{day}</span>
              {leavesOnDay.slice(0, 2).map((l, i) => {
                const tc = LEAVE_TYPE_COLOR[l.leaveType];
                return (
                  <div key={i} className="mt-0.5 px-1 py-0.5 rounded text-[9px] font-semibold truncate"
                    style={{ background: tc.bg, color: tc.color }}>
                    {l.name.split(" ")[0]}
                  </div>
                );
              })}
              {leavesOnDay.length > 2 && (
                <div className="text-[9px] text-white/30">+{leavesOnDay.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {Object.entries(LEAVE_TYPE_COLOR).map(([type, { color }]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-white/30 text-xs capitalize">{type}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Leave Card ───────────────────────────────────────────────────────────────
function LeaveCard({ leave, index, onApprove, onReject }: {
  leave: LeaveRequest; index: number;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<"approve"|"reject"|null>(null);
  const tc = LEAVE_TYPE_COLOR[leave.leaveType];

  return (
    <motion.div
      layout
      initial={{ opacity:0, y:20 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, x:-30, scale:0.97 }}
      transition={{ delay: index * 0.06, type:"spring", stiffness:200, damping:22 }}
      className="neo-card p-5"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-black shrink-0"
          style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>{leave.avatar}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-white font-bold text-sm">{leave.name}</p>
              <p className="text-white/40 text-xs">{leave.department} · {leave.empId}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                style={{ background: tc.bg, color: tc.color }}>{leave.leaveType}</span>
              <StatusBadge status={leave.status} size="sm" />
            </div>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-4 mb-3 text-xs">
            <div className="flex items-center gap-1.5 text-white/50">
              <Calendar size={12} />
              <span>{new Date(leave.fromDate).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</span>
              {leave.fromDate !== leave.toDate && <>
                <span className="text-white/20">→</span>
                <span>{new Date(leave.toDate).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</span>
              </>}
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <Clock size={12} />
              <span>{leave.days} day{leave.days > 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Reason */}
          <p className="text-white/50 text-xs bg-white/[0.03] rounded-xl px-3 py-2 border border-white/[0.06] mb-4">
            &ldquo;{leave.reason}&rdquo;
          </p>

          {/* Actions (only for pending) */}
          {leave.status === "pending" && (
            <AnimatePresence mode="wait">
              {confirming ? (
                <motion.div key="confirm"
                  initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: confirming === "approve" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border:`1px solid ${confirming === "approve" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <AlertCircle size={14} className={confirming === "approve" ? "text-green-400" : "text-red-400"} />
                  <span className="text-white/70 text-xs flex-1">
                    {confirming === "approve" ? "Approve this leave request?" : "Reject this leave request?"}
                  </span>
                  <button onClick={() => setConfirming(null)} className="text-white/30 hover:text-white/60 text-xs px-2 py-1">Cancel</button>
                  <button
                    onClick={() => { confirming === "approve" ? onApprove(leave.id) : onReject(leave.id); setConfirming(null); }}
                    className="px-3 py-1 rounded-lg text-xs font-bold text-white"
                    style={{ background: confirming === "approve" ? "#22c55e" : "#ef4444" }}>
                    Confirm
                  </button>
                </motion.div>
              ) : (
                <motion.div key="buttons" initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex gap-2">
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                    onClick={() => setConfirming("approve")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-green-400 border border-green-400/25 hover:bg-green-400/10 transition-all">
                    <Check size={12} />Approve
                  </motion.button>
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                    onClick={() => setConfirming("reject")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-red-400 border border-red-400/25 hover:bg-red-400/10 transition-all">
                    <X size={12} />Reject
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
const TABS = ["pending","approved","rejected","all"] as const;

export default function LeavePage() {
  const { success, error } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"pending"|"approved"|"rejected"|"all">("pending");
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaves = useCallback(async () => {
    try {
      const res = await leaveApi.list();
      const mapped = res.data.map((r: any) => {
        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        return {
          id: String(r.leave_id),
          empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
          name: r.employee_name || "Unknown",
          department: r.employee_dept || "General",
          avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          leaveType: r.leave_type as LeaveType,
          fromDate: r.start_date,
          toDate: r.end_date,
          days: days,
          reason: r.reason || "No reason specified",
          status: r.approval_status as LeaveStatus,
          appliedOn: r.created_at ? r.created_at.split("T")[0] : "",
        };
      });
      setLeaves(mapped);
    } catch (err) {
      console.error("Error loading leave requests", err);
      error("Failed to load leave requests.");
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchLeaves();
    // Poll every 30 seconds as a fallback
    const interval = setInterval(fetchLeaves, 30000);

    // WebSocket for real-time leave updates
    let ws: WebSocket | null = null;
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (["leave_updated", "leave_created", "leave_approved", "leave_rejected", "attendance_updated"].includes(data.event)) {
            fetchLeaves();
          }
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [fetchLeaves]);

  const filtered = activeTab === "all" ? leaves : leaves.filter(l => l.status === activeTab);
  const count = (s: typeof activeTab) => s === "all" ? leaves.length : leaves.filter(l => l.status === s).length;

  const approve = async (id: string) => {
    try {
      await leaveApi.approve(id);
      success("Leave request approved.");
      fetchLeaves();
    } catch (err) {
      console.error("Error approving leave", err);
      error("Failed to approve leave request.");
    }
  };
  const reject = async (id: string) => {
    try {
      await leaveApi.reject(id);
      success("Leave request rejected.");
      fetchLeaves();
    } catch (err) {
      console.error("Error rejecting leave", err);
      error("Failed to reject leave request.");
    }
  };

  return (
    <div className="min-h-screen" style={{ background:"#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Leave Management" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Leave Management</h1>
            <p className="text-white/40">Review and manage employee leave requests</p>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="relative flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold capitalize transition-all"
                style={{ color: activeTab === tab ? "black" : "rgba(255,255,255,0.4)" }}>
                {activeTab === tab && (
                  <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-xl"
                    style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}
                    transition={{ type:"spring", stiffness:400, damping:32 }} />
                )}
                <span className="relative">{tab}</span>
                <span className="relative px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{ background: activeTab === tab ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.1)" }}>
                  {count(tab)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Leave cards */}
            <div className="xl:col-span-2 flex flex-col gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                    className="neo-card p-12 text-center">
                    <p className="text-white/30 font-medium">No {activeTab} leave requests</p>
                  </motion.div>
                ) : filtered.map((l, i) => (
                  <LeaveCard key={l.id} leave={l} index={i} onApprove={approve} onReject={reject} />
                ))}
              </AnimatePresence>
            </div>

            {/* Calendar */}
            <div>
              <LeaveCalendar leaves={leaves} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
