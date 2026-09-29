"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CalendarCheck,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Fingerprint,
  Radio,
  Globe,
  Loader2,
  Filter,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { employeeSelfApi } from "@/services/api";
import { formatTime, formatDate } from "@/utils/formatters";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeeAttendancePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { error } = useToast();

  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [attRes, statsRes] = await Promise.all([
        employeeSelfApi.myAttendance(selectedMonth, selectedYear),
        employeeSelfApi.myStats(selectedMonth, selectedYear),
      ]);
      setAttendanceRecords(attRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error("Failed to load attendance", err);
      error("Unable to load attendance records for selected period.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear, error]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === "all") return attendanceRecords;
    return attendanceRecords.filter((r) => r.status?.toLowerCase() === statusFilter.toLowerCase());
  }, [attendanceRecords, statusFilter]);

  if (authLoading || (!user && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <EmployeeSidebar />
      <EmployeeTopBar
        title="My Attendance"
        subtitle="View your daily check-in logs, biometric punches, and working hours"
        onRefresh={loadData}
        isRefreshing={isLoading}
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        {/* Filter & Period Selector Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-white">Attendance Log</h2>
            <p className="text-white/40 text-xs mt-0.5">
              Showing records for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
              <Calendar size={13} className="text-cyan-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-white outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1} className="bg-[#0a0f1e] text-white">
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white outline-none cursor-pointer ml-1"
              >
                {[2024, 2025, 2026, 2027].map((yr) => (
                  <option key={yr} value={yr} className="bg-[#0a0f1e] text-white">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
              <Filter size={13} className="text-white/40" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0a0f1e] text-white">All Statuses</option>
                <option value="present" className="bg-[#0a0f1e] text-white">Present (On-time)</option>
                <option value="late" className="bg-[#0a0f1e] text-white">Late</option>
                <option value="half_day" className="bg-[#0a0f1e] text-white">Half Day</option>
                <option value="leave" className="bg-[#0a0f1e] text-white">Leave</option>
              </select>
            </div>
          </div>
        </div>

        {/* Monthly Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">Days Attended</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-400">{stats?.present_days ?? 0}</p>
            <p className="text-[10px] text-white/40 mt-1">
              {stats?.on_time_days ?? 0} on-time · {stats?.late_days ?? 0} late
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">Late Arrivals</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <AlertCircle size={14} />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-400">{stats?.late_days ?? 0}</p>
            <p className="text-[10px] text-white/40 mt-1">Punched after start threshold</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">Total Hours</span>
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Clock size={14} />
              </div>
            </div>
            <p className="text-2xl font-black text-cyan-400">{stats?.total_working_hours ?? 0}h</p>
            <p className="text-[10px] text-white/40 mt-1">Logged working time</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">Overtime</span>
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <TrendingUp size={14} />
              </div>
            </div>
            <p className="text-2xl font-black text-purple-400">{stats?.overtime_hours ?? 0}h</p>
            <p className="text-[10px] text-white/40 mt-1">1.5x pay multiplier</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col col-span-2 lg:col-span-1"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">Working Days</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <CalendarDays size={14} />
              </div>
            </div>
            <p className="text-2xl font-black text-white">{stats?.working_days_total ?? 0}</p>
            <p className="text-[10px] text-white/40 mt-1">{stats?.working_days_elapsed ?? 0} days elapsed</p>
          </motion.div>
        </div>

        {/* Attendance Records Table */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Daily Punch History</h3>
            </div>
            <span className="text-xs text-white/40">
              {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"} found
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-white/40 uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Check In</th>
                  <th className="py-3.5 px-6">Check Out</th>
                  <th className="py-3.5 px-6">Working Hours</th>
                  <th className="py-3.5 px-6">Overtime</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Punch Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <LoadingSkeleton rows={6} cols={7} />
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <CalendarDays className="mx-auto mb-3 text-white/20" size={36} />
                      <p className="text-white/60 text-sm font-medium">No attendance recorded</p>
                      <p className="text-white/30 text-xs mt-1">
                        No check-in entries found for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r: any) => {
                    const punchDate = new Date(r.date + "T00:00:00");
                    const dayName = punchDate.toLocaleDateString("en-IN", { weekday: "short" });

                    return (
                      <tr key={r.attendance_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-6 font-medium text-white whitespace-nowrap">
                          {formatDate(r.date)}
                          <span className="ml-1.5 text-white/30 font-normal">({dayName})</span>
                        </td>
                        <td className="py-4 px-6 font-mono text-cyan-300">
                          {r.check_in ? formatTime(r.check_in) : "--:--"}
                        </td>
                        <td className="py-4 px-6 font-mono text-white/70">
                          {r.check_out ? formatTime(r.check_out) : "--:--"}
                        </td>
                        <td className="py-4 px-6 font-mono font-semibold text-white">
                          {r.working_hours ? `${r.working_hours}h` : "--"}
                        </td>
                        <td className="py-4 px-6 font-mono text-purple-400">
                          {r.overtime_hours && Number(r.overtime_hours) > 0 ? `+${r.overtime_hours}h` : "-"}
                        </td>
                        <td className="py-4 px-6">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                            {r.source === "biometric" && (
                              <>
                                <Fingerprint size={13} className="text-cyan-400" />
                                <span>Biometric R307</span>
                              </>
                            )}
                            {r.source === "rfid" && (
                              <>
                                <Radio size={13} className="text-emerald-400" />
                                <span>RFID Card</span>
                              </>
                            )}
                            {(r.source === "manual" || r.source === "web" || !r.source) && (
                              <>
                                <Globe size={13} className="text-purple-400" />
                                <span>Web Portal</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
        </div>
      </main>
    </div>
  );
}
