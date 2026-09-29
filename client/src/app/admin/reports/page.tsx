"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, FileSpreadsheet, Printer, Download, Filter, Calendar } from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { reportsApi } from "@/services/api";
import { formatTime } from "@/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportType = "daily" | "monthly" | "payroll";

const DEPARTMENTS = ["All Departments", "Engineering", "HR", "Finance", "Operations", "Design", "Marketing"];

// ─── Daily Report Table ───────────────────────────────────────────────────────
function DailyTable({ data }: { data: any[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          {["Employee","Department","Check-In","Check-Out","Hours","Status"].map(h => (
            <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={6} className="text-center py-12 text-white/40 text-sm">
              No daily attendance records found for this date.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr key={r.id}
              initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.05 }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-3.5 text-white text-sm font-semibold">{r.name}</td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/60 text-sm font-mono">{r.checkIn}</td>
              <td className="px-4 py-3.5 text-white/60 text-sm font-mono">{r.checkOut}</td>
              <td className="px-4 py-3.5 text-white/60 text-sm">{r.hours}</td>
              <td className="px-4 py-3.5"><StatusBadge status={r.status as "present"|"absent"|"late"|"halfday"|"leave"} size="sm" /></td>
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
        <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          {["Employee","Department","Designation","Present","Absent","Leave","Overtime (hrs)"].map(h => (
            <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">{h}</th>
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
            <motion.tr key={r.id || i}
              initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.05 }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-3.5 text-white text-sm font-semibold">{r.name}</td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/40 text-sm">{r.designation}</td>
              <td className="px-4 py-3.5"><span className="text-green-400 font-bold text-sm">{r.present}</span></td>
              <td className="px-4 py-3.5"><span className="text-red-400 font-bold text-sm">{r.absent}</span></td>
              <td className="px-4 py-3.5"><span className="text-violet-400 font-bold text-sm">{r.leave}</span></td>
              <td className="px-4 py-3.5"><span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background:"rgba(167,139,250,0.1)", color:"#a78bfa" }}>{r.otHours}h</span></td>
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
        <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          {["Employee","Department","Basic Salary","Net Salary","Status"].map(h => (
            <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={5} className="text-center py-12 text-white/40 text-sm">
              No payroll reports found for this month.
            </td>
          </tr>
        ) : (
          data.map((r, i) => (
            <motion.tr key={r.id}
              initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.05 }}
              className="hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-3.5 text-white text-sm font-semibold">{r.name}</td>
              <td className="px-4 py-3.5 text-white/50 text-sm">{r.dept}</td>
              <td className="px-4 py-3.5 text-white/60 text-sm">₹{Number(r.basic).toLocaleString("en-IN")}</td>
              <td className="px-4 py-3.5 text-green-400 font-bold text-sm">₹{Number(r.net).toLocaleString("en-IN")}</td>
              <td className="px-4 py-3.5"><StatusBadge status={r.status as "paid"|"unpaid"} size="sm" /></td>
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id:"daily",   label:"Daily Attendance"   },
  { id:"monthly", label:"Monthly Attendance" },
  { id:"payroll", label:"Payroll Report"     },
];

export default function ReportsPage() {
  const { success, error } = useToast();
  const [activeReport, setActiveReport] = useState<ReportType>("daily");
  const [fromDate, setFromDate] = useState(new Date().toISOString().split("T")[0]);
  const [toDate, setToDate]     = useState(new Date().toISOString().split("T")[0]);
  const [department, setDepartment] = useState("All Departments");

  const [dailyData, setDailyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    const d = new Date(fromDate);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const dept = department === "All Departments" ? "" : department;

    try {
      if (activeReport === "daily") {
        const res = await reportsApi.dailyAttendance({ date: fromDate, department: dept });
        const mapped = res.data.map((r: any) => ({
          id: String(r.employee_id),
          name: r.employee_name || "Unknown",
          dept: r.department || "N/A",
          checkIn: formatTime(r.check_in, true),
          checkOut: formatTime(r.check_out, true),
          hours: r.working_hours ? `${r.working_hours}h` : "—",
          status: r.status === "half_day" ? "halfday" : r.status,
        }));
        setDailyData(mapped);
      } else if (activeReport === "monthly") {
        const res = await reportsApi.monthlyAttendance({ month: String(month), year: String(year) });
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
        const res = await reportsApi.payroll({ month: String(month), year: String(year) });
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
  }, [activeReport, fromDate, department, error]);

  useEffect(() => {
    fetchReport();
    // Poll every 30 seconds as a fallback
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
      success(`Generating ${activeReport} report in ${format.toUpperCase()}...`);
      const d = new Date(fromDate);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const dept = department === "All Departments" ? "" : department;

      let res;
      if (activeReport === "daily") {
        res = await reportsApi.exportDailyAttendance({ date: fromDate, department: dept }, format);
      } else if (activeReport === "monthly") {
        res = await reportsApi.exportMonthlyAttendance({ month: String(month), year: String(year) }, format);
      } else {
        res = await reportsApi.exportPayroll({ month: String(month), year: String(year) }, format);
      }

      const mimeType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const blob = new Blob([res.data], { type: mimeType });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `${activeReport}_Report_${fromDate}.${format === "pdf" ? "pdf" : "xlsx"}`;
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
    <div className="min-h-screen" style={{ background:"#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Reports" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Reports</h1>
            <p className="text-white/40">Generate and export detailed reports</p>
          </motion.div>

          {/* Report type tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
            {REPORT_TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveReport(tab.id)}
                className="relative px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ color: activeReport === tab.id ? "black" : "rgba(255,255,255,0.4)" }}>
                {activeReport === tab.id && (
                  <motion.div layoutId="report-tab"
                    className="absolute inset-0 rounded-xl"
                    style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}
                    transition={{ type:"spring", stiffness:400, damping:32 }} />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
            className="neo-card p-5 flex flex-wrap items-end gap-4 mb-6"
          >
            <Filter size={16} className="text-white/30 mt-auto mb-1 shrink-0" />
            <div>
              <label className="text-white/40 text-xs font-medium mb-1.5 block">Target Date / Start Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }} />
            </div>
            {activeReport === "daily" && (
              <div>
                <label className="text-white/40 text-xs font-medium mb-1.5 block">Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)}
                  className="px-4 py-2.5 text-white text-sm outline-none rounded-xl"
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}>
                  {DEPARTMENTS.map(d => <option key={d} value={d} className="bg-[#0a0f1e]">{d}</option>)}
                </select>
              </div>
            )}

            {/* Export buttons */}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:bg-white/5 transition-all">
                <Printer size={13} />Print
              </button>
              <button onClick={() => handleExport("excel")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/10 transition-all">
                <FileSpreadsheet size={13} />Excel
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => handleExport("pdf")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-black"
                style={{ background:"linear-gradient(135deg,#00f5ff,#7c3aed)" }}>
                <FileText size={13} />PDF
              </motion.button>
            </div>
          </motion.div>

          {/* Report preview table */}
          <motion.div
            key={activeReport}
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
            transition={{ type:"spring", stiffness:200, damping:22 }}
            className="neo-card overflow-hidden"
          >
            <div className="px-6 py-4" style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-white font-bold">
                {REPORT_TABS.find(t => t.id === activeReport)?.label}
              </p>
              <p className="text-white/30 text-xs mt-0.5">
                {fromDate} · {activeReport === "daily" ? department : "All Departments"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <div className="p-8 flex items-center justify-center">
                    <motion.div animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:"linear" }}
                      className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent" />
                  </div>
                ) : (
                  <>
                    {activeReport === "daily"   && <DailyTable   key="daily"   data={dailyData}   />}
                    {activeReport === "monthly" && <MonthlyTable key="monthly" data={monthlyData} />}
                    {activeReport === "payroll" && <PayrollTable key="payroll" data={payrollData} />}
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

