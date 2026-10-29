"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Filter,
  Calendar,
  User,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
  TrendingUp,
  Briefcase,
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { reportsApi, employeesApi } from "@/services/api";
import { formatTime, formatLateDuration } from "@/utils/formatters";
import CheckoutHistoryModal from "@/components/CheckoutHistoryModal";

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportType = "detailed" | "daily" | "monthly" | "payroll";

const DEPARTMENTS = [
  "All Departments",
  "Engineering",
  "HR",
  "Finance",
  "Operations",
  "Design",
  "Marketing",
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half Day" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday (Weekly Off)" },
  { value: "wfh", label: "WFH (Work From Home)" },
];

const REPORT_TABS: { id: ReportType; label: string; desc: string }[] = [
  {
    id: "detailed",
    label: "Detailed Attendance Logs",
    desc: "Every punch timestamp, working hours, late penalty minutes, and overtime",
  },
  {
    id: "daily",
    label: "Daily Attendance",
    desc: "Single-day roster breakdown across all or specific employees",
  },
  {
    id: "monthly",
    label: "Monthly Summary",
    desc: "Monthly aggregate totals (days present, absent, leave & overtime)",
  },
  {
    id: "payroll",
    label: "Payroll Report",
    desc: "Salary disbursements, basic pay, deductions, and payment statuses",
  },
];

