"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  X,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Calendar,
  Filter,
} from "lucide-react";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { amendmentApi, employeeSelfApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/utils/formatters";

interface LateDispute {
  amendment_id: number;
  attendance_id: number;
  employee_id: number;
  employee_name?: string;
  attendance_date?: string;
  original_late_minutes?: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_comments?: string;
  reviewed_by_name?: string;
  created_at: string;
  reviewed_at?: string;
}

export default function EmployeeAmendmentsPage() {
  const { success, error } = useToast();
  const [disputes, setDisputes] = useState<LateDispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Submit Modal state
  const [showModal, setShowModal] = useState(false);
  const [lateRecords, setLateRecords] = useState<any[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await amendmentApi.listLate();
      setDisputes(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("Error loading disputes", err);
      error("Failed to load your disputes & amendments history.");
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const openNewDisputeModal = async () => {
    setShowModal(true);
    setSelectedAttendanceId(null);
    setReason("");
    setIsLoadingRecords(true);

    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      const [resCurrent, resPrev] = await Promise.allSettled([
        employeeSelfApi.myAttendance(currentMonth, currentYear),
        employeeSelfApi.myAttendance(prevMonth, prevYear),
      ]);

      const currentList = resCurrent.status === "fulfilled" && Array.isArray(resCurrent.value.data) ? resCurrent.value.data : [];
      const prevList = resPrev.status === "fulfilled" && Array.isArray(resPrev.value.data) ? resPrev.value.data : [];

      const combined = [...currentList, ...prevList];
      const lateOnly = combined.filter((r: any) => {
        const isLate = (r.late_minutes && Number(r.late_minutes) > 0) || r.status?.toLowerCase() === "late";
        return isLate;
      });

      // Sort by date descending
      lateOnly.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLateRecords(lateOnly);

      if (lateOnly.length > 0) {
        setSelectedAttendanceId(lateOnly[0].attendance_id);
      }
    } catch (err) {
      console.error("Error fetching late records", err);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAttendanceId) {
      error("Please select a late attendance record to dispute.");
      return;
    }
    if (!reason.trim()) {
      error("Please provide your justification or explanation.");
      return;
    }

    setIsSubmitting(true);
    try {
      await amendmentApi.submitLate({
        attendance_id: selectedAttendanceId,
        reason: reason.trim(),
      });
      success("Late mark explanation submitted successfully for admin review.");
      setShowModal(false);
      setReason("");
      setSelectedAttendanceId(null);
      fetchDisputes();
    } catch (err: any) {
      console.error("Error submitting amendment", err);
      error(err.response?.data?.detail || "Failed to submit dispute explanation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = disputes.filter((d) => {
    if (statusFilter !== "all" && d.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.reason.toLowerCase().includes(s) ||
      (d.attendance_date && d.attendance_date.includes(s)) ||
      (d.reviewer_comments && d.reviewer_comments.toLowerCase().includes(s))
    );
  });

  const totalSubmitted = disputes.length;
  const totalPending = disputes.filter((d) => d.status === "pending").length;
  const totalApproved = disputes.filter((d) => d.status === "approved").length;
  const totalRejected = disputes.filter((d) => d.status === "rejected").length;

  const formatLateMinutes = (mins?: number) => {
    if (!mins || mins <= 0) return "Late arrival";
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `Late by ${h}h ${m}m` : `Late by ${h}h`;
    }
    return `Late by ${mins}m`;
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <EmployeeSidebar />
      <EmployeeTopBar title="Disputes & Amendments" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <AlertCircle className="text-amber-400" /> Late Mark Disputes & Amendments
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Track your submitted justifications for late arrivals, review feedback, and penalty waiver status.
              </p>
            </div>
            <button
              onClick={openNewDisputeModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer self-start sm:self-auto"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              <Plus size={16} /> Submit Late Dispute
            </button>
          </div>

          {/* Stats KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold block mb-1">
                Total Submitted
              </span>
              <span className="text-2xl font-bold font-mono text-white">{totalSubmitted}</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-xs text-amber-300/80 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1.5">
                <Clock size={12} /> Pending Review
              </span>
              <span className="text-2xl font-bold font-mono text-amber-300">{totalPending}</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs text-emerald-300/80 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Approved (Waived)
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-300">{totalApproved}</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-xs text-rose-300/80 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1.5">
                <XCircle size={12} /> Rejected
              </span>
              <span className="text-2xl font-bold font-mono text-rose-300">{totalRejected}</span>
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-3xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
            {/* Filter Bar */}
            <div className="p-4 border-b border-white/10 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex items-center gap-2 w-full md:w-auto">
                {(["all", "pending", "approved", "rejected"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search reasons or notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400 placeholder:text-white/20"
                />
              </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white/80">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/40 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Dispute ID</th>
                    <th className="px-4 py-3.5 font-semibold">Attendance Date</th>
                    <th className="px-4 py-3.5 font-semibold">Late Duration</th>
                    <th className="px-4 py-3.5 font-semibold">My Explanation</th>
                    <th className="px-4 py-3.5 font-semibold">Status</th>
                    <th className="px-4 py-3.5 font-semibold">Admin Feedback</th>
                    <th className="px-4 py-3.5 font-semibold">Submitted On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-white/40">
                        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
                        Loading disputes history...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-white/40">
                        <MessageSquare size={32} className="mx-auto mb-2 text-white/20" />
                        No dispute amendments found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((d) => (
                      <tr key={d.amendment_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-4 font-mono text-xs text-white/40">#{d.amendment_id}</td>
                        <td className="px-4 py-4 font-mono font-medium text-white whitespace-nowrap">
                          {d.attendance_date ? formatDate(d.attendance_date) : "—"}
                        </td>
                        <td className="px-4 py-4 font-mono text-amber-300 font-semibold whitespace-nowrap">
                          {formatLateMinutes(d.original_late_minutes)}
                        </td>
                        <td className="px-4 py-4 text-xs text-white/80 max-w-xs break-words">
                          {d.reason}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                              d.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : d.status === "rejected"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            }`}
                          >
                            {d.status === "approved" ? (
                              <>
                                <CheckCircle2 size={12} /> Waived
                              </>
                            ) : d.status === "rejected" ? (
                              <>
                                <XCircle size={12} /> Rejected
                              </>
                            ) : (
                              <>
                                <Clock size={12} /> Pending
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs max-w-xs">
                          {d.reviewer_comments ? (
                            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10">
                              <p className="text-white/80 text-[11px] italic">"{d.reviewer_comments}"</p>
                              {d.reviewed_by_name && (
                                <p className="text-white/40 text-[10px] mt-1 font-semibold">
                                  — Reviewed by {d.reviewed_by_name}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/20 italic">No feedback yet</span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono text-white/40 text-[11px] whitespace-nowrap">
                          {d.created_at ? formatDate(d.created_at.split("T")[0]) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Submit Dispute Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl bg-[#0a0f1e] border border-amber-500/30 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-amber-400" />
                  <h3 className="text-white font-bold text-base">Submit Late Mark Explanation</h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                    Select Late Attendance Record *
                  </label>
                  {isLoadingRecords ? (
                    <div className="py-6 text-center text-white/40 text-xs flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-cyan-400" />
                      Loading recent late attendance records...
                    </div>
                  ) : lateRecords.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">No recent late marks found.</p>
                        <p className="text-white/60 mt-0.5">
                          You do not have any unresolved late arrivals in the current or previous month.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={selectedAttendanceId || ""}
                      onChange={(e) => setSelectedAttendanceId(Number(e.target.value))}
                      required
                      className="w-full px-3.5 py-2.5 text-xs text-white bg-[#0f172a] border border-white/15 rounded-xl outline-none focus:border-amber-400"
                    >
                      {lateRecords.map((r: any) => (
                        <option key={r.attendance_id} value={r.attendance_id}>
                          {formatDate(r.date)} — Late by {r.late_minutes ? `${r.late_minutes}m` : "Arrival"} ({r.check_in ? r.check_in.slice(11, 16) : "--:--"})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                    Reason / Justification Explanation *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Provide a factual, clear explanation for your late arrival (e.g., severe traffic congestion, public transit breakdown, family emergency)..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-amber-400 resize-none placeholder:text-white/20"
                  />
                  <p className="text-[11px] text-white/40 mt-1">
                    Once submitted, company administration will review your explanation. If approved, the late mark penalty is waived in monthly payroll.
                  </p>
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || lateRecords.length === 0}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #e11d48)" }}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={13} className="animate-spin" /> Submitting...
                      </span>
                    ) : (
                      "Submit Explanation"
                    )}
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
