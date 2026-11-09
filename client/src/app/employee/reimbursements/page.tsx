"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, Plus, Upload, CheckCircle2, Clock, XCircle,
  FileText, X, AlertCircle, Loader2, DollarSign
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

  // Form State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
                Submit claims with receipts and track approval & disbursement status in payroll
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowSubmitModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black self-start sm:self-auto"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              <Plus size={16} /> New Reimbursement Claim
            </motion.button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-white/40 text-xs font-semibold uppercase">Total Claims Submitted</p>
              <p className="text-2xl font-bold text-white mt-1 font-mono">₹{totalClaimed.toLocaleString("en-IN")}</p>
            </div>
            <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
              <p className="text-green-300 text-xs font-semibold uppercase">Approved / Paid</p>
              <p className="text-2xl font-bold text-green-400 mt-1 font-mono">₹{approvedTotal.toLocaleString("en-IN")}</p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-300 text-xs font-semibold uppercase">Pending Claims</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">
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
                    {["Claim #", "Date", "Category", "Amount", "Description", "Receipt", "Status", "Reviewer Remarks"].map((th) => (
                      <th key={th} className="px-4 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-white/40">
                        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
                        Loading claims history...
                      </td>
                    </tr>
                  ) : claims.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-white/40">
                        You have not submitted any reimbursement requests yet.
                      </td>
                    </tr>
                  ) : (
                    claims.map((c) => (
                      <tr key={c.reimbursement_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-4 font-mono text-xs text-white/40">#{c.reimbursement_id}</td>
                        <td className="px-4 py-4 font-mono text-xs text-white/70">{c.expense_date}</td>
                        <td className="px-4 py-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 text-white/80 border border-white/10">
                            {c.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-green-400">
                          ₹{Number(c.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 text-xs text-white/70 max-w-xs truncate">{c.description}</td>
                        <td className="px-4 py-4 text-xs text-white/40">
                          {c.document_filename || c.receipt_filename ? (
                            <span className="text-cyan-300 font-mono flex items-center gap-1">
                              <FileText size={12} /> {c.document_filename || c.receipt_filename}
                            </span>
                          ) : (
                            "—"
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
                          {c.review_notes || "—"}
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
                    Upload Supporting Receipt / Document
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
    </div>
  );
}
