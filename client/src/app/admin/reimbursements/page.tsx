"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, CheckCircle2, XCircle, Clock, Eye, Download,
  Filter, Search, AlertCircle, FileText, X, Check, Loader2, DollarSign
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { reimbursementApi, employeesApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

interface Reimbursement {
  reimbursement_id: number;
  employee_id: number;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  status: "pending" | "approved" | "rejected" | "paid";
  document_path?: string;
  document_filename?: string;
  document_mimetype?: string;
  receipt_filename?: string;
  receipt_mimetype?: string;
  review_notes?: string;
  reviewed_at?: string;
  created_at: string;
  employee_name?: string;
  employee_code?: string;
}

export default function AdminReimbursementsPage() {
  const { success, error } = useToast();
  const [claims, setClaims] = useState<Reimbursement[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Review Modal
  const [reviewingClaim, setReviewingClaim] = useState<Reimbursement | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Document Viewer Modal
  const [viewingDocClaim, setViewingDocClaim] = useState<Reimbursement | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  const fetchClaims = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (selectedStatus) params.status = selectedStatus;
      if (selectedEmpId) params.employee_id = Number(selectedEmpId);
      const res = await reimbursementApi.list(params);
      setClaims(res.data || []);
    } catch (err: any) {
      console.error("Error fetching claims", err);
      error("Failed to load reimbursements.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedEmpId, error]);

  useEffect(() => {
    fetchClaims();
    employeesApi.list({ size: 100 })
      .then((res) => setEmployees(res.data || []))
      .catch((e) => console.error("Error loading employees", e));
  }, [fetchClaims]);

  const handleOpenReview = (c: Reimbursement, action: "approved" | "rejected") => {
    setReviewingClaim(c);
    setReviewAction(action);
    setReviewNotes("");
  };

  const submitReview = async () => {
    if (!reviewingClaim) return;
    setIsSubmittingReview(true);
    try {
      await reimbursementApi.review(reviewingClaim.reimbursement_id, {
        status: reviewAction,
        review_notes: reviewNotes.trim(),
      });
      success(`Claim #${reviewingClaim.reimbursement_id} has been ${reviewAction}.`);
      setReviewingClaim(null);
      fetchClaims();
    } catch (err: any) {
      console.error("Error reviewing claim", err);
      error(err.response?.data?.detail || "Failed to submit review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleViewDoc = async (c: Reimbursement) => {
    setViewingDocClaim(c);
    setIsLoadingDoc(true);
    try {
      const res = await reimbursementApi.getDocument(c.reimbursement_id);
      const mimeType = c.document_mimetype || c.receipt_mimetype || "application/pdf";
      const blob = new Blob([res.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      setDocBlobUrl(url);
    } catch (err) {
      console.error("Error fetching document", err);
      error("Failed to stream attachment.");
      setViewingDocClaim(null);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const closeDocModal = () => {
    if (docBlobUrl) {
      window.URL.revokeObjectURL(docBlobUrl);
      setDocBlobUrl(null);
    }
    setViewingDocClaim(null);
  };

  const filtered = claims.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.employee_name && c.employee_name.toLowerCase().includes(s)) ||
      (c.category && c.category.toLowerCase().includes(s)) ||
      (c.description && c.description.toLowerCase().includes(s))
    );
  });

  const totalPending = claims.filter((c) => c.status === "pending").length;
  const totalApproved = claims.filter((c) => c.status === "approved").length;
  const totalAmount = claims
    .filter((c) => c.status === "approved" || c.status === "paid")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Reimbursements" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <Receipt className="text-cyan-400" /> Reimbursements Review
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Review employee expenses with secure receipt verification & automatic payroll disbursement
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-[10px] text-amber-300 font-semibold uppercase">Pending</p>
                <p className="text-lg font-bold text-amber-400">{totalPending}</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-[10px] text-green-300 font-semibold uppercase">Approved</p>
                <p className="text-lg font-bold text-green-400">{totalApproved}</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                <p className="text-[10px] text-cyan-300 font-semibold uppercase">Approved Total</p>
                <p className="text-lg font-bold text-cyan-400 font-mono">₹{totalAmount.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="relative flex-1 min-w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search by employee, category or note..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 text-sm text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="px-3 py-2 text-sm text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Claims Table */}
          <div className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["ID", "Employee", "Expense Date", "Category", "Amount", "Receipt Attachment", "Status", "Review Notes", "Actions"].map((th) => (
                      <th key={th} className="px-4 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40">
                        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
                        Loading claims...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40">
                        No reimbursement claims found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const isPending = c.status === "pending";
                      return (
                        <tr key={c.reimbursement_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-4 font-mono text-xs text-white/40">#{c.reimbursement_id}</td>
                          <td className="px-4 py-4">
                            <p className="text-white font-bold">{c.employee_name || `Employee #${c.employee_id}`}</p>
                            <p className="text-white/40 text-xs font-mono">{c.employee_code || `EMP${String(c.employee_id).padStart(3, "0")}`}</p>
                          </td>
                          <td className="px-4 py-4 font-mono text-white/70 text-xs">{c.expense_date}</td>
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 text-white/80 border border-white/10">
                              {c.category}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-mono font-bold text-green-400">
                            ₹{Number(c.amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-4">
                            {c.document_path || c.receipt_filename || c.document_filename ? (
                              <button
                                onClick={() => handleViewDoc(c)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer"
                              >
                                <Eye size={12} /> View Receipt
                              </button>
                            ) : (
                              <span className="text-white/20 text-xs">No attachment</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                              c.status === "approved"
                                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                : c.status === "paid"
                                ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                                : c.status === "rejected"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-white/50 max-w-xs truncate">
                            {c.review_notes || c.description || "—"}
                          </td>
                          <td className="px-4 py-4">
                            {isPending ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenReview(c, "approved")}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-green-300 bg-green-500/15 border border-green-500/30 hover:bg-green-500/25 transition-all"
                                >
                                  <Check size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => handleOpenReview(c, "rejected")}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-300 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 transition-all"
                                >
                                  <X size={12} /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-white/20 text-xs">Finalized</span>
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
        </div>
      </main>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewingClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-white/10 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-lg">
                  {reviewAction === "approved" ? "Approve Reimbursement" : "Reject Reimbursement"}
                </h3>
                <button onClick={() => setReviewingClaim(null)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="py-4 space-y-3">
                <p className="text-white/70 text-xs">
                  Claim ID: <strong>#{reviewingClaim.reimbursement_id}</strong> | Amount: <strong className="text-green-400">₹{Number(reviewingClaim.amount).toLocaleString("en-IN")}</strong>
                </p>
                <p className="text-white/50 text-xs">
                  Category: {reviewingClaim.category} · Employee: {reviewingClaim.employee_name}
                </p>

                {(reviewingClaim.document_path || reviewingClaim.receipt_filename || reviewingClaim.document_filename) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleViewDoc(reviewingClaim)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer"
                    >
                      <Eye size={13} /> View Attached Receipt ({reviewingClaim.receipt_filename || reviewingClaim.document_filename || "Document"})
                    </button>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Review Remarks / Justification
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter review notes visible to employee & audit history..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setReviewingClaim(null)}
                  className="flex-1 py-2 rounded-xl text-sm text-white/60 hover:text-white border border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitReview}
                  disabled={isSubmittingReview}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold text-black transition-all ${
                    reviewAction === "approved"
                      ? "bg-green-400 hover:bg-green-300"
                      : "bg-red-400 hover:bg-red-300 text-white"
                  }`}
                >
                  {isSubmittingReview ? "Submitting..." : reviewAction === "approved" ? "Confirm Approval" : "Confirm Rejection"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Viewer Modal */}
      <AnimatePresence>
        {viewingDocClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={closeDocModal}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-3xl max-h-[85vh] rounded-3xl bg-[#0a0f1e] border border-cyan-500/30 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                <div>
                  <h4 className="text-white font-bold text-sm">Receipt Attachment: {viewingDocClaim.document_filename || viewingDocClaim.receipt_filename || "Receipt Document"}</h4>
                  <p className="text-white/40 text-xs">Claim #{viewingDocClaim.reimbursement_id} · {viewingDocClaim.employee_name}</p>
                </div>
                <button onClick={closeDocModal} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-auto flex items-center justify-center min-h-96 bg-black/40">
                {isLoadingDoc ? (
                  <div className="text-center">
                    <Loader2 size={32} className="animate-spin text-cyan-400 mx-auto mb-2" />
                    <p className="text-white/50 text-xs">Streaming secure receipt...</p>
                  </div>
                ) : docBlobUrl ? (
                  (viewingDocClaim.document_mimetype || viewingDocClaim.receipt_mimetype || "").includes("image") ? (
                    <img
                      src={docBlobUrl}
                      alt="Receipt Document"
                      className="max-h-[65vh] max-w-full rounded-xl object-contain border border-white/10"
                    />
                  ) : (
                    <iframe
                      src={docBlobUrl}
                      className="w-full h-[65vh] rounded-xl border border-white/10"
                      title="PDF Attachment"
                    />
                  )
                ) : (
                  <p className="text-white/40 text-sm">Failed to render attachment.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
