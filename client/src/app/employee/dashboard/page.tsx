"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Download,
  Fingerprint,
  Radio,
  Globe,
  Loader2,
  ArrowRight,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { useCountUp } from "@/hooks/useCountUp";
import { useAuth } from "@/context/AuthContext";
import { employeeSelfApi, payrollApi } from "@/services/api";
import { formatTime, formatDate, formatCurrency } from "@/utils/formatters";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ─── Stat Card Component ───────────────────────────────────────────────────────
function EmpStatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  prefix = "",
  suffix = "",
  index = 0,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  prefix?: string;
  suffix?: string;
  index?: number;
}) {
  const count = useCountUp(value, 1200, index * 80);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between shadow-lg"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/50">{title}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-3xl font-black mb-1" style={{ color }}>
          {prefix}{count.toLocaleString("en-IN")}{suffix}
        </p>
        {subtitle && <p className="text-[11px] text-white/40 leading-tight">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

// ─── Main Employee Dashboard ──────────────────────────────────────────────────
export default function EmployeeDashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error } = useToast();

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any>(null);
  const [leaveBalance, setLeaveBalance] = useState<any>(null);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadEmployeeData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const [attRes, statsRes, balanceRes, payRes] = await Promise.all([
        employeeSelfApi.myAttendance(currentMonth, currentYear),
        employeeSelfApi.myStats(currentMonth, currentYear),
        employeeSelfApi.myLeaveBalance(),
        employeeSelfApi.myPayroll(currentYear),
      ]);

      setAttendanceRecords(attRes.data || []);
      setMonthlyStats(statsRes.data || null);
      setLeaveBalance(balanceRes.data || null);
      setPayrollHistory(payRes.data || []);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
      error("Could not sync employee data.");
    } finally {
      setIsLoadingData(false);
    }
  }, [currentMonth, currentYear, error]);

  useEffect(() => {
    if (user) {
      loadEmployeeData();
    }
  }, [user, loadEmployeeData]);

  // Today's punch record
  const todayStr = now.toISOString().split("T")[0];
  const todayRecord = useMemo(() => {
    return attendanceRecords.find((r) => r.date === todayStr);
  }, [attendanceRecords, todayStr]);

  // Working hours chart data
  const chartData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const map = new Map<number, number>();
    attendanceRecords.forEach((r) => {
      const dayNum = parseInt(r.date.split("-")[2], 10);
      if (!isNaN(dayNum)) {
        map.set(dayNum, parseFloat(r.working_hours) || 0);
      }
    });

    const data: { day: string; hours: number }[] = [];
    const limit = Math.min(daysInMonth, now.getDate());
    for (let d = 1; d <= limit; d++) {
      data.push({
        day: `${d} ${MONTH_NAMES[currentMonth - 1].slice(0, 3)}`,
        hours: map.get(d) || 0,
      });
    }
    return data;
  }, [attendanceRecords, currentMonth, currentYear, now]);

  const handleDownloadLatestPayslip = async () => {
    if (!payrollHistory || payrollHistory.length === 0) {
      error("No finalized payslip available yet for download.");
      return;
    }
    const latest = payrollHistory[0];
    try {
      setIsDownloadingPdf(true);
      const res = await payrollApi.downloadPdf(latest.payroll_id);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Payslip_${MONTH_NAMES[latest.month - 1]}_${latest.year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success("Payslip PDF downloaded successfully.");
    } catch (err) {
      console.error("PDF download error:", err);
      error("Could not download payslip PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (authLoading || (!user && isLoadingData)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  const baseSalary = Number(user?.salary || 0);
  const latestFinalizedSalary = payrollHistory.length > 0 ? Number(payrollHistory[0].final_salary) : null;
  const displaySalary = latestFinalizedSalary !== null ? latestFinalizedSalary : baseSalary;
  const salaryLabel = latestFinalizedSalary !== null ? "Latest Finalized Net" : "Configured Monthly CTC";
  const salarySubtitle = latestFinalizedSalary !== null
    ? `Paid for ${MONTH_NAMES[payrollHistory[0].month - 1]}`
    : "September payroll pending finalization";

  const totalLeaveQuota = leaveBalance?.total_remaining ?? 37;
  const leaveSubtitle = `${leaveBalance?.casual ?? 12} Casual · ${leaveBalance?.sick ?? 10} Sick · ${leaveBalance?.paid ?? 15} Paid`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <EmployeeSidebar />
      <EmployeeTopBar
        title="My Dashboard"
        subtitle="Real-time attendance tracking and workforce overview"
        onRefresh={loadEmployeeData}
        isRefreshing={isLoadingData}
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        {/* Welcome Greeting Banner */}
        <div className="mb-8">
          <p className="text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            Welcome Back
          </p>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-2xl md:text-3xl font-black text-white">{user?.name} 👋</h2>
            <span className="text-white/40 text-xs md:text-sm">
              ({user?.designation || "Software Engineer"} · {user?.department || "Engineering"} · ID: {user?.employee_code || `EMP${String(user?.employee_id).padStart(3, "0")}`})
            </span>
          </div>
        </div>

        {/* Real Data Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <EmpStatCard
            title={`Present Days (${MONTH_NAMES[currentMonth - 1]})`}
            value={monthlyStats?.present_days ?? 0}
            suffix=" days"
            subtitle={`${monthlyStats?.on_time_days ?? 0} on-time · ${monthlyStats?.late_days ?? 0} late`}
            icon={<CheckCircle2 size={18} />}
            color="#10b981"
            index={0}
          />
          <EmpStatCard
            title="Absent Days"
            value={monthlyStats?.absent_days ?? 0}
            suffix=" days"
            subtitle={`Out of ${monthlyStats?.working_days_elapsed ?? 0} elapsed working days`}
            icon={<AlertCircle size={18} />}
            color="#ef4444"
            index={1}
          />
          <EmpStatCard
            title="Leave Balance"
            value={totalLeaveQuota}
            suffix=" days"
            subtitle={leaveSubtitle}
            icon={<TrendingUp size={18} />}
            color="#00f5ff"
            index={2}
          />
          <EmpStatCard
            title={salaryLabel}
            value={displaySalary}
            prefix="₹"
            subtitle={salarySubtitle}
            icon={<DollarSign size={18} />}
            color="#a855f7"
            index={3}
          />
        </div>

        {/* Today's Punch Live Banner */}
        <div className="mb-8 p-5 rounded-2xl bg-white/[0.02] border border-white/10 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: todayRecord ? "rgba(16,185,129,0.15)" : "rgba(0,245,255,0.1)",
                  border: `1px solid ${todayRecord ? "rgba(16,185,129,0.3)" : "rgba(0,245,255,0.2)"}`,
                }}
              >
                {todayRecord ? (
                  <CheckCircle2 size={20} className="text-emerald-400" />
                ) : (
                  <Fingerprint size={20} className="text-cyan-400" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-white">Today's Attendance Status</h3>
                  {todayRecord ? (
                    <StatusBadge status={todayRecord.status} />
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Not Punched Yet
                    </span>
                  )}
                </div>

                {todayRecord ? (
                  <p className="text-xs text-white/60">
                    Checked in at <span className="text-cyan-300 font-mono font-semibold">{formatTime(todayRecord.check_in)}</span>
                    {todayRecord.check_out && (
                      <> · Checked out at <span className="text-white font-mono">{formatTime(todayRecord.check_out)}</span></>
                    )}
                    {todayRecord.working_hours && (
                      <> · Total: <span className="text-emerald-400 font-mono font-bold">{todayRecord.working_hours} hrs</span></>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-white/40">
                    Scan your registered finger on the ESP32 R307 sensor or tap your RFID badge to register today's entry.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                onClick={() => router.push("/employee/attendance")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
              >
                Full Attendance Log
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Working Hours Trend Chart */}
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 mb-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-white">Daily Working Hours ({MONTH_NAMES[currentMonth - 1]})</h3>
              <p className="text-white/40 text-xs mt-0.5">Recorded hours worked per day in current billing cycle</p>
            </div>
            <span className="text-xs font-mono text-cyan-400">
              Total Logged: {monthlyStats?.total_working_hours ?? 0}h
            </span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f5ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} unit="h" />
                <Tooltip
                  contentStyle={{
                    background: "#0d1424",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`${val} hrs`, "Working Hours"]}
                />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#00f5ff"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#hoursGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Two-Column Grid: Recent Punches & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Attendance Activity */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Recent Punch Activity</h3>
                </div>
                <button
                  onClick={() => router.push("/employee/attendance")}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  View All <ArrowRight size={11} />
                </button>
              </div>

              {attendanceRecords.length === 0 ? (
                <div className="py-10 text-center text-white/30 text-xs">
                  No attendance punches logged yet for this month.
                </div>
              ) : (
                <div className="space-y-3">
                  {attendanceRecords.slice(0, 4).map((r) => (
                    <div
                      key={r.attendance_id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{formatDate(r.date)}</p>
                        <p className="text-white/40 text-[10px] font-mono mt-0.5">
                          In: {r.check_in ? formatTime(r.check_in) : "--"} · Out: {r.check_out ? formatTime(r.check_out) : "--"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {r.working_hours && (
                          <span className="font-mono text-cyan-300 font-semibold">{r.working_hours}h</span>
                        )}
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-white/5 text-[11px] text-white/40 flex items-center gap-1.5">
              <UserCheck size={13} className="text-emerald-400" />
              <span>Punches are automatically verified via cryptographic hardware token.</span>
            </div>
          </div>

          {/* Quick Shortcuts & Compensation Summary */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Payroll & Leaves</h3>
                </div>
                <button
                  onClick={() => router.push("/employee/payroll")}
                  className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                >
                  Manage <ArrowRight size={11} />
                </button>
              </div>

              {/* Mini Leave Quota Preview */}
              <div className="mb-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white/70">Remaining Leave Allowances</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">{totalLeaveQuota} days total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <p className="font-bold text-cyan-300">{leaveBalance?.casual ?? 12}</p>
                    <p className="text-[10px] text-white/40">Casual</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="font-bold text-amber-300">{leaveBalance?.sick ?? 10}</p>
                    <p className="text-[10px] text-white/40">Sick</p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="font-bold text-emerald-300">{leaveBalance?.paid ?? 15}</p>
                    <p className="text-[10px] text-white/40">Paid</p>
                  </div>
                </div>
              </div>

              {/* Monthly Salary Statement */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Monthly Base Salary</p>
                  <p className="text-[10px] text-white/40">Registered wage in employee agreement</p>
                </div>
                <p className="text-base font-black text-white font-mono">{formatCurrency(baseSalary)}</p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-white/5 flex items-center gap-2">
              <button
                onClick={() => router.push("/employee/leave")}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-center"
              >
                Apply Leave
              </button>
              <button
                onClick={handleDownloadLatestPayslip}
                disabled={isDownloadingPdf}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all text-center disabled:opacity-50"
              >
                {isDownloadingPdf ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                Download Payslip
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
