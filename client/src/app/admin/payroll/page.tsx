"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Loader2, Download,
  ChevronRight, X, Printer, DollarSign,
  ToggleLeft, ToggleRight, Zap, Calculator, Sliders,
  AlertCircle, CheckCircle2, RefreshCw, Clock,
  Calendar, ShieldCheck, CreditCard, Receipt
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { payrollApi, reportsApi, employeesApi } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PayrollRow {
  id: string;
  employeeId: number;
  empId: string;
  name: string;
  department: string;
  avatar: string;
  basicSalary: number;
  presentDays: number;
  absentDays: number;
  absentDeduction: number;
  otHours: number;
  otPay: number;
  lateDays: number;
  lateDeduction: number;
  reimbursementAmount: number;
  advanceRecovered: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  status: "paid" | "unpaid";
  calculationSnapshot?: any;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const MONTHS: string[] = [];
for (let y = currentYear; y >= currentYear - 1; y--) {
  for (let m = 0; m < 12; m++) {
    MONTHS.push(`${MONTH_NAMES[m]} ${y}`);
  }
}

// ─── Payslip Modal ────────────────────────────────────────────────────────────
function PayslipModal({ row, month, onClose }: { row: PayrollRow; month: string; onClose: () => void }) {
  const { success, error } = useToast();

  const earnings = [
    { label: "Basic Salary", value: row.basicSalary },
    { label: "Payable Overtime", value: row.otPay },
    { label: "Reimbursements", value: row.reimbursementAmount || 0 },
    { label: "Bonus / Incentives", value: row.bonus || 0 },
  ].filter(e => e.value > 0);

  const deductions = [
    { label: "Absent Days Deduction", value: row.absentDeduction || 0 },
    { label: "Late Marks Penalty", value: row.lateDeduction || 0 },
    { label: "Advance Salary Recovery", value: row.advanceRecovered || 0 },
    { label: "Other Deductions", value: Math.max(0, row.deductions - (row.absentDeduction || 0) - (row.lateDeduction || 0) - (row.advanceRecovered || 0)) },
  ].filter(d => d.value > 0);

  const handleDownload = async () => {
    try {
      success(`Generating payslip PDF for ${row.name}...`);
      const res = await payrollApi.payslip(row.id);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `Payslip_${row.name.replace(/\s+/g, "_")}_${month.replace(/\s+/g, "_")}.pdf`;
      link.click();
      success("Payslip PDF downloaded.");
      onClose();
    } catch (err) {
      console.error("Error downloading payslip:", err);
      error("Failed to download payslip PDF.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="w-full max-w-lg rounded-3xl overflow-hidden"
        style={{ background: "rgba(10,15,30,0.99)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, rgba(0,245,255,0.08), rgba(124,58,237,0.08))", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p className="text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-1">Official Payslip Statement</p>
            <h3 className="text-white font-black text-xl">{row.name}</h3>
            <p className="text-white/40 text-xs mt-0.5">{row.empId} · {row.department} · {month}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Breakdown */}
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Earnings */}
          <div>
            <p className="text-green-400/80 text-xs font-semibold uppercase tracking-wider mb-2">Earnings & Additions</p>
            <div className="space-y-1.5 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
              {earnings.map((e) => (
                <div key={e.label} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-white/70">{e.label}</span>
                  <span className="font-semibold text-green-400">+₹{e.value.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-red-400/80 text-xs font-semibold uppercase tracking-wider mb-2">Deductions & Recoveries</p>
            <div className="space-y-1.5 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
              {deductions.length === 0 ? (
                <p className="text-white/30 text-xs py-1">No deductions recorded.</p>
              ) : (
                deductions.map((d) => (
                  <div key={d.label} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-white/70">{d.label}</span>
                    <span className="font-semibold text-red-400">−₹{d.value.toLocaleString("en-IN")}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Attendance Stats Pill */}
          <div className="grid grid-cols-3 gap-2 text-center pt-2">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-white font-bold text-base">{row.presentDays}</p>
              <p className="text-white/40 text-[10px] uppercase">Present Days</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-white font-bold text-base">{row.absentDays || 0}</p>
              <p className="text-white/40 text-[10px] uppercase">Absent Days</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-white font-bold text-base">{row.otHours}h</p>
              <p className="text-white/40 text-[10px] uppercase">Payable OT</p>
            </div>
          </div>

          {/* Net Salary Highlight */}
          <div
            className="p-4 rounded-2xl text-center"
            style={{ background: "linear-gradient(135deg, rgba(0,245,255,0.08), rgba(124,58,237,0.08))", border: "1px solid rgba(0,245,255,0.2)" }}
          >
            <p className="text-white/50 text-xs mb-1">Net Disbursed Salary</p>
            <p className="text-3xl font-black text-cyan-400 font-mono">₹{row.netSalary.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => { success("Payslip sent to printer."); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white border border-white/10 hover:bg-white/5 transition-all"
          >
            <Printer size={14} /> Print
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-black"
            style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
          >
            <Download size={14} /> Download PDF
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Manual Payroll Calculator Modal ──────────────────────────────────────────
function ManualPayrollModal({
  initialEmployeeId,
  initialMonth,
  initialYear,
  onClose,
  onSaved,
}: {
  initialEmployeeId?: number;
  initialMonth: number;
  initialYear: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number>(initialEmployeeId || 0);
  const [month, setMonth] = useState<number>(initialMonth);
  const [year, setYear] = useState<number>(initialYear);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Authoritative Loaded Backend Data
  const [previewData, setPreviewData] = useState<any>(null);

  // Editable Calculation Controls (Admin-configured rates & options)
  const [absentRate, setAbsentRate] = useState<number>(0);
  const [lateRate, setLateRate] = useState<number>(0);
  const [otRate, setOtRate] = useState<number>(0);
  const [advanceMode, setAdvanceMode] = useState<"none" | "full" | "partial">("none");
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [bonus, setBonus] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>("");
  const [isPaid, setIsPaid] = useState<boolean>(false);

  // Fetch employees list for dropdown
  useEffect(() => {
    employeesApi.list({ size: 100 })
      .then((res) => {
        const list = res.data || [];
        setEmployees(list);
        if (!selectedEmpId && list.length > 0) {
          setSelectedEmpId(list[0].employee_id);
        }
      })
      .catch((err) => console.error("Error loading employees for calculator", err));
  }, []);

  // Fetch individual calculation preview from backend
  const loadPreview = useCallback(async (empId: number, m: number, y: number) => {
    if (!empId) return;
    setIsLoadingPreview(true);
    try {
      const res = await payrollApi.previewIndividual(empId, y, m);
      const data = (res && typeof res === "object" && "data" in res && res.data) ? res.data : res;
      if (!data) return;

      setPreviewData(data);

      // Initialize admin rates from employee configuration
      setAbsentRate(Number(data.absent_rate) || 0);
      setLateRate(Number(data.late_rate) || 0);
      setOtRate(Number(data.ot_rate) || 0);
      setBonus(Number(data.bonus) || 0);
      setOtherDeductions(0);
      setRemarks(data.remarks || (data.already_saved ? "Authoritative calculation snapshot" : ""));
      setIsPaid(Boolean(data.is_paid));

      // Advance initialization
      const outstanding = Number(data.advance_balance_outstanding) || 0;
      if (outstanding > 0) {
        setAdvanceMode("full");
        setAdvanceAmount(outstanding);
      } else {
        setAdvanceMode("none");
        setAdvanceAmount(0);
      }
    } catch (err: any) {
      console.error("Error loading payroll preview", err);
      const detail = err.response?.data?.detail;
      const errMsg = typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : "Failed to load calculation preview.";
      error(errMsg);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [error]);

  useEffect(() => {
    if (selectedEmpId) {
      loadPreview(selectedEmpId, month, year);
    }
  }, [selectedEmpId, month, year, loadPreview]);

  // Derived calculations matching strict backend formulas
  const basicSalary = previewData ? Number(previewData.basic_salary) || 0 : 0;
  const absentDays = previewData ? Number(previewData.absent_days) || 0 : 0;
  const totalAbsentDeduction = Math.round(absentDays * absentRate);

  const applicableLate = previewData ? Number(previewData.applicable_late_entries) || 0 : 0;
  const totalLateDeduction = Math.round(applicableLate * lateRate);

  const payableOtHours = previewData ? Number(previewData.payable_ot_hours) || 0 : 0;
  const totalOtPay = Math.round(payableOtHours * otRate);

  const approvedReimbursements = previewData ? Number(previewData.total_approved_reimbursements) || 0 : 0;
  const advanceOutstanding = previewData ? Number(previewData.advance_balance_outstanding) || 0 : 0;

  let advanceRecovery = 0;
  if (advanceMode === "full") {
    advanceRecovery = advanceOutstanding;
  } else if (advanceMode === "partial") {
    advanceRecovery = Math.min(advanceOutstanding, Math.max(0, advanceAmount));
  } else {
    advanceRecovery = 0;
  }
  const remainingAdvance = Math.max(0, advanceOutstanding - advanceRecovery);

  const totalAdditions = basicSalary + totalOtPay + approvedReimbursements + bonus;
  const totalDeductions = totalAbsentDeduction + totalLateDeduction + advanceRecovery + otherDeductions;
  const finalSalary = Math.max(0, totalAdditions - totalDeductions);

  const handleSave = async () => {
    if (!selectedEmpId) {
      error("Please select an employee.");
      return;
    }
    setIsSaving(true);
    try {
      await payrollApi.saveManualPayroll({
        employee_id: selectedEmpId,
        month,
        year,
        absent_rate: absentRate,
        late_rate: lateRate,
        ot_rate: otRate,
        advance_recovery_mode: advanceMode,
        advance_recovery_amount: advanceRecovery,
        bonus,
        other_deductions: otherDeductions,
        remarks,
        is_paid: isPaid,
      });
      success("Authoritative payroll record finalized and saved!");
      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving manual payroll", err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : "Failed to finalize payroll.";
      error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative w-full max-w-4xl my-4 rounded-3xl overflow-hidden"
        style={{
          background: "rgba(10,15,30,0.99)",
          border: "1px solid rgba(0,245,255,0.25)",
          boxShadow: "0 32px 90px rgba(0,0,0,0.85)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading overlay when preview is loading */}
        {isLoadingPreview && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
            <Loader2 size={38} className="animate-spin text-cyan-400 mb-3" />
            <p className="text-white text-sm font-semibold">Retrieving authoritative database records...</p>
            <p className="text-white/40 text-xs mt-1">Fetching monthly attendance, overtime, advances and reimbursements</p>
          </div>
        )}

        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{
            background: "linear-gradient(135deg, rgba(0,245,255,0.12), rgba(124,58,237,0.12))",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-cyan-400 shrink-0"
              style={{ background: "rgba(0,245,255,0.1)", border: "1px solid rgba(0,245,255,0.25)" }}
            >
              <Calculator size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-black text-xl">Authoritative Payroll Calculator</h3>
                <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Direct DB Integration
                </span>
              </div>
              <p className="text-white/40 text-xs mt-0.5">
                Exact deductions, daily floored overtime (&gt;1h threshold), advance recovery & reimbursements
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {/* Controls: Employee & Period Select */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                Select Employee
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(Number(e.target.value))}
                className="w-full px-3 py-2 text-white text-sm outline-none rounded-xl bg-white/[0.05] border border-white/10 focus:border-cyan-400"
              >
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id} className="bg-[#0a0f1e]">
                    {emp.name} ({emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                Payroll Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 text-white text-sm outline-none rounded-xl bg-white/[0.05] border border-white/10 focus:border-cyan-400"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1} className="bg-[#0a0f1e]">
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                Payroll Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-white text-sm outline-none rounded-xl bg-white/[0.05] border border-white/10 focus:border-cyan-400"
              >
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <option key={y} value={y} className="bg-[#0a0f1e]">
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Database Attendance Snapshot Pill */}
          {previewData && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Base Salary</p>
                <p className="text-white font-bold text-sm mt-0.5">₹{basicSalary.toLocaleString("en-IN")}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Working Days</p>
                <p className="text-white font-bold text-sm mt-0.5">{previewData.working_days}d</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Present Days</p>
                <p className="text-green-400 font-bold text-sm mt-0.5">{previewData.present_days}d</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Absent Days</p>
                <p className="text-red-400 font-bold text-sm mt-0.5">{absentDays}d</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Payable OT</p>
                <p className="text-purple-400 font-bold text-sm mt-0.5">{payableOtHours}h</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <p className="text-white/40 text-[10px] uppercase font-semibold">Late Entries</p>
                <p className="text-amber-400 font-bold text-sm mt-0.5">{applicableLate}</p>
              </div>
            </div>
          )}

          {/* Form Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Section 1: Simple Absent Day Deduction (Phase 7) */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign size={15} className="text-red-400" />
                  Absent Days Deduction
                </h4>
                <span className="text-[10px] font-mono text-white/40">Direct Rate × Days</span>
              </div>
              <p className="text-white/40 text-xs">
                Formula: {absentDays} absent day{absentDays !== 1 ? "s" : ""} × ₹{absentRate} = <span className="text-red-400 font-semibold">₹{totalAbsentDeduction.toLocaleString("en-IN")}</span>
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Deduction Per Absent Day (₹)</label>
                  <input
                    type="number"
                    value={absentRate}
                    onChange={(e) => setAbsentRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm text-red-400 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-red-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Total Absent Deduction</label>
                  <div className="w-full px-3 py-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl font-mono font-bold">
                    −₹{totalAbsentDeduction.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Late Mark Deduction (Phase 8) */}
            <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-400" />
                  Late Marks Deduction
                </h4>
                <span className="text-[10px] font-mono text-amber-400/80">Applicable: {applicableLate}</span>
              </div>
              <p className="text-white/40 text-xs">
                Formula: {applicableLate} applicable late{applicableLate !== 1 ? "s" : ""} × ₹{lateRate} = <span className="text-amber-300 font-semibold">₹{totalLateDeduction.toLocaleString("en-IN")}</span>
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Rate Per Late Entry (₹)</label>
                  <input
                    type="number"
                    value={lateRate}
                    onChange={(e) => setLateRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm text-amber-300 bg-white/[0.04] border border-amber-500/30 rounded-xl outline-none focus:border-amber-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Total Late Penalty</label>
                  <div className="w-full px-3 py-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl font-mono font-bold">
                    −₹{totalLateDeduction.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Overtime Rules (>1hr threshold, floored, 0 on Sunday) (Phase 9) */}
            <div className="p-5 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                  <Clock size={15} className="text-purple-400" />
                  Payable Overtime Hours
                </h4>
                <span className="text-[10px] font-mono text-purple-400/80">&gt; 1h Floor Rule</span>
              </div>
              <p className="text-white/40 text-xs">
                Formula: {payableOtHours} payable hr{payableOtHours !== 1 ? "s" : ""} × ₹{otRate}/hr = <span className="text-green-400 font-semibold">+₹{totalOtPay.toLocaleString("en-IN")}</span>
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">OT Rate Per Hour (₹)</label>
                  <input
                    type="number"
                    value={otRate}
                    onChange={(e) => setOtRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm text-purple-300 bg-white/[0.04] border border-purple-500/30 rounded-xl outline-none focus:border-purple-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Total Overtime Pay</label>
                  <div className="w-full px-3 py-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl font-mono font-bold">
                    +₹{totalOtPay.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Advance Salary Recovery (Phase 10) */}
            <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <CreditCard size={15} className="text-cyan-400" />
                  Salary Advance Recovery
                </h4>
                <span className="text-[10px] font-mono text-cyan-400/80">Outstanding: ₹{advanceOutstanding.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {(["none", "partial", "full"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAdvanceMode(mode);
                      if (mode === "full") setAdvanceAmount(advanceOutstanding);
                      if (mode === "none") setAdvanceAmount(0);
                    }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition-all uppercase ${
                      advanceMode === mode
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                        : "border-white/10 text-white/50 hover:text-white"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              {advanceMode === "partial" && (
                <div className="pt-1">
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Partial Recovery Amount (₹)</label>
                  <input
                    type="number"
                    max={advanceOutstanding}
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Math.min(advanceOutstanding, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 text-sm text-cyan-300 bg-white/[0.04] border border-cyan-500/30 rounded-xl outline-none focus:border-cyan-400 font-mono font-bold"
                  />
                </div>
              )}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                <span className="text-white/40">Deduction: <strong className="text-red-400">−₹{advanceRecovery.toLocaleString("en-IN")}</strong></span>
                <span className="text-white/40">Remaining: <strong className="text-cyan-300">₹{remainingAdvance.toLocaleString("en-IN")}</strong></span>
              </div>
            </div>
          </div>

          {/* Section 5: Reimbursements & Bonus / Adjustments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Approved Reimbursements (Phase 11) */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Receipt size={15} className="text-green-400" />
                  Approved Reimbursements
                </h4>
                <span className="text-[10px] font-mono text-green-400/80">Auto-Disbursed</span>
              </div>
              <p className="text-white/40 text-xs">
                Total approved claims for this employee eligible for payment in this payroll run:
              </p>
              <div className="w-full px-3 py-2.5 text-base text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl font-mono font-bold flex items-center justify-between">
                <span>Approved Claims Total:</span>
                <span>+₹{approvedReimbursements.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Adjustments & Remarks */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders size={15} className="text-cyan-400" />
                Bonus, Extra Deductions & Notes
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-[11px] font-medium mb-1 block">Bonus (+) (₹)</label>
                  <input
                    type="number"
                    value={bonus}
                    onChange={(e) => setBonus(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm text-green-400 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-green-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-white/40 text-[11px] font-medium mb-1 block">Other Deductions (-) (₹)</label>
                  <input
                    type="number"
                    value={otherDeductions}
                    onChange={(e) => setOtherDeductions(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm text-red-400 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-red-400 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-white/40 text-[11px] font-medium mb-1 block">Audit Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Authoritative payroll finalized with verified attendance"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-white bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Daily Overtime Detail Table (If OT exists) */}
          {previewData?.daily_overtime_records && previewData.daily_overtime_records.length > 0 && (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
              <h5 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} /> Daily Overtime Records Breakdown (&gt; 1h Shift Excess)
              </h5>
              <div className="overflow-x-auto max-h-36 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-white/30 border-b border-white/5">
                      <th className="py-1.5 px-2">Date</th>
                      <th className="py-1.5 px-2">Day</th>
                      <th className="py-1.5 px-2">Total Hours Worked</th>
                      <th className="py-1.5 px-2">Excess Minutes</th>
                      <th className="py-1.5 px-2 text-right">Payable Hours (Floored)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.daily_overtime_records.map((r: any, idx: number) => (
                      <tr key={idx} className="border-b border-white/[0.02] text-white/70">
                        <td className="py-1 px-2 font-mono">{r.date}</td>
                        <td className="py-1 px-2">{r.is_sunday ? <span className="text-amber-400 font-semibold">Sunday (Record-only: 0 OT)</span> : "Shift Day"}</td>
                        <td className="py-1 px-2 font-mono">{r.actual_hours}h</td>
                        <td className="py-1 px-2 font-mono">{r.excess_minutes} min</td>
                        <td className="py-1 px-2 text-right font-mono text-purple-400 font-bold">
                          {r.payable_ot_hours}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Final Payable Calculation Breakdown Card */}
          <div
            className="p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-6"
            style={{
              background: "linear-gradient(135deg, rgba(0,245,255,0.06), rgba(124,58,237,0.06))",
              borderColor: "rgba(0,245,255,0.25)",
            }}
          >
            <div className="space-y-2 text-center md:text-left">
              <span className="text-white/50 text-xs font-semibold uppercase tracking-wider block">
                Authoritative Calculation Breakdown
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="px-2 py-1 rounded bg-white/5 text-white/70">Base: ₹{basicSalary.toLocaleString("en-IN")}</span>
                <span className="px-2 py-1 rounded bg-green-500/10 text-green-400">+OT: ₹{totalOtPay.toLocaleString("en-IN")} ({payableOtHours}h)</span>
                {approvedReimbursements > 0 && (
                  <span className="px-2 py-1 rounded bg-green-500/10 text-green-400">+Claims: ₹{approvedReimbursements.toLocaleString("en-IN")}</span>
                )}
                {bonus > 0 && (
                  <span className="px-2 py-1 rounded bg-green-500/10 text-green-400">+Bonus: ₹{bonus.toLocaleString("en-IN")}</span>
                )}
                <span className="px-2 py-1 rounded bg-red-500/10 text-red-400">−Absent: ₹{totalAbsentDeduction.toLocaleString("en-IN")} ({absentDays}d)</span>
                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300">−Late: ₹{totalLateDeduction.toLocaleString("en-IN")} ({applicableLate})</span>
                {advanceRecovery > 0 && (
                  <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300">−Advance: ₹{advanceRecovery.toLocaleString("en-IN")}</span>
                )}
                {otherDeductions > 0 && (
                  <span className="px-2 py-1 rounded bg-red-500/10 text-red-400">−Other: ₹{otherDeductions.toLocaleString("en-IN")}</span>
                )}
              </div>
              <p className="text-white/40 text-[11px]">
                Total Additions: ₹{totalAdditions.toLocaleString("en-IN")} | Total Deductions: ₹{totalDeductions.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="text-center md:text-right shrink-0">
              <p className="text-white/50 text-xs mb-0.5">Final Payable Salary</p>
              <p className="text-3xl font-black font-mono text-cyan-400">
                ₹{finalSalary.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => selectedEmpId && loadPreview(selectedEmpId, month, year)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
            >
              <RefreshCw size={13} /> Refresh From DB
            </button>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="rounded accent-cyan-400"
              />
              Mark Disbursed as Paid
            </label>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Finalizing...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Finalize & Save Payroll
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Expandable Payroll Row Component ─────────────────────────────────────────
function PayrollRowComponent({
  row,
  index,
  onPreview,
  onMarkPaid,
  onAdjust,
}: {
  row: PayrollRow;
  index: number;
  onPreview: () => void;
  onMarkPaid: (id: string) => void;
  onAdjust: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-4">
          <div className="flex items-center gap-3">
            <ChevronRight
              size={14}
              className="text-white/20 shrink-0 transition-transform group-hover:text-white/40"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
              style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
            >
              {row.avatar}
            </div>
            <div>
              <p className="text-white text-sm font-semibold">{row.name}</p>
              <p className="text-white/30 text-xs">{row.empId}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4 text-white/60 text-sm">₹{row.basicSalary.toLocaleString("en-IN")}</td>
        <td className="px-4 py-4 text-white/60 text-sm">{row.presentDays}</td>
        <td className="px-4 py-4 text-white/60 text-sm">{row.otHours}h</td>
        <td className="px-4 py-4 text-white/60 text-sm">₹{row.otPay.toLocaleString("en-IN")}</td>
        <td className="px-4 py-4 text-red-400/80 text-sm">−₹{row.deductions.toLocaleString("en-IN")}</td>
        <td className="px-4 py-4">
          <span className="text-green-400 font-bold text-sm">₹{row.netSalary.toLocaleString("en-IN")}</span>
        </td>
        <td className="px-4 py-4">
          <StatusBadge status={row.status} size="sm" />
        </td>
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onAdjust}
              title="Manual calculation & adjustments"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-400/10 border border-amber-500/20 transition-all"
            >
              <Calculator size={12} /> Adjust
            </button>
            <button
              onClick={onPreview}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-cyan-400 hover:bg-cyan-400/10 border border-white/10 transition-all"
            >
              <FileText size={12} /> Payslip
            </button>
            <button
              onClick={() => onMarkPaid(row.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-all"
              style={{
                color: row.status === "paid" ? "#f59e0b" : "#22c55e",
                borderColor: row.status === "paid" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)",
                background: row.status === "paid" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
              }}
            >
              {row.status === "paid" ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {row.status === "paid" ? "Unmark" : "Mark Paid"}
            </button>
          </div>
        </td>
      </motion.tr>

      {/* Expanded breakdown row */}
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
          >
            <td colSpan={9} className="px-6 pb-4">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                  <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-white/40 text-xs mb-1">Basic Salary</p>
                    <p className="font-bold text-sm text-cyan-400">₹{row.basicSalary.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-white/40 text-xs mb-1">Absent Deduction</p>
                    <p className="font-bold text-sm text-red-400">−₹{(row.absentDeduction || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-white/40 text-xs mb-1">Late Penalty</p>
                    <p className="font-bold text-sm text-amber-300">−₹{(row.lateDeduction || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-white/40 text-xs mb-1">Overtime Earnings</p>
                    <p className="font-bold text-sm text-green-400">+₹{row.otPay.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

const MONTH_MAP: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
};

export default function PayrollPage() {
  const { success, error } = useToast();
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const currentMonthName = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [previewRow, setPreviewRow] = useState<PayrollRow | null>(null);
  const [showManualCalc, setShowManualCalc] = useState(false);
  const [selectedCalcEmployeeId, setSelectedCalcEmployeeId] = useState<number | undefined>(undefined);

  const parsePeriod = useCallback(() => {
    const [mName, yStr] = selectedMonth.split(" ");
    return {
      month: MONTH_MAP[mName] || (new Date().getMonth() + 1),
      year: Number(yStr) || new Date().getFullYear(),
    };
  }, [selectedMonth]);

  const fetchPayroll = useCallback(async () => {
    const { month, year } = parsePeriod();
    try {
      const res = await payrollApi.list(month, year);
      const mapped = res.data.map((r: any) => ({
        id: String(r.payroll_id),
        employeeId: r.employee_id,
        empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
        name: r.employee_name || "Unknown",
        department: r.department || "N/A",
        avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
        basicSalary: Number(r.basic_salary) || 0,
        presentDays: r.present_days || 0,
        absentDays: r.absent_days || 0,
        absentDeduction: Number(r.absent_deduction) || 0,
        otHours: Number(r.payable_ot_hours ?? r.overtime_hours) || 0,
        otPay: Number(r.overtime_pay) || 0,
        lateDays: r.late_days || 0,
        lateDeduction: Number(r.late_deduction) || 0,
        reimbursementAmount: Number(r.reimbursement_amount) || 0,
        advanceRecovered: Number(r.advance_recovered) || 0,
        bonus: Number(r.bonus) || 0,
        deductions: Number(r.deductions) || 0,
        netSalary: Number(r.final_salary) || 0,
        status: r.is_paid ? "paid" : "unpaid",
        calculationSnapshot: r.calculation_snapshot,
      }));
      setRows(mapped);
      setGenerated(mapped.length > 0);
    } catch (err) {
      console.error("Error loading payroll", err);
      error("Failed to load payroll list.");
    }
  }, [parsePeriod, error]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  const totalPayroll = rows.reduce((s, r) => s + r.netSalary, 0);
  const paidCount = rows.filter((r) => r.status === "paid").length;

  const handleGenerate = async () => {
    setIsGenerating(true);
    const { month, year } = parsePeriod();
    try {
      await payrollApi.generate(month, year);
      success(`Authoritative payroll generated for ${selectedMonth}.`);
      fetchPayroll();
    } catch (err: any) {
      console.error("Error generating payroll", err);
      error(err.response?.data?.detail || "Failed to generate payroll.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkPaid = useCallback(async (id: string) => {
    const row = rows.find((x) => x.id === id);
    if (!row) return;
    const nextStatus = row.status !== "paid";
    try {
      await payrollApi.markPaid(id, nextStatus);
      success(`Payment disbursement status updated.`);
      fetchPayroll();
    } catch (err) {
      console.error("Error marking paid", err);
      error("Failed to update payment status.");
    }
  }, [rows, fetchPayroll, success, error]);

  const handleBulkDownload = async () => {
    try {
      success("Exporting full payroll statement PDF...");
      const { month, year } = parsePeriod();
      const res = await reportsApi.exportPayroll({ month: String(month), year: String(year) }, "pdf");
      const blob = new Blob([res.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `Payroll_Statement_${selectedMonth.replace(/\s+/g, "_")}.pdf`;
      link.click();
      success("Payroll statement downloaded successfully.");
    } catch (err) {
      console.error("Error exporting bulk payroll:", err);
      error("Failed to export payroll statement.");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Payroll" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Payroll Management</h1>
            <p className="text-white/40">Authoritative calculation engine with exact deductions & database synchronization</p>
          </motion.div>

          {/* Controls Row */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
            <div className="grid grid-cols-1 sm:flex sm:items-center gap-3 w-full sm:w-auto">
              {/* Month Selector */}
              <div className="relative w-full sm:w-auto">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setGenerated(false);
                  }}
                  className="w-full sm:w-auto pl-4 pr-10 py-2.5 text-white text-sm outline-none rounded-xl appearance-none font-semibold cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m} className="bg-[#0a0f1e]">
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>

              {/* Generate Button */}
              <motion.button
                whileHover={{ scale: isGenerating ? 1 : 1.03 }}
                whileTap={{ scale: isGenerating ? 1 : 0.97 }}
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-70 w-full sm:w-auto text-center"
                style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
              >
                {isGenerating ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
                      <Loader2 size={15} />
                    </motion.div>
                    Calculating...
                  </>
                ) : (
                  <>
                    <Zap size={15} /> Generate Monthly Payroll
                  </>
                )}
              </motion.button>
            </div>

            <div className="grid grid-cols-1 sm:flex sm:items-center gap-3 w-full sm:w-auto">
              {/* Manual Calculator Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setSelectedCalcEmployeeId(undefined);
                  setShowManualCalc(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 transition-all w-full sm:w-auto text-center"
                style={{ background: "rgba(245, 158, 11, 0.05)" }}
              >
                <Calculator size={15} /> Authoritative Calculator
              </motion.button>

              {generated && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBulkDownload}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white/70 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all w-full sm:w-auto text-center"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <Download size={14} /> Full Statement (PDF)
                </motion.button>
              )}
            </div>

            {/* Summary */}
            <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-between sm:justify-end gap-6 text-left sm:text-right pt-2 sm:pt-0 border-t border-white/10 sm:border-t-0">
              <div>
                <p className="text-white/30 text-xs">Total Net Payable</p>
                <p className="text-white font-black text-lg">₹{totalPayroll.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Disbursed</p>
                <p className="text-green-400 font-black text-lg">{paidCount}/{rows.length}</p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#22c55e,#00f5ff)" }}
              initial={{ width: 0 }}
              animate={{ width: `${rows.length > 0 ? Math.round((paidCount / rows.length) * 100) : 0}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>

          {/* Payroll Table */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Employee", "Basic Salary", "Present", "Payable OT", "OT Pay", "Deductions", "Net Salary", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isGenerating ? (
                    <LoadingSkeleton rows={6} cols={9} />
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40 text-sm">
                        No finalized payroll records found for {selectedMonth}.
                        <br />
                        <button
                          type="button"
                          onClick={handleGenerate}
                          className="mt-3 px-4 py-2 rounded-xl text-xs font-bold text-black transition-all hover:scale-105"
                          style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                        >
                          Generate Payroll for {selectedMonth} &rarr;
                        </button>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <PayrollRowComponent
                        key={row.id}
                        row={row}
                        index={i}
                        onPreview={() => setPreviewRow(row)}
                        onMarkPaid={handleMarkPaid}
                        onAdjust={() => {
                          setSelectedCalcEmployeeId(row.employeeId);
                          setShowManualCalc(true);
                        }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {previewRow && <PayslipModal row={previewRow} month={selectedMonth} onClose={() => setPreviewRow(null)} />}
        {showManualCalc && (
          <ManualPayrollModal
            key={`manual-calc-${selectedCalcEmployeeId ?? "custom"}`}
            initialEmployeeId={selectedCalcEmployeeId}
            initialMonth={parsePeriod().month}
            initialYear={parsePeriod().year}
            onClose={() => setShowManualCalc(false)}
            onSaved={fetchPayroll}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
