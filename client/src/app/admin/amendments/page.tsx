"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, CheckCircle2, XCircle, Clock, Search,
  Check, X, Loader2, MessageSquare, ShieldCheck
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { amendmentApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

interface LateAmendment {
  amendment_id: number;
  attendance_id: number;
  employee_id: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_notes?: string;
  reviewed_at?: string;
  created_at: string;
  employee_name?: string;
  employee_code?: string;
  attendance_date?: string;
}

export default function AdminAmendmentsPage() {
  const { success, error } = useToast();
  const [lateAmendments, setLateAmendments] = useState<LateAmendment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Review modal
  const [reviewItem, setReviewItem] = useState<LateAmendment | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAmendments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await amendmentApi.listLate();
      setLateAmendments(res.data || []);
    } catch (err: any) {
      console.error("Error loading amendments", err);
      error("Failed to load late mark amendments.");
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchAmendments();
  }, [fetchAmendments]);

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

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Amendments & Disputes" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
              <AlertCircle className="text-amber-400" /> Late Mark Disputes & Amendments
            </h1>
            <p className="text-white/40 text-sm mt-0.5">
              Review employee explanations for late check-ins. Approved disputes are automatically waived from payroll deductions.
            </p>
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
                ) : lateAmendments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-white/40">
                      No late mark disputes submitted.
                    </td>
                  </tr>
                ) : (
                  lateAmendments.map((a) => {
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
                        <td className="px-4 py-4 text-xs text-white/50 max-w-xs truncate">{a.review_notes || "—"}</td>
                        <td className="px-4 py-4">
                          {isPending ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openReviewModal(a, "approved")}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-green-300 bg-green-500/15 border border-green-500/30 hover:bg-green-500/25 transition-all"
                              >
                                <Check size={12} /> Waive Late
                              </button>
                              <button
                                onClick={() => openReviewModal(a, "rejected")}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-300 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 transition-all"
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
                <button onClick={() => setReviewItem(null)} className="text-white/40 hover:text-white">
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
                  className="flex-1 py-2 rounded-xl text-sm text-white/60 hover:text-white border border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewSubmit}
                  disabled={isSubmitting}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold text-black transition-all ${
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
