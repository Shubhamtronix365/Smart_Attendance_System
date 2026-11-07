"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  MessageSquare,
  X,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import StatusBadge from "@/components/StatusBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { employeeSelfApi, amendmentApi } from "@/services/api";
import { formatTime, formatDate } from "@/utils/formatters";
import CheckoutHistoryModal from "@/components/CheckoutHistoryModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeeAttendancePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error } = useToast();

  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  // Dispute modal state
  const [disputeRecord, setDisputeRecord] = useState<any>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

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

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeRecord || !disputeReason.trim()) {
      error("Please enter your reason or explanation.");
      return;
    }
    setIsSubmittingDispute(true);
    try {
      await amendmentApi.submitLate({
        attendance_id: disputeRecord.attendance_id,
        reason: disputeReason.trim(),
      });
      success("Late mark explanation submitted for admin review.");
      setDisputeRecord(null);
      setDisputeReason("");
      loadData();
    } catch (err: any) {
      console.error("Error submitting dispute", err);
      error(err.response?.data?.detail || "Failed to submit dispute.");
    } finally {
      setIsSubmittingDispute(false);
    }
  };

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

      <main className="pt-20 pb-12 px-4 sm:px-6 md:ml-60 max-w-7xl mx-auto space-y-6">
        {/* Month Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-[#0a0f1e] text-white text-sm font-semibold px-4 py-2 rounded-xl border border-white/10 outline-none focus:border-cyan-400"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[#0a0f1e] text-white text-sm font-semibold px-4 py-2 rounded-xl border border-white/10 outline-none focus:border-cyan-400"
            >
              {[2026, 2025, 2024].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-white/40" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0a0f1e] text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="halfday">Half Day</option>
              <option value="absent">Absent</option>
              <option value="weekly_off">Weekly Off</option>
            </select>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Present Days</p>
              <p className="text-2xl font-bold text-green-400 mt-1 font-mono">{stats.present_days || 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Late Days</p>
              <p className="text-2xl font-bold text-amber-400 mt-1 font-mono">{stats.late_days || 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Absent Days</p>
              <p className="text-2xl font-bold text-red-400 mt-1 font-mono">{stats.absent_days || 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Total Overtime</p>
              <p className="text-2xl font-bold text-purple-400 mt-1 font-mono">{stats.total_overtime_hours || 0}h</p>
            </div>
          </div>
        )}

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
            <table className="w-full min-w-[680px] text-left text-xs">
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
                    const isSunday = punchDate.getDay() === 0;
                    const isLate = (r.late_minutes && Number(r.late_minutes) > 0) || r.status?.toLowerCase() === "late";

                    return (
                      <tr key={r.attendance_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-6 font-medium text-white whitespace-nowrap">
                          <div>
                            <span>{formatDate(r.date)}</span>
                            <span className="ml-1.5 text-white/30 font-normal">({dayName})</span>
                            {isSunday && (
                              <span className="block text-[10px] text-amber-400 font-sans font-semibold mt-0.5">
                                Sunday (Record Only - 0 OT)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-cyan-300">
                          <div>
                            <span>{r.check_in ? formatTime(r.check_in) : "--:--"}</span>
                            {isLate && (
                              <div>
                                <span className="block text-[10px] text-amber-400 font-sans font-medium mt-0.5">
                                  Late by {r.late_minutes ? (Number(r.late_minutes) >= 60 ? `${Math.floor(Number(r.late_minutes) / 60)}h ${Number(r.late_minutes) % 60}m` : `${r.late_minutes}m`) : "—"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDisputeRecord(r);
                                    setDisputeReason("");
                                  }}
                                  className="text-[10px] text-amber-300 hover:text-amber-200 underline font-sans flex items-center gap-1 mt-0.5"
                                >
                                  <MessageSquare size={10} /> Explain Late Mark
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-white/70">
                          <div>
                            {r.check_in && !r.check_out ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                Active Session
                              </span>
                            ) : (
                              <span>{r.check_out ? formatTime(r.check_out) : "--:--"}</span>
                            )}
                            {r.checkout_count && r.checkout_count > 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedRecord({
                                  id: String(r.attendance_id),
                                  date: r.date,
                                  empId: user?.employee_code || `EMP${String(r.employee_id).padStart(3, "0")}`,
                                  name: user?.name || "Employee",
                                  department: user?.department || "General",
                                  avatar: (user?.name || "??").slice(0, 2).toUpperCase(),
                                  checkIn: r.check_in ? formatTime(r.check_in) : "—",
                                  checkOut: r.check_out ? formatTime(r.check_out) : "—",
                                  workingHours: r.working_hours ? `${r.working_hours}h` : "—",
                                  status: r.status,
                                  otHours: r.overtime_hours ? `${r.overtime_hours}h` : "—",
                                  checkoutCount: r.checkout_count,
                                  punches: r.punches ? (typeof r.punches === "string" ? JSON.parse(r.punches) : r.punches) : [],
                                })}
                                className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-sans font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer shadow-sm group"
                              >
                                <Clock size={11} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                                <span>{r.checkout_count} checkout{r.checkout_count > 1 ? "s" : ""}</span>
                                <span className="text-[9px] text-cyan-400/80 underline ml-0.5">view times</span>
                              </button>
                            ) : null}
                          </div>
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

      {/* Checkout History Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <CheckoutHistoryModal
            isOpen={!!selectedRecord}
            onClose={() => setSelectedRecord(null)}
            record={selectedRecord}
            isAdmin={false}
          />
        )}
      </AnimatePresence>

      {/* Late Mark Dispute Modal */}
      <AnimatePresence>
        {disputeRecord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-amber-500/30 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-base flex items-center gap-2">
                  <AlertCircle size={18} className="text-amber-400" /> Late Mark Explanation
                </h3>
                <button onClick={() => setDisputeRecord(null)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitDispute} className="pt-4 space-y-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                  <p className="text-white/60">
                    Attendance Date: <strong className="text-white">{disputeRecord.date}</strong>
                  </p>
                  <p className="text-amber-300 mt-1">
                    Check-in was logged at {formatTime(disputeRecord.check_in)}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Reason / Explanation for Late Check-In *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide detailed explanation (e.g. client meeting offsite, transport delay, medical emergency)..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex gap-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setDisputeRecord(null)}
                    className="flex-1 py-2 rounded-xl text-xs text-white/60 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDispute}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-black"
                    style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                  >
                    {isSubmittingDispute ? "Submitting..." : "Submit Explanation"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
