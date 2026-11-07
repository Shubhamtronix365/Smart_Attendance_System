"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Plus, CheckCircle2, AlertCircle, Search,
  DollarSign, User, Calendar, FileText, X, Loader2, ArrowDownRight, ArrowUpRight
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { advanceApi, employeesApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

interface Advance {
  advance_id: number;
  employee_id: number;
  amount: number;
  recovered_amount: number;
  remaining_balance: number;
  reason?: string;
  disbursement_date: string;
  recovery_mode: string;
  status: "active" | "recovered" | "cancelled";
  created_at: string;
  employee_name?: string;
  employee_code?: string;
}

export default function AdminAdvancesPage() {
  const { success, error } = useToast();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formEmpId, setFormEmpId] = useState<number>(0);
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formReason, setFormReason] = useState("");
  const [formMode, setFormMode] = useState("flexible");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected Employee Balance Lookup
  const [empBalanceInfo, setEmpBalanceInfo] = useState<any>(null);

  const fetchAdvances = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (selectedStatus) params.status = selectedStatus;
      if (selectedEmpId) params.employee_id = Number(selectedEmpId);
      const res = await advanceApi.list(params);
      setAdvances(res.data || []);
    } catch (err: any) {
      console.error("Error loading advances", err);
      error("Failed to load advance salary records.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedEmpId, error]);

  useEffect(() => {
    fetchAdvances();
    employeesApi.list({ size: 100 })
      .then((res) => {
        const list = res.data || [];
        setEmployees(list);
        if (list.length > 0 && !formEmpId) setFormEmpId(list[0].employee_id);
      })
      .catch((e) => console.error("Error loading employees", e));
  }, [fetchAdvances]);

  useEffect(() => {
    if (formEmpId) {
      advanceApi.getEmployeeBalance(formEmpId)
        .then((res) => setEmpBalanceInfo(res.data))
        .catch(() => setEmpBalanceInfo(null));
    }
  }, [formEmpId]);

  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId || formAmount <= 0) {
      error("Please select an employee and enter a valid advance amount.");
      return;
    }
    setIsSubmitting(true);
    try {
      await advanceApi.create({
        employee_id: formEmpId,
        amount: formAmount,
        reason: formReason.trim(),
        recovery_mode: formMode,
      });
      success(`Salary advance of ₹${formAmount.toLocaleString("en-IN")} disbursed successfully.`);
      setIsModalOpen(false);
      setFormAmount(0);
      setFormReason("");
      fetchAdvances();
    } catch (err: any) {
      console.error("Error creating advance", err);
      error(err.response?.data?.detail || "Failed to disburse advance.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = advances.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (a.employee_name && a.employee_name.toLowerCase().includes(s)) ||
      (a.reason && a.reason.toLowerCase().includes(s)) ||
      (a.employee_code && a.employee_code.toLowerCase().includes(s))
    );
  });

  const totalDisbursed = advances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalRecovered = advances.reduce((s, a) => s + Number(a.recovered_amount || 0), 0);
  const totalOutstanding = advances.reduce((s, a) => s + Number(a.remaining_balance || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Salary Advances" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <CreditCard className="text-cyan-400" /> Salary Advance Management
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Disburse emergency advances and track cumulative balance recovery across payroll runs
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black self-start sm:self-auto"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              <Plus size={16} /> Disburse Advance
            </motion.button>
          </div>

          {/* Cumulative Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white/40 text-xs uppercase font-semibold">Total Advances Disbursed</p>
                <p className="text-2xl font-black text-white mt-1 font-mono">₹{totalDisbursed.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ArrowUpRight size={20} />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white/40 text-xs uppercase font-semibold">Total Recovered in Payroll</p>
                <p className="text-2xl font-black text-green-400 mt-1 font-mono">₹{totalRecovered.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                <ArrowDownRight size={20} />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-between">
              <div>
                <p className="text-cyan-300/70 text-xs uppercase font-semibold">Current Outstanding Balance</p>
                <p className="text-2xl font-black text-cyan-300 mt-1 font-mono">₹{totalOutstanding.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <DollarSign size={20} />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="relative flex-1 min-w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search by employee name or advance note..."
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
                <option value="active">Active (Outstanding)</option>
                <option value="recovered">Fully Recovered</option>
                <option value="cancelled">Cancelled</option>
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

          {/* Advances Table */}
          <div className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["ID", "Employee", "Disbursed Date", "Initial Amount", "Recovered", "Remaining Balance", "Mode", "Status", "Reason"].map((th) => (
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
                        Loading advances...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40">
                        No salary advance records found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((a) => (
                      <tr key={a.advance_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-4 font-mono text-xs text-white/40">#{a.advance_id}</td>
                        <td className="px-4 py-4">
                          <p className="text-white font-bold">{a.employee_name || `Employee #${a.employee_id}`}</p>
                          <p className="text-white/40 text-xs font-mono">{a.employee_code || `EMP${String(a.employee_id).padStart(3, "0")}`}</p>
                        </td>
                        <td className="px-4 py-4 font-mono text-white/70 text-xs">{a.disbursement_date}</td>
                        <td className="px-4 py-4 font-mono font-bold text-white">
                          ₹{Number(a.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 font-mono text-green-400 font-semibold">
                          ₹{Number(a.recovered_amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-cyan-300">
                          ₹{Number(a.remaining_balance).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-white/5 text-white/70 border border-white/10">
                            {a.recovery_mode}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                            a.status === "active"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : a.status === "recovered"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-white/5 text-white/40 border border-white/10"
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-white/50 max-w-xs truncate">{a.reason || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Disburse Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-cyan-500/25 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-white font-black text-lg">Disburse Salary Advance</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateAdvance} className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Select Employee *
                  </label>
                  <select
                    value={formEmpId}
                    onChange={(e) => setFormEmpId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  >
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.name} ({emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`})
                      </option>
                    ))}
                  </select>
                </div>

                {empBalanceInfo && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-center justify-between">
                    <span>Existing Balance:</span>
                    <strong className="font-mono">₹{Number(empBalanceInfo.outstanding_balance).toLocaleString("en-IN")}</strong>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Advance Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 10000"
                    value={formAmount || ""}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm text-cyan-300 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Recovery Mode
                  </label>
                  <select
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  >
                    <option value="flexible">Flexible (Admin decides in payroll)</option>
                    <option value="full_next_month">Full recovery in next payroll</option>
                    <option value="monthly_installments">Installments across months</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Reason / Emergency Note
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Reason for advance request..."
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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
                    {isSubmitting ? "Disbursing..." : "Confirm Disbursement"}
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