// ─── Detailed Logs (Each Punch / Day) Table ──────────────────────────────────
function DetailedLogsTable({ data, onSelectPunches }: { data: any[]; onSelectPunches?: (r: any) => void }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            "Date",
            "Employee",
            "Department",
            "Check-In",
            "Check-Out",
            "Working Hours",
            "Late By",
            "Overtime",
            "Status",
          ].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={9} className="text-center py-16 text-white/40 text-sm">
              No detailed attendance logs match the selected filters.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr
              key={r.id || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <td className="px-4 py-3.5 text-cyan-300 font-mono text-xs whitespace-nowrap">
                {r.date}
              </td>
              <td className="px-4 py-3.5 text-white text-sm font-semibold">
                <div>
                  <span>{r.name}</span>
                  <span className="block text-[11px] text-white/40 font-mono">{r.empId}</span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/80 text-sm font-mono font-medium">
                {r.checkIn}
              </td>
              <td className="px-4 py-3.5 text-white/80 text-sm font-mono font-medium">
                <div className="flex flex-col items-start gap-1">
                  {r.checkIn && r.checkIn !== "—" && r.checkIn !== "--:--" && (!r.checkOut || r.checkOut === "—" || r.checkOut === "--:--") ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Active Session
                    </span>
                  ) : (
                    <span>{r.checkOut}</span>
                  )}
                  {r.checkoutCount && r.checkoutCount > 1 && onSelectPunches ? (
                    <button
                      type="button"
                      onClick={() => onSelectPunches(r)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-all cursor-pointer"
                      title="Click to view all check-out checkpoints and session breakdown"
                    >
                      <Clock size={10} />
                      {r.checkoutCount} checkouts
                    </button>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/70 text-sm">{r.hours}</td>
              <td className="px-4 py-3.5 text-sm">
                {r.lateMinutes > 0 ? (
                  <span className="text-amber-400 font-medium text-xs flex items-center gap-1">
                    <AlertTriangle size={11} /> Late by {formatLateDuration(r.lateMinutes)}
                  </span>
                ) : (
                  <span className="text-white/20">—</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-sm">
                {r.otHours && r.otHours !== "—" ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}
                  >
                    {r.otHours}
                  </span>
                ) : (
                  <span className="text-white/20">—</span>
                )}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge
                  status={r.status as "present" | "absent" | "late" | "halfday" | "leave"}
                  size="sm"
                />
              </td>
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Daily Report Table ───────────────────────────────────────────────────────
function DailyTable({ data, onSelectPunches }: { data: any[]; onSelectPunches?: (r: any) => void }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            "Employee",
            "Department",
            "Check-In",
            "Check-Out",
            "Working Hours",
            "Overtime",
            "Status",
          ].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={7} className="text-center py-12 text-white/40 text-sm">
              No daily attendance records found for this date.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr
              key={r.id || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <td className="px-4 py-3.5 text-white text-sm font-semibold">
                <div>
                  <span>{r.name}</span>
                  <span className="block text-[11px] text-white/40 font-mono">
                    EMP{String(r.id).padStart(3, "0")}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/70 text-sm font-mono">{r.checkIn}</td>
              <td className="px-4 py-3.5 text-white/70 text-sm font-mono">
                <div className="flex flex-col items-start gap-1">
                  {r.checkIn && r.checkIn !== "—" && r.checkIn !== "--:--" && (!r.checkOut || r.checkOut === "—" || r.checkOut === "--:--") ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Active Session
                    </span>
                  ) : (
                    <span>{r.checkOut}</span>
                  )}
                  {r.checkoutCount && r.checkoutCount > 1 && onSelectPunches ? (
                    <button
                      type="button"
                      onClick={() => onSelectPunches(r)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-all cursor-pointer"
                      title="Click to view all check-out checkpoints and session breakdown"
                    >
                      <Clock size={10} />
                      {r.checkoutCount} checkouts
                    </button>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/60 text-sm">{r.hours}</td>
              <td className="px-4 py-3.5 text-sm">
                {r.otHours && r.otHours !== "—" ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}
                  >
                    {r.otHours}
                  </span>
                ) : (
                  <span className="text-white/20">—</span>
                )}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge
                  status={r.status as "present" | "absent" | "late" | "halfday" | "leave"}
                  size="sm"
                />
              </td>
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Monthly Report Table ─────────────────────────────────────────────────────
function MonthlyTable({ data }: { data: any[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            "Employee",
            "Department",
            "Designation",
            "Present",
            "Absent",
            "Leave",
            "Overtime (hrs)",
          ].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={7} className="text-center py-12 text-white/40 text-sm">
              No monthly attendance summaries found for this month.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr
              key={r.id || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <td className="px-4 py-3.5 text-white text-sm font-semibold">
                <div>
                  <span>{r.name}</span>
                  <span className="block text-[11px] text-white/40 font-mono">
                    EMP{String(r.id).padStart(3, "0")}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/40 text-sm">{r.designation}</td>
              <td className="px-4 py-3.5">
                <span className="text-green-400 font-bold text-sm">{r.present}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-red-400 font-bold text-sm">{r.absent}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-violet-400 font-bold text-sm">{r.leave}</span>
              </td>
              <td className="px-4 py-3.5">
                <span
                  className="px-2 py-1 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}
                >
                  {r.otHours}h
                </span>
              </td>
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Payroll Report Table ─────────────────────────────────────────────────────
function PayrollTable({ data }: { data: any[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Employee", "Department", "Basic Salary", "Net Salary", "Status"].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={5} className="text-center py-12 text-white/40 text-sm">
              No payroll reports found for this period.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr
              key={r.id || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <td className="px-4 py-3.5 text-white text-sm font-semibold">
                <div>
                  <span>{r.name}</span>
                  <span className="block text-[11px] text-white/40 font-mono">
                    EMP{String(r.id).padStart(3, "0")}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/60 text-sm">
                ₹{Number(r.basic).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3.5 text-green-400 font-bold text-sm">
                ₹{Number(r.net).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={r.status as "paid" | "unpaid"} size="sm" />
              </td>
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { success, error } = useToast();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const [activeReport, setActiveReport] = useState<ReportType>("detailed");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [fromDate, setFromDate] = useState(`${currentMonthStr}-01`);
  const [toDate, setToDate] = useState(
    `${currentMonthStr}-${String(lastDayOfMonth).padStart(2, "0")}`
  );
  const [department, setDepartment] = useState("All Departments");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  const [employees, setEmployees] = useState<any[]>([]);
  const [detailedData, setDetailedData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [selectedPunchesRecord, setSelectedPunchesRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load employee list for the selector
  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await employeesApi.list({ size: "100" });
        if (Array.isArray(res.data)) {
          setEmployees(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch employees list for report filter:", err);
      }
    }
    loadEmployees();
  }, []);

  const handleMonthChange = (monthVal: string) => {
    setSelectedMonth(monthVal);
    const [y, m] = monthVal.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setFromDate(`${monthVal}-01`);
    setToDate(`${monthVal}-${String(lastDay).padStart(2, "0")}`);
  };

  const handlePresetDate = (preset: "this_month" | "last_month" | "today" | "last_7_days") => {
    const today = new Date();
    if (preset === "this_month") {
      const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      handleMonthChange(monthStr);
    } else if (preset === "last_month") {
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const monthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
      handleMonthChange(monthStr);
    } else if (preset === "today") {
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === "last_7_days") {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      const toStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const fromStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`;
      setFromDate(fromStr);
      setToDate(toStr);
    }
  };

  const selectedEmployeeObj = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => String(e.employee_id) === String(selectedEmployeeId)) || null;
  }, [employees, selectedEmployeeId]);

  // Aggregate stats for currently viewed detailed records
  const detailedStats = useMemo(() => {
    const total = detailedData.length;
    let present = 0;
    let lateCount = 0;
    let lateMins = 0;
    let otHours = 0;
    let totalWorkHours = 0;

    detailedData.forEach((r) => {
      const st = String(r.status).toLowerCase();
      if (["present", "wfh", "late"].includes(st)) {
        present++;
      } else if (st === "halfday" || st === "half_day") {
        present += 0.5;
      }
      if (r.lateMinutes > 0) {
        lateCount++;
        lateMins += Number(r.lateMinutes);
      }
      if (r.otHours && r.otHours !== "—") {
        otHours += parseFloat(String(r.otHours).replace("h", "")) || 0;
      }
      if (r.hours && r.hours !== "—") {
        totalWorkHours += parseFloat(String(r.hours).replace("h", "")) || 0;
      }
    });

    return {
      total,
      present,
      lateCount,
      lateMins,
      otHours,
      totalWorkHours,
    };
  }, [detailedData]);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    const d = new Date(fromDate);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const dept = department === "All Departments" ? "" : department;
    const empId = selectedEmployeeId ? Number(selectedEmployeeId) : undefined;
    const stat = selectedStatus || undefined;

    try {
      if (activeReport === "detailed") {
        const res = await reportsApi.detailedAttendanceLogs({
          start_date: fromDate,
          end_date: toDate,
          department: dept,
          employee_id: empId,
          status: stat,
        });
        const mapped = res.data.map((r: any) => {
          let parsedPunches = [];
          if (r.punches) {
            try {
              parsedPunches = typeof r.punches === "string" ? JSON.parse(r.punches) : r.punches;
            } catch {
              parsedPunches = [];
            }
          }
          const cnt = r.checkout_count || (parsedPunches.length > 0 ? parsedPunches.filter((p: any) => p.out).length : (r.check_out ? 1 : 0));
          return {
            id: String(r.id || r.attendance_id),
            date: r.date,
            empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
            name: r.employee_name || "Unknown",
            dept: r.department || "N/A",
            checkIn: r.check_in_formatted || formatTime(r.check_in, true),
            checkOut: r.check_out_formatted || formatTime(r.check_out, true),
            hours: r.working_hours ? `${r.working_hours}h` : "—",
            workingHours: r.working_hours ? `${r.working_hours}h` : "—",
            lateMinutes: r.late_minutes || 0,
            otHours: r.overtime_hours && Number(r.overtime_hours) > 0 ? `${r.overtime_hours}h` : "—",
            status: r.status === "half_day" ? "halfday" : r.status,
            checkoutCount: cnt,
            punches: parsedPunches,
          };
        });
        setDetailedData(mapped);
      } else if (activeReport === "daily") {
        const res = await reportsApi.dailyAttendance({
          date: fromDate,
          department: dept,
          employee_id: empId,
          status: stat,
        });
        const mapped = res.data.map((r: any) => {
          let parsedPunches = [];
          if (r.punches) {
            try {
              parsedPunches = typeof r.punches === "string" ? JSON.parse(r.punches) : r.punches;
            } catch {
              parsedPunches = [];
            }
          }
          const cnt = r.checkout_count || (parsedPunches.length > 0 ? parsedPunches.filter((p: any) => p.out).length : (r.check_out ? 1 : 0));
          return {
            id: String(r.id || r.attendance_id || r.employee_id),
            date: fromDate,
            empId: `EMP${String(r.employee_id).padStart(3, "0")}`,
            name: r.employee_name || "Unknown",
            dept: r.department || "N/A",
            checkIn: formatTime(r.check_in, true),
            checkOut: formatTime(r.check_out, true),
            hours: r.working_hours ? `${r.working_hours}h` : "—",
            workingHours: r.working_hours ? `${r.working_hours}h` : "—",
            otHours: r.overtime_hours && Number(r.overtime_hours) > 0 ? `${r.overtime_hours}h` : "—",
            status: r.status === "half_day" ? "halfday" : r.status,
            checkoutCount: cnt,
            punches: parsedPunches,
          };
        });
        setDailyData(mapped);
      } else if (activeReport === "monthly") {
        const res = await reportsApi.monthlyAttendance({
          month: String(month),
          year: String(year),
          department: dept,
          employee_id: empId,
        });
        const mapped = res.data.map((r: any) => ({
          id: String(r.employee_id),
          name: r.employee_name || "Unknown",
          dept: r.department || "N/A",
          designation: r.designation || "N/A",
          present: r.present_days || 0,
          absent: r.absent_days || 0,
          leave: r.leave_days || 0,
          otHours: r.overtime_hours || 0,
        }));
        setMonthlyData(mapped);
      } else if (activeReport === "payroll") {
        const res = await reportsApi.payroll({
          month: String(month),
          year: String(year),
          department: dept,
          employee_id: empId,
        });
        const mapped = res.data.map((r: any) => ({
          id: String(r.employee_id),
          name: r.employee_name || "Unknown",
          dept: r.department || "N/A",
          basic: Number(r.basic_salary) || 0,
          net: Number(r.final_salary) || 0,
          status: r.is_paid ? "paid" : "unpaid",
        }));
        setPayrollData(mapped);
      }
    } catch (err) {
      console.error("Error loading report", err);
      error("Failed to load report data.");
    } finally {
      setIsLoading(false);
    }
  }, [
    activeReport,
    fromDate,
    toDate,
    department,
    selectedEmployeeId,
    selectedStatus,
    error,
  ]);

  useEffect(() => {
    fetchReport();
    const interval = setInterval(fetchReport, 30000);

    // WebSocket for real-time attendance updates
    let ws: WebSocket | null = null;
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (["attendance_updated", "live_attendance"].includes(data.event)) {
            fetchReport();
          }
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [fetchReport]);

  const handleExport = async (format: "pdf" | "excel") => {
    try {
      const empLabel = selectedEmployeeObj ? selectedEmployeeObj.name : "All Employees";
      success(`Generating ${activeReport} report for ${empLabel} in ${format.toUpperCase()}...`);

      const d = new Date(fromDate);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const dept = department === "All Departments" ? "" : department;
      const empId = selectedEmployeeId ? Number(selectedEmployeeId) : undefined;
      const stat = selectedStatus || undefined;

      let res;
      let filename = "";
      const ext = format === "pdf" ? "pdf" : "xlsx";

      if (activeReport === "detailed") {
        res = await reportsApi.exportDetailedAttendanceLogs(
          {
            start_date: fromDate,
            end_date: toDate,
            department: dept,
            employee_id: empId,
            status: stat,
          },
          format
        );
        if (selectedEmployeeObj) {
          const code =
            selectedEmployeeObj.employee_code ||
            `EMP${String(selectedEmployeeObj.employee_id).padStart(3, "0")}`;
          filename = `Attendance_Report_${code}_${selectedEmployeeObj.name.replace(/\s+/g, "_")}_${fromDate}_to_${toDate}.${ext}`;
        } else {
          filename = `All_Employees_Detailed_Attendance_${fromDate}_to_${toDate}.${ext}`;
        }
      } else if (activeReport === "daily") {
        res = await reportsApi.exportDailyAttendance(
          {
            date: fromDate,
            department: dept,
            employee_id: empId,
            status: stat,
          },
          format
        );
        if (selectedEmployeeObj) {
          const code =
            selectedEmployeeObj.employee_code ||
            `EMP${String(selectedEmployeeObj.employee_id).padStart(3, "0")}`;
          filename = `Daily_Attendance_${code}_${selectedEmployeeObj.name.replace(/\s+/g, "_")}_{fromDate}.${ext}`;
        } else {
          filename = `Daily_Attendance_${fromDate}.${ext}`;
        }
      } else if (activeReport === "monthly") {
        res = await reportsApi.exportMonthlyAttendance(
          {
            month: String(month),
            year: String(year),
            department: dept,
            employee_id: empId,
          },
          format
        );
        if (selectedEmployeeObj) {
          const code =
            selectedEmployeeObj.employee_code ||
            `EMP${String(selectedEmployeeObj.employee_id).padStart(3, "0")}`;
          filename = `Monthly_Attendance_${code}_${selectedEmployeeObj.name.replace(/\s+/g, "_")}_${year}_${month}.${ext}`;
        } else {
          filename = `Monthly_Attendance_${year}_${month}.${ext}`;
        }
      } else {
        res = await reportsApi.exportPayroll(
          {
            month: String(month),
            year: String(year),
            department: dept,
            employee_id: empId,
          },
          format
        );
        if (selectedEmployeeObj) {
          const code =
            selectedEmployeeObj.employee_code ||
            `EMP${String(selectedEmployeeObj.employee_id).padStart(3, "0")}`;
          filename = `Payroll_Report_${code}_${selectedEmployeeObj.name.replace(/\s+/g, "_")}_${year}_${month}.${ext}`;
        } else {
          filename = `Payroll_Report_${year}_${month}.${ext}`;
        }
      }

      const mimeType =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const blob = new Blob([res.data], { type: mimeType });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      success("Report exported successfully.");
    } catch (err) {
      console.error("Error exporting report:", err);
      error("Failed to export report.");
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Reports" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Reports & Logs</h1>
            <p className="text-white/40">
              Generate, preview, and download full company rosters or individual single-employee attendance reports in Excel and PDF.
            </p>
          </motion.div>

          {/* Report Type Tabs */}
          <div
            className="flex gap-1 mb-6 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {REPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveReport(tab.id)}
                className="relative px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap"
                style={{
                  color: activeReport === tab.id ? "black" : "rgba(255,255,255,0.5)",
                }}
              >
                {activeReport === tab.id && (
                  <motion.div
                    layoutId="report-tab"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Enhanced Filter Bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="neo-card p-5 mb-6 space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-cyan-400" />
                <span className="text-white text-xs font-semibold uppercase tracking-wider">
                  Report Filters & Scope
                </span>
                {selectedEmployeeObj ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                    <User size={11} /> Single Employee: {selectedEmployeeObj.name}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/30 flex items-center gap-1.5">
                    <Users size={11} /> All Employees
                  </span>
                )}
              </div>

              {/* Quick Presets for Date Range */}
              {activeReport === "detailed" && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white/30 text-[11px] font-medium mr-1">Quick Range:</span>
                  {[
                    { id: "this_month", label: "This Month" },
                    { id: "last_month", label: "Last Month" },
                    { id: "last_7_days", label: "Last 7 Days" },
                    { id: "today", label: "Today" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePresetDate(p.id as any)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white transition-all border border-white/[0.06]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Employee Dropdown Filter (Single or All) */}
              <div>
                <label className="text-white/60 text-xs font-medium mb-1.5 flex items-center justify-between">
                  <span>Employee Scope</span>
                  {selectedEmployeeId && (
                    <button
                      onClick={() => setSelectedEmployeeId("")}
                      className="text-cyan-400 hover:text-cyan-300 text-[11px] flex items-center gap-0.5"
                    >
                      <X size={11} /> Clear (View All)
                    </button>
                  )}
                </label>
                <div className="relative">
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl transition-all"
                    style={{
                      background: selectedEmployeeId
                        ? "rgba(0,245,255,0.08)"
                        : "rgba(255,255,255,0.05)",
                      border: selectedEmployeeId
                        ? "1px solid rgba(0,245,255,0.4)"
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <option value="" className="bg-[#0a0f1e]">
                      👥 All Employees (Company-Wide)
                    </option>
                    {employees.map((emp) => (
                      <option
                        key={emp.employee_id}
                        value={emp.employee_id}
                        className="bg-[#0a0f1e]"
                      >
                        {emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`} -{" "}
                        {emp.name} {emp.department ? `(${emp.department})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Department Filter */}
              <div>
                <label className="text-white/60 text-xs font-medium mb-1.5 block">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d} className="bg-[#0a0f1e]">
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Status Filter (Applicable for detailed & daily) */}
              {(activeReport === "detailed" || activeReport === "daily") ? (
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 flex items-center justify-between">
                    <span>Attendance Status</span>
                    {selectedStatus && (
                      <button
                        onClick={() => setSelectedStatus("")}
                        className="text-cyan-400 hover:text-cyan-300 text-[11px] flex items-center gap-0.5"
                      >
                        <X size={11} /> All
                      </button>
                    )}
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl"
                    style={{
                      background: selectedStatus
                        ? "rgba(167,139,250,0.08)"
                        : "rgba(255,255,255,0.05)",
                      border: selectedStatus
                        ? "1px solid rgba(167,139,250,0.4)"
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#0a0f1e]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Month Picker for Monthly / Payroll */
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">
                    Report Month
                  </label>
                  <div className="relative flex items-center">
                    <Calendar
                      size={13}
                      className="absolute left-3 text-white/40 pointer-events-none"
                    />
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => handleMonthChange(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-white text-xs outline-none rounded-xl"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(0,245,255,0.3)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 4. Date Picker Range or Month */}
              {activeReport === "detailed" ? (
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">
                    Date Range (From - To)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full px-2 py-2 text-white text-[11px] outline-none rounded-xl"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full px-2 py-2 text-white text-[11px] outline-none rounded-xl"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                  </div>
                </div>
              ) : activeReport === "daily" ? (
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">
                    Target Day
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 text-white text-xs outline-none rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                </div>
              ) : null}
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
              <div className="text-white/40 text-xs flex items-center gap-2">
                <Clock size={13} className="text-cyan-400" />
                <span>
                  Active Period:{" "}
                  <strong className="text-white/80 font-mono">
                    {activeReport === "detailed" ? `${fromDate} → ${toDate}` : fromDate}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Scope:{" "}
                  <strong className="text-cyan-300">
                    {selectedEmployeeObj ? selectedEmployeeObj.name : "All Employees"}
                  </strong>
                </span>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:bg-white/5 transition-all text-center"
                >
                  <Printer size={13} /> Print
                </button>

                <button
                  onClick={() => handleExport("excel")}
                  title={
                    selectedEmployeeObj
                      ? `Download individual Excel report for ${selectedEmployeeObj.name}`
                      : "Download all employees Excel report"
                  }
                  className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 transition-all text-center"
                >
                  <FileSpreadsheet size={13} />
                  <span>
                    {selectedEmployeeObj
                      ? `Excel (${selectedEmployeeObj.name.split(" ")[0]})`
                      : "Excel (All)"}
                  </span>
                </button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleExport("pdf")}
                  title={
                    selectedEmployeeObj
                      ? `Download individual PDF report for ${selectedEmployeeObj.name}`
                      : "Download all employees PDF report"
                  }
                  className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold text-black text-center"
                  style={{ background: "linear-gradient(135deg,#00f5ff,#7c3aed)" }}
                >
                  <FileText size={13} />
                  <span>
                    {selectedEmployeeObj
                      ? `PDF (${selectedEmployeeObj.name.split(" ")[0]})`
                      : "PDF (All)"}
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Single Employee Spotlight Card OR All Employees Aggregate Summary */}
          {selectedEmployeeObj ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-2xl mb-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(0,245,255,0.06), rgba(124,58,237,0.08))",
                border: "1px solid rgba(0,245,255,0.25)",
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-cyan-300"
                    style={{
                      background: "rgba(0,245,255,0.12)",
                      border: "1px solid rgba(0,245,255,0.3)",
                    }}
                  >
                    {selectedEmployeeObj.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold text-lg">{selectedEmployeeObj.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-400/20 text-cyan-300">
                        {selectedEmployeeObj.employee_code ||
                          `EMP${String(selectedEmployeeObj.employee_id).padStart(3, "0")}`}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-violet-500/20 text-violet-300">
                        Individual View
                      </span>
                    </div>
                    <p className="text-white/50 text-xs mt-0.5 flex items-center gap-2">
                      <span>{selectedEmployeeObj.department || "General"}</span>
                      {selectedEmployeeObj.designation && (
                        <>
                          <span>•</span>
                          <span>{selectedEmployeeObj.designation}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{selectedEmployeeObj.email}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedEmployeeId("")}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <Users size={12} /> Switch to All Employees
                  </button>
                </div>
              </div>

              {/* Real Metrics Spotlight for Single Employee */}
              {activeReport === "detailed" && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-white/[0.08]">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-white/40 text-[11px] block">Logs Recorded</span>
                    <span className="text-white font-bold text-base mt-0.5 block">
                      {detailedStats.total}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-green-400/70 text-[11px] block">Days Present</span>
                    <span className="text-green-400 font-bold text-base mt-0.5 block">
                      {detailedStats.present}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-amber-400/70 text-[11px] block">Late Instances</span>
                    <span className="text-amber-400 font-bold text-base mt-0.5 block">
                      {detailedStats.lateCount}{" "}
                      <span className="text-xs font-normal text-amber-400/70">
                        ({detailedStats.lateMins}m total)
                      </span>
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-violet-400/70 text-[11px] block">Overtime Hours</span>
                    <span className="text-violet-400 font-bold text-base mt-0.5 block">
                      {detailedStats.otHours.toFixed(1)}h
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-cyan-400/70 text-[11px] block">Total Hours</span>
                    <span className="text-cyan-400 font-bold text-base mt-0.5 block">
                      {detailedStats.totalWorkHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            /* All Employees Summary Strip */
            activeReport === "detailed" && detailedData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
              >
                <div className="p-3.5 rounded-xl neo-card flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-400/10 text-cyan-300 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div>
                    <span className="text-white/40 text-[11px] block">Total Records</span>
                    <span className="text-white font-bold text-base">{detailedStats.total}</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl neo-card flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-400/10 text-green-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <span className="text-green-400/70 text-[11px] block">Total Present</span>
                    <span className="text-green-400 font-bold text-base">
                      {detailedStats.present}
                    </span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl neo-card flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <span className="text-amber-400/70 text-[11px] block">Late Punches</span>
                    <span className="text-amber-400 font-bold text-base">
                      {detailedStats.lateCount}{" "}
                      <span className="text-xs font-normal text-amber-400/70">
                        ({detailedStats.lateMins}m)
                      </span>
                    </span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl neo-card flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-400/10 text-violet-400 flex items-center justify-center shrink-0">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <span className="text-violet-400/70 text-[11px] block">Total Overtime</span>
                    <span className="text-violet-400 font-bold text-base">
                      {detailedStats.otHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
              </motion.div>
            )
          )}

          {/* Report Preview Table */}
          <motion.div
            key={activeReport}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="neo-card overflow-hidden"
          >
            <div
              className="px-6 py-4 flex items-center justify-between flex-wrap gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-base">
                    {REPORT_TABS.find((t) => t.id === activeReport)?.label}
                  </p>
                  {selectedEmployeeObj ? (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-400/10 text-cyan-300">
                      Single: {selectedEmployeeObj.name}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/5 text-white/50">
                      Company Roster
                    </span>
                  )}
                  {selectedStatus && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-400/10 text-amber-300">
                      Status: {selectedStatus.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-xs mt-0.5">
                  {activeReport === "detailed"
                    ? `${fromDate} to ${toDate}`
                    : fromDate}{" "}
                  · {department}
                </p>
              </div>
              <span className="text-cyan-400/80 text-xs font-mono">
                {activeReport === "detailed" && "Live preview of individual check-in/out timestamps"}
                {activeReport === "daily" && "Daily punch status & hours"}
                {activeReport === "monthly" && "Monthly cumulative present, absent & OT"}
                {activeReport === "payroll" && "Calculated net pay & disbursement status"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <div className="p-12 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent"
                    />
                  </div>
                ) : (
                  <>
                    {activeReport === "detailed" && (
                      <DetailedLogsTable key="detailed" data={detailedData} onSelectPunches={setSelectedPunchesRecord} />
                    )}
                    {activeReport === "daily" && <DailyTable key="daily" data={dailyData} onSelectPunches={setSelectedPunchesRecord} />}
                    {activeReport === "monthly" && (
                      <MonthlyTable key="monthly" data={monthlyData} />
                    )}
                    {activeReport === "payroll" && (
                      <PayrollTable key="payroll" data={payrollData} />
                    )}
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
              <AnimatePresence>
          {selectedPunchesRecord && (
            <CheckoutHistoryModal
              isOpen={!!selectedPunchesRecord}
              onClose={() => setSelectedPunchesRecord(null)}
              record={selectedPunchesRecord}
              isAdmin={true}
              onUpdate={() => fetchReports()}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
