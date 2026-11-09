"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, CheckCircle2, XCircle, Clock, Search,
  Check, X, Loader2, MessageSquare, ShieldCheck, Plus, Filter, Calendar
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { amendmentApi, employeesApi, attendanceApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";
import { formatDate, formatTime } from "@/utils/formatters";

interface LateAmendment {
  amendment_id: number;
  attendance_id: number;
  employee_id: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_comments?: string;
  review_notes?: string;
  reviewed_at?: string;
  created_at: string;
  employee_name?: string;
  employee_code?: string;
  attendance_date?: string;
  original_late_minutes?: number;
}

export default function AdminAmendmentsPage() {
  const { success, error } = useToast();
  const [lateAmendments, setLateAmendments] = useState<LateAmendment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Review modal
  const [reviewItem, setReviewItem] = useState<LateAmendment | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Amendment Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<number | null>(null);
  const [createReason, setCreateReason] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [createRemarks, setCreateRemarks] = useState("Management approved late waiver");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  const fetchAmendments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await amendmentApi.listLate();
      setLateAmendments(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("Error loading amendments", err);
      if (err?.response?.status !== 403) {
        error("Failed to load late mark amendments.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchAmendments();
    employeesApi.list({ size: 100 })
      .then((res) => setEmployees(Array.isArray(res.data) ? res.data : []))
      .catch(() => null);
  }, [fetchAmendments]);

  // When admin selects an employee in Create Modal, fetch their recent attendance records
  useEffect(() => {
    if (!selectedEmpId) {
      setAttendanceRecords([]);
      setSelectedAttendanceId(null);
      return;
    }

    setIsLoadingRecords(true);
    attendanceApi.list({ employee_id: Number(selectedEmpId), size: 60 })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        // Prioritize late records or records with late_minutes
        setAttendanceRecords(list);
        const firstLate = list.find((r: any) => r.status === "late" || (r.late_minutes && r.late_minutes > 0));
        if (firstLate) {
          setSelectedAttendanceId(firstLate.attendance_id);
        } else if (list.length > 0) {
          setSelectedAttendanceId(list[0].attendance_id);
        }
      })
      .catch((e) => console.error("Error fetching attendance for emp", e))
      .finally(() => setIsLoadingRecords(false));
  }, [selectedEmpId]);

  const openCreateModal = () => {
    setShowCreateModal(true);
    setSelectedEmpId(employees.length > 0 ? String(employees[0].employee_id) : "");
    setSelectedAttendanceId(null);
    setCreateReason("");
    setAutoApprove(true);
    setCreateRemarks("Management approved late waiver");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAttendanceId) {
      error("Please select an attendance record to amend.");
      return;
    }
    if (!createReason.trim() || createReason.trim().length < 3) {
      error("Please enter a valid reason (at least 3 characters).");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await amendmentApi.submitLate({
        attendance_id: selectedAttendanceId,
        reason: createReason.trim(),
        auto_approve: autoApprove,
        reviewer_comments: createRemarks.trim() || undefined,
      });

      success(
        autoApprove
          ? "Late amendment created and penalty waived immediately! Attendance and payroll adjusted."
          : "Late amendment submitted as pending."
      );
      setShowCreateModal(false);
      fetchAmendments();
    } catch (err: any) {
      console.error("Error creating amendment", err);
      error(err.response?.data?.detail || "Failed to create amendment.");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openReviewModal = (item: LateAmendment, action: "approved" | "rejected") => {
    setReviewItem(item);
    setReviewAction(action);
    setReviewNotes("");
  };

  const handleReviewSubmit = async () => {
    if (!reviewItem) return;
    setIsSubmitting(true);
    try {
      await amendmentApi.reviewLate(reviewItem.amendment_id, {
        status: reviewAction,
        review_notes: reviewNotes.trim(),
      });
      success(`Dispute #${reviewItem.amendment_id} has been ${reviewAction}.`);
      setReviewItem(null);
      fetchAmendments();
    } catch (err: any) {
      console.error("Error reviewing dispute", err);
      error(err.response?.data?.detail || "Failed to submit review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = lateAmendments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (a.employee_name || "").toLowerCase();
      const code = (a.employee_code || `EMP${String(a.employee_id).padStart(3, "0")}`).toLowerCase();
      const r = (a.reason || "").toLowerCase();
      const d = (a.attendance_date || "").toLowerCase();
      if (!name.includes(q) && !code.includes(q) && !r.includes(q) && !d.includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Amendments & Disputes" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header with Add Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <AlertCircle className="text-amber-400" /> Late Mark Disputes & Amendments
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Review employee explanations or create direct penalty waivers. Approved disputes are automatically waived from payroll deductions.
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 cursor-pointer self-start sm:self-auto"
            >
              <Plus size={16} /> Add Amendment / Waiver
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search by employee name, ID, date, or reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs outline-none focus:border-amber-400/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-xl overflow-x-auto">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === s
                      ? s === "approved"
                        ? "bg-green-500/20 text-green-300 border border-green-500/30"
                        : s === "rejected"
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : s === "pending"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-white/15 text-white"
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="neo-card overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Dispute ID", "Employee", "Date of Attendance", "Dispute Reason / Explanation", "Status", "Review Notes", "Actions"].map((th) => (
                    <th key={th} className="px-4 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                      {th}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-white/40">
                      <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
                      Loading dispute requests...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-white/40">
                      No late mark disputes found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => {
                    const isPending = a.status === "pending";
                    return (
                      <tr key={a.amendment_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-4 font-mono text-xs text-white/40">#{a.amendment_id}</td>
                        <td className="px-4 py-4">
                          <p className="text-white font-bold">{a.employee_name || `Employee #${a.employee_id}`}</p>
                          <p className="text-white/40 text-xs font-mono">{a.employee_code || `EMP${String(a.employee_id).padStart(3, "0")}`}</p>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-white/70">{a.attendance_date || "—"}</td>
                        <td className="px-4 py-4 text-xs text-white/80 max-w-sm">{a.reason}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                            a.status === "approved"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : a.status === "rejected"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-white/50 max-w-xs truncate">{a.reviewer_comments || a.review_notes || "—"}</td>
                        <td className="px-4 py-4">
                          {isPending ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openReviewModal(a, "approved")}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-green-300 bg-green-500/15 border border-green-500/30 hover:bg-green-500/25 transition-all cursor-pointer"
                              >
                                <Check size={12} /> Waive Late
                              </button>
                              <button
                                onClick={() => openReviewModal(a, "rejected")}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-300 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 transition-all cursor-pointer"
                              >
                                <X size={12} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-white/20 text-xs">Reviewed</span>
                          )}
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

      {/* Create Amendment Modal */}
      <AnimatePresence>
        {showCreateModal && (
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
              className="w-full max-w-lg rounded-3xl bg-[#0a0f1e] border border-white/10 p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Plus size={18} className="text-amber-400" /> Create Late Amendment / Waiver
                </h3>
                <button onClick={() => setShowCreateModal(false)} className="text-white/40 hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="py-4 space-y-4">
                {/* 1. Employee Selection */}
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Select Employee *
                  </label>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-amber-400"
                  >
                    <option value="" disabled className="bg-[#0a0f1e] text-white/40">Select an employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id} className="bg-[#0a0f1e] text-white">
                        {emp.name} ({emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`}) - {emp.department || "General"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Attendance Record Selection */}
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Select Attendance Record / Date *
                  </label>
                  {isLoadingRecords ? (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/40 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-amber-400" />
                      Loading employee attendance records...
                    </div>
                  ) : attendanceRecords.length === 0 ? (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/40">
                      No recent attendance records found for this employee.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {attendanceRecords.map((r) => {
                        const isLate = r.status === "late" || (r.late_minutes && Number(r.late_minutes) > 0);
                        const isSelected = selectedAttendanceId === r.attendance_id;
                        return (
                          <div
                            key={r.attendance_id}
                            onClick={() => setSelectedAttendanceId(r.attendance_id)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? "bg-amber-500/15 border-amber-400/80 text-white"
                                : "bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Calendar size={13} className={isLate ? "text-amber-400" : "text-white/40"} />
                              <div>
                                <span className="font-semibold">{formatDate(r.date)}</span>
                                <span className="text-white/40 ml-1.5 font-mono">
                                  In: {r.check_in ? formatTime(r.check_in) : "--:--"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isLate ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Late {r.late_minutes ? `${r.late_minutes}m` : ""}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/40 uppercase">
                                  {r.status}
                                </span>
                              )}
                              <input
                                type="radio"
                                name="selected_attendance"
                                checked={isSelected}
                                onChange={() => setSelectedAttendanceId(r.attendance_id)}
                                className="accent-amber-400"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Reason */}
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Reason / Justification for Waiver *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Official client meeting offsite, public transport disruption, medical emergency..."
                    value={createReason}
                    onChange={(e) => setCreateReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-amber-400"
                  />
                </div>

                {/* 4. Auto-Approve Option */}
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <label className="flex items-center gap-2.5 text-xs text-amber-200 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="accent-amber-400 w-4 h-4 rounded"
                    />
                    <span>Waive late penalty immediately (Auto-approve & set status to Present)</span>
                  </label>
                  {autoApprove && (
                    <div>
                      <input
                        type="text"
                        placeholder="Reviewer remarks (optional)..."
                        value={createRemarks}
                        onChange={(e) => setCreateRemarks(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs text-white bg-black/40 border border-amber-500/30 rounded-xl outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCreate || !selectedAttendanceId}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSubmittingCreate ? "Creating..." : autoApprove ? "Create & Waive Penalty" : "Create as Pending"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewItem && (
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
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-white/10 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-lg">
                  {reviewAction === "approved" ? "Waive Late Mark" : "Reject Dispute"}
                </h3>
                <button onClick={() => setReviewItem(null)} className="text-white/40 hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div className="py-4 space-y-3">
                <p className="text-white/70 text-xs">
                  Employee: <strong>{reviewItem.employee_name}</strong>
                </p>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/80">
                  <span className="text-white/40 block text-[10px] uppercase font-semibold mb-1">Employee's Explanation:</span>
                  &ldquo;{reviewItem.reason}&rdquo;
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Review Remarks
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter review notes..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setReviewItem(null)}
                  className="flex-1 py-2 rounded-xl text-sm text-white/60 hover:text-white border border-white/10 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewSubmit}
                  disabled={isSubmitting}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold text-black transition-all cursor-pointer ${
                    reviewAction === "approved"
                      ? "bg-green-400 hover:bg-green-300"
                      : "bg-red-400 hover:bg-red-300 text-white"
                  }`}
                >
                  {isSubmitting ? "Submitting..." : reviewAction === "approved" ? "Confirm Waive" : "Confirm Reject"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
