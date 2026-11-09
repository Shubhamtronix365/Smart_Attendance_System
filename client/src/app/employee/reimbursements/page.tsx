"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt,
  Plus,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  X,
  AlertCircle,
  Loader2,
  DollarSign,
  Edit2,
  Trash2,
  Eye,
} from "lucide-react";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { reimbursementApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

const CATEGORIES = [
  "Travel & Fuel",
  "Meals & Entertainment",
  "Office Supplies",
  "Internet & Phone",
  "Training & Certification",
  "Medical & Healthcare",
  "Client Meeting",
  "Miscellaneous",
  "Custom",
];

export default function EmployeeReimbursementsPage() {
  const { success, error } = useToast();
  const [claims, setClaims] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Form State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document Viewer Modal
  const [viewingClaim, setViewingClaim] = useState<any | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Edit Modal State
  const [editingClaim, setEditingClaim] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCategory, setEditCategory] = useState<string>(CATEGORIES[0]);
  const [editCustomCategory, setEditCustomCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete/Withdraw Modal State
  const [deleteClaim, setDeleteClaim] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMyClaims = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await reimbursementApi.my();
      setClaims(res.data || []);
    } catch (err: any) {
      console.error("Error fetching my claims", err);
      error("Failed to load your reimbursement history.");
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchMyClaims();
  }, [fetchMyClaims]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 5 * 1024 * 1024) {
        error("File size must not exceed 5MB.");
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !description.trim()) {
      error("Please enter a valid expense amount and description.");
      return;
    }

    if (category === "Custom" && !customCategory.trim()) {
      error("Please enter your custom expense category name.");
      return;
    }

    if (!file) {
      error("Please upload a supporting receipt or bill document (PDF, JPG, PNG).");
      return;
    }

    const effectiveCategory = category === "Custom" ? customCategory.trim() : category;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(amount));
      formData.append("category", effectiveCategory);
      formData.append("expense_date", expenseDate);
      formData.append("description", description.trim());
      formData.append("receipt", file);
      formData.append("document", file);
      formData.append("file", file);

      await reimbursementApi.create(formData);
      success("Reimbursement claim submitted successfully for manager approval.");
      setShowSubmitModal(false);
      setAmount(0);
      setCategory(CATEGORIES[0]);
      setCustomCategory("");
      setDescription("");
      setFile(null);
      fetchMyClaims();
    } catch (err: any) {
      console.error("Error submitting claim", err);
      error(err.response?.data?.detail || "Failed to submit reimbursement claim.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDoc = async (c: any) => {
    setViewingClaim(c);
    setIsLoadingDoc(true);
    try {
      const res = await reimbursementApi.getDocument(c.reimbursement_id);
      const mime = c.document_mimetype || c.receipt_mimetype || "application/pdf";
      const blob = new Blob([res.data], { type: mime });
      const url = window.URL.createObjectURL(blob);
      setDocBlobUrl(url);
    } catch (err) {
      console.error("Error viewing document", err);
      error("Failed to load receipt attachment.");
      setViewingClaim(null);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const closeDocModal = () => {
    if (docBlobUrl) {
      window.URL.revokeObjectURL(docBlobUrl);
      setDocBlobUrl(null);
    }
    setViewingClaim(null);
  };

  const handleOpenEdit = (c: any) => {
    setEditingClaim(c);
    setEditAmount(Number(c.amount));
    if (CATEGORIES.includes(c.category) && c.category !== "Custom") {
      setEditCategory(c.category);
      setEditCustomCategory("");
    } else {
      setEditCategory("Custom");
      setEditCustomCategory(c.category || "");
    }
    setEditDescription(c.description || "");
    setEditFile(null);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim) return;
    if (editAmount <= 0 || !editDescription.trim()) {
      error("Please enter a valid amount and description.");
      return;
    }
    if (editCategory === "Custom" && !editCustomCategory.trim()) {
      error("Please enter a custom category name.");
      return;
    }

    const effectiveCategory = editCategory === "Custom" ? editCustomCategory.trim() : editCategory;

    setIsSubmittingEdit(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(editAmount));
      formData.append("category", effectiveCategory);
      formData.append("description", editDescription.trim());
      if (editFile) {
        formData.append("receipt", editFile);
      }

      await reimbursementApi.update(editingClaim.reimbursement_id, formData);
      success(
        editingClaim.status === "approved"
          ? "Claim updated and resubmitted for admin re-approval before payroll inclusion."
          : "Reimbursement claim updated successfully."
      );
      setEditingClaim(null);
      fetchMyClaims();
    } catch (err: any) {
      console.error("Error updating claim", err);
      error(err.response?.data?.detail || "Failed to update claim.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleSubmitDelete = async () => {
    if (!deleteClaim) return;
    setIsDeleting(true);
    try {
      await reimbursementApi.delete(deleteClaim.reimbursement_id);
      success(`Claim #${deleteClaim.reimbursement_id} has been withdrawn.`);
      setDeleteClaim(null);
      fetchMyClaims();
    } catch (err: any) {
      console.error("Error deleting claim", err);
      error(err.response?.data?.detail || "Failed to delete claim.");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalClaimed = claims.reduce((s, c) => s + Number(c.amount || 0), 0);
  const approvedTotal = claims
    .filter((c) => c.status === "approved" || c.status === "paid")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <EmployeeSidebar />
      <EmployeeTopBar title="Reimbursements" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <Receipt className="text-cyan-400" /> My Reimbursements
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Submit claims with receipts, track review progress, and edit or withdraw pending requests.
              </p>
            </div>
            <button
              onClick={() => {
                setAmount(0);
                setCategory(CATEGORIES[0]);
                setCustomCategory("");
                setDescription("");
                setFile(null);
                setShowSubmitModal(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer self-start sm:self-auto"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              <Plus size={16} /> New Reimbursement Claim
            </button>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Total Amount Claimed</p>
              <p className="text-2xl font-bold font-mono text-white mt-1">
                ₹{totalClaimed.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
              <p className="text-green-300 text-xs font-semibold uppercase">Approved / Paid</p>
              <p className="text-2xl font-bold font-mono text-green-400 mt-1">
                ₹{approvedTotal.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-300 text-xs font-semibold uppercase">Pending Claims</p>
              <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {claims.filter((c) => c.status === "pending").length}
              </p>
            </div>
          </div>

          {/* Claims History Table */}
          <div className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Claim #", "Date", "Category", "Amount", "Description", "Receipt", "Status", "Reviewer Remarks", "Actions"].map((th) => (
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
                        Loading claims history...
                      </td>
                    </tr>
                  ) : claims.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40">
                        You have not submitted any reimbursement requests yet.
                      </td>
                    </tr>
                  ) : (
                    claims.map((c) => {
                      const isPaid = c.status === "paid";
                      const isApproved = c.status === "approved";
                      const canEditOrDelete = !isPaid;
                      const hasReceipt = Boolean(c.document_filename || c.receipt_filename || c.document_path);

                      return (
                        <tr key={c.reimbursement_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-4 font-mono text-xs text-white/40">#{c.reimbursement_id}</td>
                          <td className="px-4 py-4 font-mono text-xs text-white/70">{c.expense_date || (c.created_at ? c.created_at.split("T")[0] : "—")}</td>
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 text-white/80 border border-white/10">
                              {c.category}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-mono font-bold text-green-400">
                            ₹{Number(c.amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-4 text-xs text-white/70 max-w-xs truncate">{c.description}</td>
                          <td className="px-4 py-4 text-xs">
                            {hasReceipt ? (
                              <button
                                onClick={() => handleViewDoc(c)}
                                className="text-cyan-300 font-mono flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                <Eye size={12} /> {c.document_filename || c.receipt_filename || "View Receipt"}
                              </button>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                                c.status === "approved"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : c.status === "paid"
                                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                                  : c.status === "rejected"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-white/50 max-w-xs truncate">
                            {c.reviewer_comments || c.review_notes || "—"}
                          </td>
                          <td className="px-4 py-4">
                            {canEditOrDelete ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEdit(c)}
                                  title={isApproved ? "Edit Claim (Resubmits for Re-Approval)" : "Edit Claim"}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isApproved
                                      ? "text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30"
                                      : "text-white/50 hover:text-cyan-300 bg-white/5 hover:bg-cyan-500/15 border-white/10 hover:border-cyan-500/30"
                                  }`}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => setDeleteClaim(c)}
                                  title={isApproved ? "Withdraw Approved Claim" : "Withdraw / Delete Claim"}
                                  className="p-1.5 rounded-lg text-white/50 hover:text-red-400 bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-cyan-400/60 text-xs font-semibold">Disbursed</span>
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

      {/* New Claim Modal */}
      <AnimatePresence>
        {showSubmitModal && (
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
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-cyan-500/25 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-black text-lg">New Reimbursement Request</h3>
                <button onClick={() => setShowSubmitModal(false)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitClaim} className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Expense Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 1500"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm text-green-400 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400 font-mono font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                      Expense Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                      Date of Expense
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                {category === "Custom" && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25">
                    <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider block mb-1">
                      Custom Category Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Software Subscription, Client Gift, Toll Tax"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-white bg-[#0a0f1e] border border-cyan-500/40 rounded-xl outline-none focus:border-cyan-400 placeholder:text-white/20"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Description & Justification *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Client lunch meeting with Acme Corp, fuel receipt, etc."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Upload Supporting Receipt / Document *
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/15 hover:border-cyan-400/40 rounded-xl p-3 text-center cursor-pointer transition-colors bg-white/[0.01]"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload size={18} className="text-cyan-400 mx-auto mb-1" />
                    <p className="text-xs text-white/80 font-medium">
                      {file ? file.name : "Click to select PDF, JPG or PNG (<= 5MB)"}
                    </p>
                    {file && <p className="text-[10px] text-white/40 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>}
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm text-white/60 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black"
                    style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                  >
                    {isSubmitting ? "Submitting..." : "Submit Claim"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Claim Modal */}
      <AnimatePresence>
        {editingClaim && (
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
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-cyan-500/30 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Edit2 size={16} className="text-cyan-400" />
                  <h3 className="text-white font-bold text-base">Edit Claim #{editingClaim.reimbursement_id}</h3>
                </div>
                <button onClick={() => setEditingClaim(null)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitEdit} className="py-4 space-y-3.5">
                {editingClaim.status === "approved" && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                    <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                      <strong>Re-Approval Notice:</strong> This claim was previously approved. Saving edits will reset its status to <strong>Pending</strong>. It will require administrator re-approval before it can be processed or disbursed in payroll.
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm text-green-400 font-mono font-bold bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Category *
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {editCategory === "Custom" && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25">
                    <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider block mb-1">
                      Custom Category Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Software Subscription, Client Gift"
                      value={editCustomCategory}
                      onChange={(e) => setEditCustomCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-white bg-[#0a0f1e] border border-cyan-500/40 rounded-xl outline-none focus:border-cyan-400"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Description *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Replace Receipt File (Optional)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setEditFile(e.target.files[0]);
                      }
                    }}
                    className="w-full text-xs text-white/60 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                  />
                  {editingClaim.receipt_filename && (
                    <p className="text-[11px] text-white/40 mt-1">Current file: {editingClaim.receipt_filename}</p>
                  )}
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingClaim(null)}
                    className="flex-1 py-2 rounded-xl text-xs text-white/60 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEdit}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-black"
                    style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                  >
                    {isSubmittingEdit ? "Updating..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete / Withdraw Modal */}
      <AnimatePresence>
        {deleteClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-3xl bg-[#0a0f1e] border border-red-500/30 p-6 text-center shadow-2xl">
              <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
              <h4 className="text-lg font-bold text-white mb-2">Withdraw Claim #{deleteClaim.reimbursement_id}?</h4>
              <p className="text-white/50 text-xs mb-4">
                Are you sure you want to withdraw and delete this reimbursement request of <strong>₹{Number(deleteClaim.amount).toLocaleString("en-IN")}</strong>?
              </p>
              {deleteClaim.status === "approved" && (
                <div className="mb-5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left flex items-start gap-2">
                  <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-tight">
                    This claim was previously approved. Withdrawing it will permanently cancel the claim and exclude it from payroll.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteClaim(null)}
                  className="flex-1 py-2 rounded-xl text-xs text-white/60 hover:text-white border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors"
                >
                  {isDeleting ? "Withdrawing..." : "Withdraw Claim"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Viewer Modal */}
      <AnimatePresence>
        {viewingClaim && (
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
                  <h4 className="text-white font-bold text-sm">Receipt Attachment: {viewingClaim.document_filename || viewingClaim.receipt_filename || "Receipt Document"}</h4>
                  <p className="text-white/40 text-xs">Claim #{viewingClaim.reimbursement_id} · ₹{Number(viewingClaim.amount).toLocaleString("en-IN")}</p>
                </div>
                <button onClick={closeDocModal} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-auto flex items-center justify-center min-h-96 bg-black/40">
                {isLoadingDoc ? (
                  <div className="text-center">
                    <Loader2 size={32} className="animate-spin text-cyan-400 mx-auto mb-2" />
                    <p className="text-white/50 text-xs">Loading receipt attachment...</p>
                  </div>
                ) : docBlobUrl ? (
                  (viewingClaim.document_mimetype || viewingClaim.receipt_mimetype || "").includes("image") ? (
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
