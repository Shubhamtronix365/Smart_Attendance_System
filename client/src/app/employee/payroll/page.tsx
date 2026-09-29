"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Download,
  Calendar,
  CreditCard,
  TrendingUp,
  FileCheck,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { employeeSelfApi, payrollApi } from "@/services/api";
import { formatCurrency, formatDate } from "@/utils/formatters";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeePayrollPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error } = useToast();

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const currentMonth = new Date().getMonth() + 1;
      const [payRes, statsRes] = await Promise.all([
        employeeSelfApi.myPayroll(selectedYear),
        employeeSelfApi.myStats(currentMonth, selectedYear),
      ]);
      setPayrollHistory(payRes.data || []);
      setMonthlyStats(statsRes.data || null);
    } catch (err) {
      console.error("Failed to load payroll", err);
      error("Unable to load payroll history.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, error]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const handleDownloadPdf = async (payrollId: number, month: number, year: number) => {
    try {
      setDownloadingId(payrollId);
      const res = await payrollApi.downloadPdf(payrollId);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Payslip_${MONTH_NAMES[month - 1]}_${year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success("Payslip downloaded successfully.");
    } catch (err) {
      console.error("Error downloading payslip:", err);
      error("Could not download payslip. Please try again later.");
    } finally {
      setDownloadingId(null);
    }
  };

  const baseSalary = Number(user?.salary || 0);
  const workingDaysInMonth = monthlyStats?.working_days_total || 22;
  const attendedDays = monthlyStats?.present_days || 0;
  const dailyRate = workingDaysInMonth > 0 ? baseSalary / workingDaysInMonth : 0;
  const estimatedCurrentPay = Math.round(dailyRate * attendedDays);

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
        title="Payroll & Payslips"
        subtitle="Review your salary structure, month-to-date estimates, and payslips"
        onRefresh={loadData}
        isRefreshing={isLoading}
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        {/* Header with Year Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-white">Compensation & Payslips</h2>
            <p className="text-white/40 text-xs mt-0.5">
              Financial statements and wage statements for {selectedYear}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
            <Calendar size={13} className="text-cyan-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-white outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr} className="bg-[#0a0f1e] text-white">
                  {yr} Statements
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Salary Structure & Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/50">Base Monthly CTC</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <CreditCard size={15} />
              </div>
            </div>
            <p className="text-3xl font-black text-white">{formatCurrency(baseSalary)}</p>
            <p className="text-[10px] text-white/40 mt-2">Configured in employee profile</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/50">Daily Wage Equivalent</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <DollarSign size={15} />
              </div>
            </div>
            <p className="text-3xl font-black text-emerald-400">
              {formatCurrency(Math.round(dailyRate))}
            </p>
            <p className="text-[10px] text-white/40 mt-2">
              Based on {workingDaysInMonth} standard working days/mo
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/50">Overtime Policy</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <TrendingUp size={15} />
              </div>
            </div>
            <p className="text-3xl font-black text-purple-400">1.5x</p>
            <p className="text-[10px] text-white/40 mt-2">Paid at 150% hourly rate on approved OT</p>
          </motion.div>
        </div>

        {/* Current Month Projected Banner */}
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-transparent border border-cyan-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                <Clock size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Current Month Accrual (September)</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">
                    In Progress
                  </span>
                </div>
                <p className="text-white/50 text-xs mt-1">
                  You have attended <span className="text-white font-semibold">{attendedDays} days</span> so far.
                  Estimated month-to-date payout is approx. <span className="text-cyan-400 font-bold">{formatCurrency(estimatedCurrentPay)}</span>.
                </p>
              </div>
            </div>

            <div className="text-xs text-white/40 sm:text-right shrink-0">
              <p>Billing Cycle: 1st - 30th Sep</p>
              <p className="text-[10px] text-white/30 mt-0.5">Finalized on monthly cutoff by HR</p>
            </div>
          </div>
        </div>

        {/* Finalized Payslips Table */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Official Disbursed Payslips</h3>
            </div>
            <span className="text-xs text-white/40">
              {payrollHistory.length} {payrollHistory.length === 1 ? "payslip" : "payslips"} available
            </span>
          </div>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-cyan-400" size={28} />
              <p className="text-white/40 text-xs">Loading payroll records...</p>
            </div>
          ) : payrollHistory.length === 0 ? (
            <div className="py-20 text-center">
              <AlertCircle className="mx-auto mb-3 text-white/20" size={40} />
              <p className="text-white/60 text-sm font-medium">No finalized payslips for {selectedYear}</p>
              <p className="text-white/30 text-xs mt-1 max-w-sm mx-auto">
                Once HR/Admin runs the automated payroll computation at the end of the monthly billing period, your downloadable PDF payslips will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-white/40 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-6">Billing Period</th>
                    <th className="py-3.5 px-6">Working Days</th>
                    <th className="py-3.5 px-6">Present / Absent</th>
                    <th className="py-3.5 px-6">Base Salary</th>
                    <th className="py-3.5 px-6">Overtime Pay</th>
                    <th className="py-3.5 px-6">Deductions</th>
                    <th className="py-3.5 px-6">Net Payout</th>
                    <th className="py-3.5 px-6">Disbursement</th>
                    <th className="py-3.5 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payrollHistory.map((p: any) => (
                    <tr key={p.payroll_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6 font-semibold text-white whitespace-nowrap">
                        {MONTH_NAMES[p.month - 1]} {p.year}
                      </td>
                      <td className="py-4 px-6 text-white/70 font-mono">
                        {p.working_days} days
                      </td>
                      <td className="py-4 px-6 text-white/70 font-mono">
                        <span className="text-emerald-400 font-semibold">{p.present_days}</span>
                        <span className="text-white/20 mx-1">/</span>
                        <span className="text-red-400">{p.absent_days}</span>
                      </td>
                      <td className="py-4 px-6 font-mono text-white/80">
                        {formatCurrency(Number(p.basic_salary))}
                      </td>
                      <td className="py-4 px-6 font-mono text-purple-400">
                        +{formatCurrency(Number(p.overtime_pay || 0))}
                      </td>
                      <td className="py-4 px-6 font-mono text-red-400">
                        -{formatCurrency(Number(p.deductions || 0))}
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-emerald-400 text-sm">
                        {formatCurrency(Number(p.final_salary))}
                      </td>
                      <td className="py-4 px-6">
                        {p.is_paid ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Disbursed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Computed (Pending)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDownloadPdf(p.payroll_id, p.month, p.year)}
                          disabled={downloadingId === p.payroll_id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                        >
                          {downloadingId === p.payroll_id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          Payslip PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
