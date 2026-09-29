"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Plus,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { leaveApi, employeeSelfApi } from "@/services/api";
import { formatDate } from "@/utils/formatters";

const LEAVE_TYPES = [
  { value: "casual", label: "Casual Leave", quota: 12, color: "#00f5ff" },
  { value: "sick", label: "Sick Leave", quota: 10, color: "#f59e0b" },
  { value: "paid", label: "Paid Leave", quota: 15, color: "#10b981" },
  { value: "unpaid", label: "Unpaid Leave", quota: null, color: "#a855f7" },
];

export default function EmployeeLeavePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error } = useToast();

  const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);

  // Form State
  const [formType, setFormType] = useState("casual");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [formReason, setFormReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [historyRes, balanceRes] = await Promise.all([
        leaveApi.list(),
        employeeSelfApi.myLeaveBalance(),
      ]);
      setLeaveHistory(historyRes.data || []);
      setBalance(balanceRes.data || null);
    } catch (err) {
      console.error("Failed to load leave records", err);
      error("Unable to load leave details.");
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Duration in days calculator
  const durationDays = (() => {
    if (!formFrom || !formTo) return 0;
    const start = new Date(formFrom);
    const end = new Date(formTo);
    if (end < start) return 0;
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  })();

  const handleWithdrawLeave = async (leaveId: number) => {
    if (!window.confirm("Are you sure you want to withdraw this leave request?")) {
      return;
    }
    try {
      setCancellingId(leaveId);
      await leaveApi.cancel(leaveId);
      success("Leave application withdrawn successfully.");
      await loadData();
    } catch (err: any) {
      console.error("Failed to withdraw leave", err);
      error(err.response?.data?.detail || "Failed to withdraw leave application.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFrom || !formTo) {
      error("Please choose both start and end dates.");
      return;
    }
    if (formFrom > formTo) {
      error("Start date cannot be after end date.");
      return;
    }

    try {
      setIsSubmitting(true);
      await leaveApi.request({
        leave_type: formType,
        start_date: formFrom,
        end_date: formTo,
        reason: formReason.trim() || "General leave request",
      });

      success("Leave request submitted successfully!");
      setShowApplyModal(false);
      setFormFrom("");
      setFormTo("");
      setFormReason("");
      loadData();
    } catch (err: any) {
      console.error("Failed to submit leave", err);
      error(err.response?.data?.detail || "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
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
        title="Leave Management"
        subtitle="Manage your annual leave allowances and track requests"
        onRefresh={loadData}
        isRefreshing={isLoading}
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        {/* Header Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-white">My Leave Overview</h2>
            <p className="text-white/40 text-xs mt-0.5">
              Annual quotas allocated for calendar year {new Date().getFullYear()}
            </p>
          </div>

          <button
            onClick={() => setShowApplyModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/10"
            style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
          >
            <Plus size={15} />
            Apply for Leave
          </button>
        </div>

        {/* Quota Progress Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {LEAVE_TYPES.map((type, idx) => {
            const remaining = balance ? (balance[type.value] ?? (type.quota || 0)) : (type.quota || 0);
            const total = type.quota;
            const used = total !== null ? Math.max(0, total - remaining) : (balance?.unpaid ?? 0);
            const pct = total ? Math.min(100, Math.round((remaining / total) * 100)) : 100;

            return (
              <motion.div
                key={type.value}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-white/60">{type.label}</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${type.color}15`, color: type.color }}
                    >
                      {total !== null ? `${remaining} days left (Annual)` : "Unlimited"}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-3xl font-black" style={{ color: type.color }}>
                      {remaining}
                    </span>
                    {total !== null && <span className="text-xs text-white/40">/ {total} days/year (Annual Quota)</span>}
                  </div>

                  {total !== null && (
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: type.color }}
                      />
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-white/30 mt-3 pt-3 border-t border-white/5">
                  {total !== null ? `${used} of ${total} days consumed this calendar year` : `${used} days taken without pay`}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Leave Requests Table */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Leave Application History</h3>
            </div>
            <span className="text-xs text-white/40">
              {leaveHistory.length} {leaveHistory.length === 1 ? "request" : "requests"} total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-white/40 uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-6">Leave Type</th>
                  <th className="py-3.5 px-6">Period</th>
                  <th className="py-3.5 px-6">Duration</th>
                  <th className="py-3.5 px-6">Reason</th>
                  <th className="py-3.5 px-6">Applied On</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Reviewed By</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <LoadingSkeleton rows={4} cols={8} />
                ) : leaveHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Calendar className="mx-auto mb-3 text-white/20" size={36} />
                      <p className="text-white/60 text-sm font-medium">No leave requests submitted</p>
                      <p className="text-white/30 text-xs mt-1">
                        When you apply for casual, sick, or paid leave, the approval status will show here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  leaveHistory.map((l: any) => {
                    const start = new Date(l.start_date);
                    const end = new Date(l.end_date);
                    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                    return (
                      <tr key={l.leave_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-6 font-semibold text-white capitalize">
                          {l.leave_type} Leave
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap text-white/80">
                          {formatDate(l.start_date)}
                          <span className="mx-1.5 text-white/20">→</span>
                          {formatDate(l.end_date)}
                        </td>
                        <td className="py-4 px-6 font-mono text-cyan-300">
                          {days} {days === 1 ? "day" : "days"}
                        </td>
                        <td className="py-4 px-6 text-white/60 max-w-xs truncate" title={l.reason}>
                          {l.reason || "-"}
                        </td>
                        <td className="py-4 px-6 text-white/40 whitespace-nowrap">
                          {formatDate(l.created_at)}
                        </td>
                        <td className="py-4 px-6">
                          {l.approval_status === "approved" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={11} /> Approved
                            </span>
                          )}
                          {l.approval_status === "pending" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Clock size={11} /> Pending Review
                            </span>
                          )}
                          {l.approval_status === "rejected" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                              <XCircle size={11} /> Rejected
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-white/40">
                          {l.approver_name || (l.approval_status === "pending" ? "Awaiting HR" : "-")}
                        </td>
                        <td className="py-4 px-6 text-right">
                          {l.approval_status === "pending" ? (
                            <button
                              onClick={() => handleWithdrawLeave(l.leave_id)}
                              disabled={cancellingId === l.leave_id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all disabled:opacity-50"
                              title="Withdraw this pending request"
                            >
                              {cancellingId === l.leave_id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <X size={12} />
                              )}
                              Withdraw
                            </button>
                          ) : (
                            <span className="text-white/20 text-xs">-</span>
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

      {/* Apply Leave Modal */}
      <AnimatePresence>
        {showApplyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-[#0d1424] border border-white/10 p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Calendar size={16} />
                  </div>
                  <h3 className="text-base font-bold text-white">Apply for Leave</h3>
                </div>
                <button
                  onClick={() => setShowApplyModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Leave Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-cyan-400 transition-all cursor-pointer"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t.value} value={t.value} className="bg-[#0a0f1e] text-white">
                        {t.label} {t.quota !== null ? `(${t.quota} days/year - Annual Quota)` : "(Unpaid / LWP)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={formFrom}
                      onChange={(e) => setFormFrom(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={formTo}
                      onChange={(e) => setFormTo(e.target.value)}
                      required
                      min={formFrom}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all"
                    />
                  </div>
                </div>

                {durationDays > 0 && (
                  <div className="px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center justify-between">
                    <span>Duration:</span>
                    <span className="font-mono font-bold">
                      {durationDays} {durationDays === 1 ? "day" : "days"}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Reason for Leave</label>
                  <textarea
                    rows={3}
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Briefly describe the purpose of your leave..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all resize-none placeholder:text-white/20"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowApplyModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        Submit Request
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
