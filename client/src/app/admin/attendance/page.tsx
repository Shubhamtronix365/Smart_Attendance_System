"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Download, Plus, Pencil, RefreshCw,
  Clock, Radio, History, FileText,
  Search, ChevronDown, X, Check,
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { attendanceApi, employeesApi } from "@/services/api";
import { formatTime } from "@/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttendanceStatus = "present" | "absent" | "late" | "halfday" | "leave" | "wfh";

interface AttendanceRecord {
  id: string;
  date: string;
  empId: string;
  name: string;
  department: string;
  avatar: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: AttendanceStatus;
  otHours: string;
  lateMinutes?: number;
}


// ─── Manual Entry Modal ───────────────────────────────────────────────────────
function ManualEntryModal({ onClose, onSave }: { onClose: () => void; onSave: (d: any) => void }) {
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    checkIn: "09:00",
    checkOut: "18:00",
    status: "present" as AttendanceStatus
  });

  useEffect(() => {
    employeesApi.list({ size: "100" })
      .then((res) => setEmployeesList(res.data))
      .catch((err) => console.error("Error fetching employees for manual entry", err));
  }, []);

  const s = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!selectedEmpId) return;
    onSave({
      employee_id: Number(selectedEmpId),
      date: form.date,
      check_in: form.checkIn ? `${form.date}T${form.checkIn}:00` : null,
      check_out: form.checkOut ? `${form.date}T${form.checkOut}:00` : null,
      status: form.status === "halfday" ? "half_day" : form.status
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ background: "rgba(10,15,30,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 className="text-white font-black text-lg">Manual Attendance Entry</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"><X size={16} /></button>
        </div>
        <div className="px-7 py-5 grid gap-4">
          <div>
            <label className="text-white/50 text-xs font-medium mb-1.5 block">Select Employee</label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl appearance-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="" className="bg-[#0a0f1e]">Choose Employee...</option>
              {employeesList.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id} className="bg-[#0a0f1e]">
                  {emp.name} (ID: {emp.employee_id})
                </option>
              ))}
            </select>
          </div>

          {[
            { label: "Date", key: "date" as const, type: "date", placeholder: "" },
            { label: "Check-In Time", key: "checkIn" as const, type: "time", placeholder: "" },
            { label: "Check-Out Time", key: "checkOut" as const, type: "time", placeholder: "" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-white/50 text-xs font-medium mb-1.5 block">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => s(key)(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>
          ))}
          <div>
            <label className="text-white/50 text-xs font-medium mb-1.5 block">Status</label>
            <select value={form.status} onChange={(e) => s("status")(e.target.value)}
              className="w-full px-4 py-2.5 text-white text-sm outline-none rounded-xl appearance-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {(["present", "absent", "late", "halfday", "leave", "wfh"] as AttendanceStatus[]).map((s) => (
                <option key={s} value={s} className="bg-[#0a0f1e] capitalize">{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 px-7 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all border border-white/10">Cancel</button>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-black"
            style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
          >Save Entry</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Edit Inline Popover ──────────────────────────────────────────────────────
function EditCell({ record, onSave }: { record: AttendanceRecord; onSave: (updated: AttendanceRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState({ checkIn: record.checkIn, checkOut: record.checkOut, status: record.status });

  if (!editing) return (
    <button onClick={() => setEditing(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-cyan-400 hover:bg-cyan-400/10 transition-all opacity-0 group-hover:opacity-100">
      <Pencil size={12} />
    </button>
  );

  return (
    <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
      className="absolute right-0 top-full z-20 w-56 rounded-2xl p-4 mt-1"
      style={{ background:"rgba(10,15,30,0.98)", border:"1px solid rgba(0,245,255,0.2)", boxShadow:"0 16px 40px rgba(0,0,0,0.5)", backdropFilter:"blur(20px)" }}>
      <p className="text-white/50 text-xs mb-3">Edit — {record.name}</p>
      {(["checkIn","checkOut"] as const).map((k) => (
        <div key={k} className="mb-2">
          <label className="text-white/30 text-[10px] mb-1 block capitalize">{k === "checkIn" ? "Check-In" : "Check-Out"}</label>
          <input type="time" value={val[k]} onChange={(e) => setVal(v => ({ ...v, [k]: e.target.value }))}
            className="w-full px-3 py-1.5 text-white text-xs outline-none rounded-lg"
            style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)" }} />
        </div>
      ))}
      <div className="mb-3">
        <label className="text-white/30 text-[10px] mb-1 block">Status</label>
        <select value={val.status} onChange={(e) => setVal(v => ({ ...v, status: e.target.value as AttendanceStatus }))}
          className="w-full px-3 py-1.5 text-white text-xs outline-none rounded-lg appearance-none"
          style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)" }}>
          {(["present","absent","late","halfday","leave","wfh"] as AttendanceStatus[]).map((s) => (
            <option key={s} value={s} className="bg-[#0a0f1e]">{s}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-lg text-xs text-white/40 hover:bg-white/5 border border-white/10 transition-all">Cancel</button>
        <button onClick={() => { onSave({ ...record, ...val }); setEditing(false); }}
          className="flex-1 py-1.5 rounded-lg text-xs font-bold text-black"
          style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>Save</button>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { success, error } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayIso = now.toISOString().split("T")[0];

  const [viewMode, setViewMode] = useState<"live" | "historical">("live");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [liveStats, setLiveStats] = useState({ total: 0, present: 0, absent: 0, late: 0, leave: 0 });

  // Calculate day 1 and last day of selected month
  const getMonthDateRange = (monthValue: string) => {
    const parts = monthValue.split("-");
    const y = parseInt(parts[0], 10) || new Date().getFullYear();
    const m = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      startDate: `${parts[0]}-${String(m).padStart(2, "0")}-01`,
      endDate: `${parts[0]}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      lastDay,
      year: y,
      month: m,
    };
  };

  const fetchAttendance = useCallback(async () => {
    setIsLoading(true);
    try {
      let res;
      if (viewMode === "live") {
        const todayStr = new Date().toISOString().split("T")[0];
        const [attRes, statsRes] = await Promise.all([
          attendanceApi.list(todayStr, { size: "500" }),
          attendanceApi.stats().catch(() => ({ data: { total: 0, present: 0, absent: 0, late: 0, leave: 0 } }))
        ]);
        res = attRes;
        setLiveStats(statsRes.data);
      } else {
        const { startDate, endDate } = getMonthDateRange(selectedMonth);
        res = await attendanceApi.list({ start_date: startDate, end_date: endDate, size: "1000" });
      }
      
      const mapped = res.data.map((r: any) => {
        const mappedStatus = r.status === "half_day" ? "halfday" : r.status;
        const dateStr = r.date ? (typeof r.date === "string" ? r.date.split("T")[0] : String(r.date)) : "";
        
        return {
          id: String(r.attendance_id),
          date: dateStr,
          empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
          name: r.employee_name || "Unknown",
          department: r.employee_dept || "N/A",
          avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          checkIn: formatTime(r.check_in, true),
          checkOut: formatTime(r.check_out, true),
          workingHours: r.working_hours ? `${r.working_hours}h` : "—",
          status: mappedStatus as AttendanceStatus,
          otHours: r.overtime_hours && Number(r.overtime_hours) > 0 ? `${r.overtime_hours}h` : "—",
          lateMinutes: r.late_minutes ? Number(r.late_minutes) : 0,
        };
      });
      setRecords(mapped);
    } catch (err) {
      console.error("Error loading attendance:", err);
      error("Failed to load attendance records.");
    } finally {
      setIsLoading(false);
    }
  }, [viewMode, selectedMonth, error]);

  useEffect(() => {
    fetchAttendance();

    let ws: WebSocket | null = null;
    try {
      if (typeof window !== "undefined") {
        let wsUrl = "";
        if (process.env.NEXT_PUBLIC_API_URL) {
          const apiBase = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws");
          wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
        } else {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const host = window.location.hostname || "localhost";
          wsUrl = `${protocol}//${host}:8000/ws/client`;
        }
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "attendance_updated" || data.event === "live_attendance") {
              fetchAttendance();
            }
          } catch (e) {
            // ignore
          }
        };
      }
    } catch (err) {
      console.warn("Attendance WS init error", err);
    }

    let interval: NodeJS.Timeout | null = null;
    if (viewMode === "live") {
      interval = setInterval(fetchAttendance, 15000);
    }
    return () => {
      if (ws) ws.close();
      if (interval) clearInterval(interval);
    };
  }, [viewMode, selectedMonth, fetchAttendance]);

  const filtered = records.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.empId.toLowerCase().includes(search.toLowerCase()) ||
    r.date.includes(search)
  );

  const handleExport = async (format: "excel" | "pdf") => {
    try {
      if (viewMode === "live") {
        const todayStr = new Date().toISOString().split("T")[0];
        success(`Generating today's live attendance export in ${format.toUpperCase()}...`);
        const res = await attendanceApi.export(todayStr, format);
        const blob = new Blob([res.data], { type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = `Live_Attendance_${todayStr}.${format === "pdf" ? "pdf" : "xlsx"}`;
        link.click();
        success("Today's live attendance downloaded.");
      } else {
        const { startDate, endDate } = getMonthDateRange(selectedMonth);
        success(`Generating historical monthly export (${startDate} to ${endDate}) in ${format.toUpperCase()}...`);
        const res = await attendanceApi.export({ start_date: startDate, end_date: endDate, format });
        const blob = new Blob([res.data], { type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = `Historical_Attendance_${startDate}_to_${endDate}.${format === "pdf" ? "pdf" : "xlsx"}`;
        link.click();
        success("Historical monthly attendance downloaded.");
      }
    } catch (err) {
      console.error("Error exporting report:", err);
      error("Failed to download export.");
    }
  };

  const handleSaveManual = async (backendData: any) => {
    try {
      await attendanceApi.create(backendData);
      success("Manual attendance record added.");
      fetchAttendance();
    } catch (err: any) {
      console.error("Error creating attendance", err);
      error(err.response?.data?.detail || "Failed to add attendance.");
    }
  };

  const handleEditSave = useCallback(async (updated: AttendanceRecord) => {
    try {
      const cleanTime = (t: string) => (t && t !== "—") ? t : null;
      const cIn = cleanTime(updated.checkIn);
      const cOut = cleanTime(updated.checkOut);
      const targetDate = updated.date || todayIso;
      
      const backendData = {
        check_in: cIn ? `${targetDate}T${cIn}:00` : null,
        check_out: cOut ? `${targetDate}T${cOut}:00` : null,
        status: updated.status === "halfday" ? "half_day" : updated.status,
      };
      await attendanceApi.update(updated.id, backendData);
      success("Attendance record updated.");
      fetchAttendance();
    } catch (err: any) {
      console.error("Error updating attendance", err);
      error(err.response?.data?.detail || "Failed to update attendance.");
    }
  }, [todayIso, fetchAttendance, success, error]);

  // Summary counters from liveStats (when live) or records (historical)
  const summary = viewMode === "live" && liveStats.total > 0
    ? liveStats
    : {
        present: records.filter(r => ["present", "late", "halfday", "wfh"].includes(r.status)).length,
        absent:  records.filter(r => r.status === "absent").length,
        late:    records.filter(r => r.status === "late" || ((r.lateMinutes || 0) > 0)).length,
        leave:   records.filter(r => r.status === "leave").length,
      };


  return (
    <div className="min-h-screen" style={{ background:"#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Attendance" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">

          {/* Header */}
          <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Attendance Management</h1>
            <p className="text-white/40">Track and manage daily attendance records</p>
          </motion.div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label:"Present",  value: summary.present, color:"#22c55e" },
              { label:"Absent",   value: summary.absent,  color:"#ef4444" },
              { label:"Late",     value: summary.late,    color:"#f59e0b" },
              { label:"On Leave", value: summary.leave,   color:"#a78bfa" },
            ].map(({ label, value, color }, i) => (
              <motion.div key={label}
                initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.08 }}
                className="neo-card px-5 py-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0"
                  style={{ background:`${color}15`, border:`1px solid ${color}30`, color }}>
                  {value}
                </div>
                <span className="text-white/50 text-sm">{label}</span>
              </motion.div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {/* Live / Historical toggle */}
            <div className="flex rounded-xl overflow-hidden" style={{ border:"1px solid rgba(255,255,255,0.1)" }}>
              {(["live","historical"] as const).map((mode) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all"
                  style={{
                    background: viewMode === mode ? "linear-gradient(135deg,#00f5ff,#7c3aed)" : "rgba(255,255,255,0.03)",
                    color: viewMode === mode ? "black" : "rgba(255,255,255,0.5)",
                  }}>
                  {mode === "live" ? <Radio size={13} /> : <History size={13} />}
                  {mode === "live" ? "Today Live" : "Historical (Month)"}
                </button>
              ))}
            </div>

            {/* Date / Month Picker */}
            {viewMode === "live" ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-semibold">Today:</span>
                <span className="text-white/80 font-mono">{todayIso}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex items-center">
                  <Calendar size={14} className="absolute left-3 text-white/40 pointer-events-none" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="pl-9 pr-3 py-2 text-white text-xs font-medium outline-none rounded-xl"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(0,245,255,0.3)" }}
                  />
                </div>
                <div className="px-3 py-1.5 rounded-xl text-[11px] font-medium text-cyan-300"
                  style={{ background: "rgba(0,245,255,0.08)", border: "1px solid rgba(0,245,255,0.2)" }}>
                  Day 1 ({getMonthDateRange(selectedMonth).startDate}) → End ({getMonthDateRange(selectedMonth).endDate})
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input type="text" placeholder="Search employee, ID, or date..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-white text-sm outline-none rounded-xl"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}
                onFocus={(e)=>(e.currentTarget.style.borderColor="rgba(0,245,255,0.4)")}
                onBlur={(e)=>(e.currentTarget.style.borderColor="rgba(255,255,255,0.1)")} />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto w-full sm:w-auto">
              {/* Manual entry */}
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/70 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all"
                style={{ background:"rgba(255,255,255,0.03)" }}>
                <Plus size={14} />
                Manual Entry
              </motion.button>

              {/* Export Excel */}
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => handleExport("excel")}
                title={viewMode === "live" ? "Download today's attendance Excel" : `Download full month (${getMonthDateRange(selectedMonth).startDate} to ${getMonthDateRange(selectedMonth).endDate}) Excel`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/70 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all"
                style={{ background:"rgba(255,255,255,0.03)" }}>
                <Download size={14} />
                Excel {viewMode === "historical" ? "(Month)" : "(Today)"}
              </motion.button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => handleExport("pdf")}
                title={viewMode === "live" ? "Download today's attendance PDF" : `Download full month (${getMonthDateRange(selectedMonth).startDate} to ${getMonthDateRange(selectedMonth).endDate}) PDF`}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
                <FileText size={14} />
                PDF {viewMode === "historical" ? "(Month)" : "(Today)"}
              </motion.button>
            </div>
          </div>

          {/* Live badge or Month badge */}
          {viewMode === "live" ? (
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400/80 text-xs font-semibold">Today Live Feed — auto-refreshing & listening to real-time biometric logs</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-cyan-400/80 text-xs font-semibold">
                Historical Records — Showing all attendance from Day 1 ({getMonthDateRange(selectedMonth).startDate}) to End of Month ({getMonthDateRange(selectedMonth).endDate})
              </span>
            </div>
          )}

          {/* Table */}
          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }} className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                    {(viewMode === "historical"
                      ? ["Date","Employee","Check-In","Check-Out","Working Hours","Status","OT Hours",""]
                      : ["Employee","Check-In","Check-Out","Working Hours","Status","OT Hours",""]
                    ).map(h => (
                      <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <LoadingSkeleton rows={8} cols={viewMode === "historical" ? 8 : 7} />
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === "historical" ? 8 : 7} className="text-center py-16 text-white/40 text-sm">
                        No attendance records found for {viewMode === "live" ? "today" : `${selectedMonth} (Day 1 to ${getMonthDateRange(selectedMonth).lastDay})`}.
                        <br />
                        <span className="text-xs text-white/20 mt-1 block">Biometric punches and manual logs will display here automatically.</span>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                    <motion.tr key={r.id}
                      initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group hover:bg-white/[0.02] transition-colors"
                      style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      {viewMode === "historical" && (
                        <td className="px-4 py-3.5 text-cyan-300/80 text-xs font-mono whitespace-nowrap">
                          {r.date || "—"}
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
                            style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>{r.avatar}</div>
                          <div>
                            <p className="text-white text-sm font-semibold">{r.name}</p>
                            <p className="text-white/30 text-xs">{r.department} · {r.empId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-white/70 text-sm font-mono">
                        <div>
                          <span>{r.checkIn}</span>
                          {((r.lateMinutes && r.lateMinutes > 0) || r.status === "late") && (
                            <span className="block text-[11px] text-amber-400 font-sans font-medium mt-0.5">
                              Late by {r.lateMinutes ? (r.lateMinutes >= 60 ? `${Math.floor(r.lateMinutes / 60)}h ${r.lateMinutes % 60}m` : `${r.lateMinutes}m`) : "—"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-white/70 text-sm font-mono">{r.checkOut}</td>
                      <td className="px-4 py-3.5 text-white/60 text-sm">{r.workingHours}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3.5">
                        {r.otHours !== "—" ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background:"rgba(167,139,250,0.1)", color:"#a78bfa" }}>{r.otHours}</span>
                        ) : <span className="text-white/20 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3.5 relative">
                        <EditCell record={r} onSave={handleEditSave} />
                      </td>
                    </motion.tr>
                  )))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {showModal && <ManualEntryModal onClose={() => setShowModal(false)} onSave={handleSaveManual} />}
      </AnimatePresence>
    </div>
  );
}

