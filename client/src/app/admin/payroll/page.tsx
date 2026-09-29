"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Loader2, Download,
  ChevronRight, X, Printer, DollarSign, Check,
  ToggleLeft, ToggleRight, Zap,
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { payrollApi, reportsApi } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PayrollRow {
  id: string;
  empId: string;
  name: string;
  department: string;
  avatar: string;
  basicSalary: number;
  presentDays: number;
  otHours: number;
  otPay: number;
  deductions: number;
  netSalary: number;
  status: "paid" | "unpaid";
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
  const breakdown = [
    { label:"Basic Salary",     value: row.basicSalary, type:"earning" },
    { label:"OT Pay",           value: row.otPay,       type:"earning" },
    { label:"PF Deduction",     value: Math.round(row.basicSalary * 0.06), type:"deduction" },
    { label:"Professional Tax", value: 200,             type:"deduction" },
    { label:"Other Deductions", value: row.deductions - Math.round(row.basicSalary * 0.06) - 200, type:"deduction" },
  ];

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
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale:0.95, opacity:0, y:20 }}
        animate={{ scale:1, opacity:1, y:0 }}
        exit={{ scale:0.95, opacity:0, y:20 }}
        transition={{ type:"spring", stiffness:300, damping:28 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ background:"rgba(10,15,30,0.99)", border:"1px solid rgba(255,255,255,0.1)", boxShadow:"0 32px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="px-7 py-5 flex items-center justify-between"
          style={{ background:"linear-gradient(135deg, rgba(0,245,255,0.08), rgba(124,58,237,0.08))", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-1">Payslip</p>
            <h3 className="text-white font-black text-xl">{row.name}</h3>
            <p className="text-white/40 text-xs">{row.empId} · {row.department} · {month}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Breakdown */}
        <div className="px-7 py-5">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Earnings & Deductions</p>
          <div className="flex flex-col gap-2 mb-5">
            {breakdown.filter(b => b.value > 0).map((b) => (
              <div key={b.label} className="flex items-center justify-between py-2"
                style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <span className="text-white/60 text-sm">{b.label}</span>
                <span className="text-sm font-semibold" style={{ color: b.type === "earning" ? "#22c55e" : "#ef4444" }}>
                  {b.type === "deduction" ? "− " : "+ "}₹{b.value.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>

          {/* Attendance */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { label:"Present Days", value: `${row.presentDays} / 26` },
              { label:"OT Hours",     value: `${row.otHours}h` },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-xl text-center"
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white font-bold text-lg">{value}</p>
                <p className="text-white/40 text-xs">{label}</p>
              </div>
            ))}
          </div>

          {/* Net salary */}
          <div className="p-4 rounded-2xl text-center"
            style={{ background:"linear-gradient(135deg, rgba(0,245,255,0.08), rgba(124,58,237,0.08))", border:"1px solid rgba(0,245,255,0.15)" }}>
            <p className="text-white/50 text-xs mb-1">Net Salary</p>
            <p className="text-3xl font-black" style={{ color:"#00f5ff" }}>₹{row.netSalary.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-7 pb-6" style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => { success("Payslip sent to printer."); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white border border-white/10 hover:bg-white/5 transition-all">
            <Printer size={14} />Print
          </button>
          <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-black"
            style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
            <Download size={14} />Download PDF
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Expandable Payroll Row ───────────────────────────────────────────────────
function PayrollRowComponent({ row, index, onPreview, onMarkPaid }: {
  row: PayrollRow; index: number;
  onPreview: () => void; onMarkPaid: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <motion.tr
        initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
        transition={{ delay: index * 0.04 }}
        className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
        style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-4">
          <div className="flex items-center gap-3">
            <ChevronRight size={14} className="text-white/20 shrink-0 transition-transform group-hover:text-white/40"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
              style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>{row.avatar}</div>
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
            <button onClick={onPreview}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-cyan-400 hover:bg-cyan-400/10 border border-white/10 transition-all">
              <FileText size={12} />Payslip
            </button>
            <button onClick={() => onMarkPaid(row.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-all"
              style={{
                color: row.status === "paid" ? "#f59e0b" : "#22c55e",
                borderColor: row.status === "paid" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)",
                background: row.status === "paid" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
              }}>
              {row.status === "paid" ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {row.status === "paid" ? "Unmark" : "Mark Paid"}
            </button>
          </div>
        </td>
      </motion.tr>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}
          >
            <td colSpan={9} className="px-6 pb-4">
              <motion.div
                initial={{ height:0 }}
                animate={{ height:"auto" }}
                exit={{ height:0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-4 gap-3 pt-3">
                  {[
                    { label:"Basic",         value:`₹${row.basicSalary.toLocaleString("en-IN")}`,  color:"#00f5ff" },
                    { label:"PF (12%)",      value:`−₹${Math.round(row.basicSalary*0.06).toLocaleString("en-IN")}`, color:"#ef4444" },
                    { label:"Prof. Tax",     value:"−₹200",                                         color:"#ef4444" },
                    { label:"OT Earnings",   value:`+₹${row.otPay.toLocaleString("en-IN")}`,       color:"#22c55e" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="px-4 py-3 rounded-xl"
                      style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-white/40 text-xs mb-1">{label}</p>
                      <p className="font-bold text-sm" style={{ color }}>{value}</p>
                    </div>
                  ))}
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

  const parsePeriod = useCallback(() => {
    const [mName, yStr] = selectedMonth.split(" ");
    return {
      month: MONTH_MAP[mName] || 6,
      year: Number(yStr) || 2026
    };
  }, [selectedMonth]);

  const fetchPayroll = useCallback(async () => {
    const { month, year } = parsePeriod();
    try {
      const res = await payrollApi.list(month, year);
      const mapped = res.data.map((r: any) => ({
        id: String(r.payroll_id),
        empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
        name: r.employee_name || "Unknown",
        department: r.department || "N/A",
        avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
        basicSalary: Number(r.basic_salary) || 0,
        presentDays: r.present_days || 0,
        otHours: r.overtime_hours || 0,
        otPay: Number(r.overtime_pay) || 0,
        deductions: Number(r.deductions) || 0,
        netSalary: Number(r.final_salary) || 0,
        status: r.is_paid ? "paid" : "unpaid",
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
  const paidCount = rows.filter(r => r.status === "paid").length;

  const handleGenerate = async () => {
    setIsGenerating(true);
    const { month, year } = parsePeriod();
    try {
      await payrollApi.generate(month, year);
      success(`Payroll generated for ${selectedMonth}.`);
      fetchPayroll();
    } catch (err: any) {
      console.error("Error generating payroll", err);
      error(err.response?.data?.detail || "Failed to generate payroll.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkPaid = useCallback(async (id: string) => {
    const row = rows.find(x => x.id === id);
    if (!row) return;
    const nextStatus = row.status !== "paid";
    try {
      await payrollApi.markPaid(id, nextStatus);
      success(`Payroll status updated.`);
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
      link.download = `Payroll_Full_Statement_${selectedMonth.replace(/\s+/g, "_")}.pdf`;
      link.click();
      success("Payroll statement downloaded successfully.");
    } catch (err) {
      console.error("Error exporting bulk payroll:", err);
      error("Failed to export payroll statement.");
    }
  };

  return (
    <div className="min-h-screen" style={{ background:"#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Payroll" />

      <main className="min-h-screen pt-16" style={{ marginLeft:"240px" }}>
        <div className="p-6 lg:p-8">
          <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Payroll Management</h1>
            <p className="text-white/40">Generate and manage monthly salary payroll</p>
          </motion.div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {/* Month selector */}
            <div className="relative">
              <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setGenerated(false); }}
                className="pl-4 pr-10 py-2.5 text-white text-sm outline-none rounded-xl appearance-none font-semibold"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}>
                {MONTHS.map(m => <option key={m} value={m} className="bg-[#0a0f1e]">{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>

            {/* Generate button */}
            <motion.button
              whileHover={{ scale: isGenerating ? 1 : 1.03 }}
              whileTap={{ scale: isGenerating ? 1 : 0.97 }}
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-70"
              style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}
            >
              {isGenerating ? (
                <>
                  <motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}>
                    <Loader2 size={15} />
                  </motion.div>
                  Generating...
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Generate Payroll
                </>
              )}
            </motion.button>

            {generated && (
              <motion.button initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                onClick={handleBulkDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white/70 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all"
                style={{ background:"rgba(255,255,255,0.03)" }}>
                <Download size={14} />All Payslips (ZIP)
              </motion.button>
            )}

            {/* Summary */}
            <div className="ml-auto flex items-center gap-6 text-right">
              <div>
                <p className="text-white/30 text-xs">Total Payroll</p>
                <p className="text-white font-black text-lg">₹{totalPayroll.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Processed</p>
                <p className="text-green-400 font-black text-lg">{paidCount}/{rows.length}</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-6 h-1.5 w-full rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
            <motion.div className="h-full rounded-full"
              style={{ background:"linear-gradient(90deg,#22c55e,#00f5ff)" }}
              initial={{ width:0 }}
              animate={{ width:`${(paidCount / rows.length) * 100}%` }}
              transition={{ duration:1, ease:"easeOut" }} />
          </div>

          {/* Payroll table */}
          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }} className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                    {["Employee","Basic Salary","Present Days","OT Hours","OT Pay","Deductions","Net Salary","Status","Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isGenerating ? (
                    <LoadingSkeleton rows={6} cols={9} />
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-white/40 text-sm">
                        No payroll records found for {selectedMonth}.
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
                      <PayrollRowComponent key={row.id} row={row} index={i}
                        onPreview={() => setPreviewRow(row)}
                        onMarkPaid={handleMarkPaid} />
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
      </AnimatePresence>
    </div>
  );
}
