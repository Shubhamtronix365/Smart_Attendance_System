"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Loader2, Download,
  ChevronRight, X, Printer, DollarSign,
  ToggleLeft, ToggleRight, Zap, Calculator, Sliders,
  AlertCircle, CheckCircle2, RefreshCw, Clock,
  Calendar, ShieldCheck, CreditCard, Receipt,
  RotateCcw, Edit3, HelpCircle, Check
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

  // ── 18 Authoritative Formula Sheet Fields ──
  const [monthlySalary, setMonthlySalary] = useState<number>(0); // 1. S
  const [totalWorkingDays, setTotalWorkingDays] = useState<number>(30); // 2. T
  const [weekOffs, setWeekOffs] = useState<number>(4); // 3. WO
  const [holidaysCount, setHolidaysCount] = useState<number>(0); // 4. H
  const [expectedWorkingDays, setExpectedWorkingDays] = useState<number>(26); // 5. EWD
  const [salaryPerDay, setSalaryPerDay] = useState<number>(0); // 6. SPD
  const [salaryPerHour, setSalaryPerHour] = useState<number>(0); // 7. SPH
  const [leavesAbsent, setLeavesAbsent] = useState<number>(0); // 8. A
  const [actualWorkingDays, setActualWorkingDays] = useState<number>(26); // 9. WD
  const [extraWorkingHours, setExtraWorkingHours] = useState<number>(0); // 10. EWH
  const [lateEntry, setLateEntry] = useState<number>(0); // 11. LE
  const [amendmentsLateEntry, setAmendmentsLateEntry] = useState<number>(0); // 12. ALE
  const [finalLateEntry, setFinalLateEntry] = useState<number>(0); // 13. L
  const [payoutWorkingDays, setPayoutWorkingDays] = useState<number>(0); // 14. PWD
  const [payoutExtraHours, setPayoutExtraHours] = useState<number>(0); // 15. PEWH
  const [penaltyDebt, setPenaltyDebt] = useState<number>(0); // 16. D
  const [bonusCreditReward, setBonusCreditReward] = useState<number>(0); // 17. C
  const [finalSalary, setFinalSalary] = useState<number>(0); // 18. FS

  // Manual Override Tracking: preserves any manual changes made by the administrator
  const [customOverrides, setCustomOverrides] = useState<Record<string, boolean>>({});

  // Sub-controls for Debt (D) and Credit (C)
  const [lateRate, setLateRate] = useState<number>(200);
  const [advanceMode, setAdvanceMode] = useState<"none" | "full" | "partial">("none");
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [advanceOutstanding, setAdvanceOutstanding] = useState<number>(0);
  const [bonus, setBonus] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);
  const [approvedReimbursements, setApprovedReimbursements] = useState<number>(0);
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

  // Central recompute helper to maintain strict formula consistency while respecting custom overrides
  const computeDownstream = useCallback((
    base: {
      s: number;
      t: number;
      wo: number;
      h: number;
      ewd: number;
      spd: number;
      sph: number;
      a: number;
      wd: number;
      ewh: number;
      le: number;
      ale: number;
      l: number;
      lateRateVal: number;
      advRec: number;
      otherDeduct: number;
      bonusVal: number;
      reimbVal: number;
      pwdVal: number;
      pewhVal: number;
      debtVal: number;
      creditVal: number;
      fsVal: number;
    },
    overrides: Record<string, boolean>
  ) => {
    // EWD = T - WO - H
    const calcEwd = overrides.expectedWorkingDays ? base.ewd : Math.max(1, base.t - base.wo - base.h);

    // SPD = S / EWD
    const calcSpd = overrides.salaryPerDay ? base.spd : (calcEwd > 0 ? Math.round((base.s / calcEwd) * 100) / 100 : 0);

    // SPH = SPD / 8
    const calcSph = overrides.salaryPerHour ? base.sph : (calcSpd > 0 ? Math.round((calcSpd / 8) * 100) / 100 : 0);

    // WD = EWD - A
    const calcWd = overrides.actualWorkingDays ? base.wd : Math.max(0, calcEwd - base.a);

    // L = max(0, LE - ALE)
    const calcL = overrides.finalLateEntry ? base.l : Math.max(0, base.le - base.ale);

    // PWD = WD * SPD
    const calcPwd = overrides.payoutWorkingDays ? base.pwdVal : Math.round(calcWd * calcSpd * 100) / 100;

    // PEWH = EWH * SPH
    const calcPewh = overrides.payoutExtraHours ? base.pewhVal : Math.round(base.ewh * calcSph * 100) / 100;

    // Debt D = (L * LateRate) + AdvanceRecovery + OtherDeductions
    const lateDeduction = Math.round(calcL * (base.lateRateVal || 0) * 100) / 100;
    const calcDebt = overrides.penaltyDebt ? base.debtVal : Math.round((lateDeduction + base.advRec + base.otherDeduct) * 100) / 100;

    // Credit C = Bonus + ApprovedReimbursements
    const calcCredit = overrides.bonusCreditReward ? base.creditVal : Math.round((base.bonusVal + base.reimbVal) * 100) / 100;

    // Final Salary FS = PWD + PEWH - D + C
    const calcFs = overrides.finalSalary ? base.fsVal : Math.max(0, Math.round((calcPwd + calcPewh - calcDebt + calcCredit) * 100) / 100);

    return {
      ewd: calcEwd,
      spd: calcSpd,
      sph: calcSph,
      wd: calcWd,
      l: calcL,
      pwd: calcPwd,
      pewh: calcPewh,
      debt: calcDebt,
      credit: calcCredit,
      fs: calcFs,
    };
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

      const currentEmp = employees.find((e) => e.employee_id === empId);
      const sheet = data.formula_sheet || {};

      // 1. Monthly Salary (S)
      const s = Number(sheet.monthly_salary ?? data.basic_salary ?? data.base_salary ?? currentEmp?.salary ?? 0);
      // 2. Total Working Days (T)
      const t = Number(sheet.total_working_days ?? data.total_month_days ?? 30);
      // 3. Week Off (WO)
      const wo = Number(sheet.week_off ?? data.week_offs ?? 4);
      // 4. Holiday (H)
      const h = Number(sheet.holiday ?? data.holidays_count ?? 0);
      // 5. Expected Working Days (EWD = T - WO - H)
      const ewd = Number(sheet.expected_working_days ?? Math.max(1, t - wo - h));
      // 6. Salary Per Day (SPD = S / EWD)
      const spd = Number(sheet.salary_per_day ?? (ewd > 0 ? Math.round((s / ewd) * 100) / 100 : 0));
      // 7. Salary Per Hour (SPH = SPD / 8)
      const sph = Number(sheet.salary_per_hour ?? (spd > 0 ? Math.round((spd / 8) * 100) / 100 : 0));
      // 8. Leaves / Absent (A)
      const a = Number(sheet.leaves_absent ?? data.absent_days ?? 0);
      // 9. Actual Working Days (WD = T - WO - H - A)
      const wd = Number(sheet.actual_working_days ?? Math.max(0, ewd - a));
      // 10. Extra Working Hours (EWH)
      const ewh = Number(sheet.extra_working_hours ?? data.payable_ot_hours ?? 0);
      // 11. Late Entry (LE)
      const le = Number(sheet.late_entry ?? data.raw_late_entries ?? data.late_entries ?? 0);
      // 12. Amendments for Late Entry (ALE)
      const ale = Number(sheet.amendments_for_late_entry ?? data.amendments_late_entries ?? 0);
      // 13. Final Late Entry (L = LE - ALE)
      const l = Number(sheet.final_late_entry ?? Math.max(0, le - ale));
      // 14. Payout For Working Days (PWD = WD * SPD)
      const pwd = Number(sheet.payout_for_working_days ?? Math.round(wd * spd * 100) / 100);
      // 15. Payout For Extra Working Hours (PEWH = EWH * SPH)
      const pewh = Number(sheet.payout_for_extra_working_hours ?? Math.round(ewh * sph * 100) / 100);

      // Sub-controls
      const dLate = Number(data.late_rate) || Number(data.default_late_rate) || Number(currentEmp?.late_deduction_rate) || 200;
      const dBonus = Number(data.bonus) || 0;
      const dOtherDeduct = Number(data.other_deductions) || 0;
      const dReimb = Number(data.total_approved_reimbursements ?? data.approved_reimbursements ?? data.reimbursement_amount ?? 0);
      const dAdvanceOut = Number(data.advance_balance_outstanding ?? data.outstanding_advance ?? 0);

      let advRec = 0;
      if (dAdvanceOut > 0) {
        setAdvanceMode("full");
        setAdvanceAmount(dAdvanceOut);
        advRec = dAdvanceOut;
      } else {
        setAdvanceMode("none");
        setAdvanceAmount(0);
      }

      // 16. Penalty / Debt (D)
      const debt = Number(sheet.penalty_debt ?? Math.round(((l * dLate) + advRec + dOtherDeduct) * 100) / 100);
      // 17. Bonus / Credit / Reward (C)
      const credit = Number(sheet.bonus_credit_reward ?? Math.round((dBonus + dReimb) * 100) / 100);
      // 18. Final Salary (FS = PWD + PEWH - D + C)
      const fs = Number(sheet.final_salary ?? Math.max(0, Math.round((pwd + pewh - debt + credit) * 100) / 100));

      // Reset overrides to clean slate
      setCustomOverrides({});

      setMonthlySalary(s);
      setTotalWorkingDays(t);
      setWeekOffs(wo);
      setHolidaysCount(h);
      setExpectedWorkingDays(ewd);
      setSalaryPerDay(spd);
      setSalaryPerHour(sph);
      setLeavesAbsent(a);
      setActualWorkingDays(wd);
      setExtraWorkingHours(ewh);
      setLateEntry(le);
      setAmendmentsLateEntry(ale);
      setFinalLateEntry(l);
      setPayoutWorkingDays(pwd);
      setPayoutExtraHours(pewh);
      setPenaltyDebt(debt);
      setBonusCreditReward(credit);
      setFinalSalary(fs);

      setLateRate(dLate);
      setBonus(dBonus);
      setOtherDeductions(dOtherDeduct);
      setApprovedReimbursements(dReimb);
      setAdvanceOutstanding(dAdvanceOut);
      setRemarks(data.remarks || (data.already_saved ? "Authoritative calculation snapshot" : ""));
      setIsPaid(Boolean(data.is_paid));
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
  }, [employees, error]);

  useEffect(() => {
    if (selectedEmpId) {
      loadPreview(selectedEmpId, month, year);
    }
  }, [selectedEmpId, month, year, loadPreview]);

  // Derived advance recovery based on current mode
  let advanceRecovery = 0;
  if (advanceMode === "full") {
    advanceRecovery = advanceOutstanding;
  } else if (advanceMode === "partial") {
    advanceRecovery = Math.min(advanceOutstanding, Math.max(0, advanceAmount));
  } else {
    advanceRecovery = 0;
  }
  const remainingAdvance = Math.max(0, advanceOutstanding - advanceRecovery);

  // Field change handler: updates field and recomputes downstream
  const handleFieldChange = (field: string, val: number, isDirectOverride = false) => {
    const updatedOverrides = { ...customOverrides };
    if (isDirectOverride) {
      updatedOverrides[field] = true;
    }

    let nextS = monthlySalary;
    let nextT = totalWorkingDays;
    let nextWO = weekOffs;
    let nextH = holidaysCount;
    let nextEWD = expectedWorkingDays;
    let nextSPD = salaryPerDay;
    let nextSPH = salaryPerHour;
    let nextA = leavesAbsent;
    let nextWD = actualWorkingDays;
    let nextEWH = extraWorkingHours;
    let nextLE = lateEntry;
    let nextALE = amendmentsLateEntry;
    let nextL = finalLateEntry;
    let nextPWD = payoutWorkingDays;
    let nextPEWH = payoutExtraHours;
    let nextDebt = penaltyDebt;
    let nextCredit = bonusCreditReward;
    let nextFS = finalSalary;

    let nextLateRate = lateRate;
    let nextAdvRec = advanceRecovery;
    let nextOtherDeduct = otherDeductions;
    let nextBonus = bonus;
    let nextReimb = approvedReimbursements;

    switch (field) {
      case "monthlySalary":
        nextS = val;
        setMonthlySalary(val);
        break;
      case "totalWorkingDays":
        nextT = val;
        setTotalWorkingDays(val);
        break;
      case "weekOffs":
        nextWO = val;
        setWeekOffs(val);
        break;
      case "holidaysCount":
        nextH = val;
        setHolidaysCount(val);
        break;
      case "expectedWorkingDays":
        nextEWD = val;
        setExpectedWorkingDays(val);
        break;
      case "salaryPerDay":
        nextSPD = val;
        setSalaryPerDay(val);
        break;
      case "salaryPerHour":
        nextSPH = val;
        setSalaryPerHour(val);
        break;
      case "leavesAbsent":
        nextA = val;
        setLeavesAbsent(val);
        break;
      case "actualWorkingDays":
        nextWD = val;
        setActualWorkingDays(val);
        break;
      case "extraWorkingHours":
        nextEWH = val;
        setExtraWorkingHours(val);
        break;
      case "lateEntry":
        nextLE = val;
        setLateEntry(val);
        break;
      case "amendmentsLateEntry":
        nextALE = val;
        setAmendmentsLateEntry(val);
        break;
      case "finalLateEntry":
        nextL = val;
        setFinalLateEntry(val);
        break;
      case "payoutWorkingDays":
        nextPWD = val;
        setPayoutWorkingDays(val);
        break;
      case "payoutExtraHours":
        nextPEWH = val;
        setPayoutExtraHours(val);
        break;
      case "penaltyDebt":
        nextDebt = val;
        setPenaltyDebt(val);
        break;
      case "bonusCreditReward":
        nextCredit = val;
        setBonusCreditReward(val);
        break;
      case "finalSalary":
        nextFS = val;
        setFinalSalary(val);
        break;
      case "lateRate":
        nextLateRate = val;
        setLateRate(val);
        break;
      case "otherDeductions":
        nextOtherDeduct = val;
        setOtherDeductions(val);
        break;
      case "bonus":
        nextBonus = val;
        setBonus(val);
        break;
    }

    setCustomOverrides(updatedOverrides);

    const downstream = computeDownstream({
      s: nextS,
      t: nextT,
      wo: nextWO,
      h: nextH,
      ewd: nextEWD,
      spd: nextSPD,
      sph: nextSPH,
      a: nextA,
      wd: nextWD,
      ewh: nextEWH,
      le: nextLE,
      ale: nextALE,
      l: nextL,
      lateRateVal: nextLateRate,
      advRec: nextAdvRec,
      otherDeduct: nextOtherDeduct,
      bonusVal: nextBonus,
      reimbVal: nextReimb,
      pwdVal: nextPWD,
      pewhVal: nextPEWH,
      debtVal: nextDebt,
      creditVal: nextCredit,
      fsVal: nextFS,
    }, updatedOverrides);

    if (!updatedOverrides.expectedWorkingDays) setExpectedWorkingDays(downstream.ewd);
    if (!updatedOverrides.salaryPerDay) setSalaryPerDay(downstream.spd);
    if (!updatedOverrides.salaryPerHour) setSalaryPerHour(downstream.sph);
    if (!updatedOverrides.actualWorkingDays) setActualWorkingDays(downstream.wd);
    if (!updatedOverrides.finalLateEntry) setFinalLateEntry(downstream.l);
    if (!updatedOverrides.payoutWorkingDays) setPayoutWorkingDays(downstream.pwd);
    if (!updatedOverrides.payoutExtraHours) setPayoutExtraHours(downstream.pewh);
    if (!updatedOverrides.penaltyDebt) setPenaltyDebt(downstream.debt);
    if (!updatedOverrides.bonusCreditReward) setBonusCreditReward(downstream.credit);
    if (!updatedOverrides.finalSalary) setFinalSalary(downstream.fs);
  };

  // Reset a specific overridden field back to its authoritative formula
  const resetFieldToFormula = (field: string) => {
    const updatedOverrides = { ...customOverrides };
    delete updatedOverrides[field];
    setCustomOverrides(updatedOverrides);

    const downstream = computeDownstream({
      s: monthlySalary,
      t: totalWorkingDays,
      wo: weekOffs,
      h: holidaysCount,
      ewd: expectedWorkingDays,
      spd: salaryPerDay,
      sph: salaryPerHour,
      a: leavesAbsent,
      wd: actualWorkingDays,
      ewh: extraWorkingHours,
      le: lateEntry,
      ale: amendmentsLateEntry,
      l: finalLateEntry,
      lateRateVal: lateRate,
      advRec: advanceRecovery,
      otherDeduct: otherDeductions,
      bonusVal: bonus,
      reimbVal: approvedReimbursements,
      pwdVal: payoutWorkingDays,
      pewhVal: payoutExtraHours,
      debtVal: penaltyDebt,
      creditVal: bonusCreditReward,
      fsVal: finalSalary,
    }, updatedOverrides);

    if (field === "expectedWorkingDays") setExpectedWorkingDays(downstream.ewd);
    if (field === "salaryPerDay") setSalaryPerDay(downstream.spd);
    if (field === "salaryPerHour") setSalaryPerHour(downstream.sph);
    if (field === "actualWorkingDays") setActualWorkingDays(downstream.wd);
    if (field === "finalLateEntry") setFinalLateEntry(downstream.l);
    if (field === "payoutWorkingDays") setPayoutWorkingDays(downstream.pwd);
    if (field === "payoutExtraHours") setPayoutExtraHours(downstream.pewh);
    if (field === "penaltyDebt") setPenaltyDebt(downstream.debt);
    if (field === "bonusCreditReward") setBonusCreditReward(downstream.credit);
    if (field === "finalSalary") setFinalSalary(downstream.fs);
  };

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
        // Formula overrides sent to backend
        working_days: expectedWorkingDays,
        present_days: Math.round(actualWorkingDays),
        absent_days: leavesAbsent,
        payable_ot_hours: extraWorkingHours,
        late_entries: finalLateEntry,
        absent_rate: salaryPerDay,
        late_rate: lateRate,
        ot_rate: salaryPerHour,
        salary_per_day: salaryPerDay,
        salary_per_hour: salaryPerHour,
        payout_working_days: payoutWorkingDays,
        payout_extra_hours: payoutExtraHours,
        final_salary: finalSalary,
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

  // Define 18 Formula Sheet Rows metadata for clean rendering
  const formulaRows = [
    {
      id: "monthlySalary",
      num: 1,
      label: "Monthly Salary (S)",
      symbol: "S",
      source: "Employee Master",
      sourceColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      value: monthlySalary,
      prefix: "₹",
      suffix: "",
      formulaText: "Employee base salary",
      isCalculated: false,
      step: 100,
    },
    {
      id: "totalWorkingDays",
      num: 2,
      label: "Total Working Days (Fetch From Calendar) (T)",
      symbol: "T",
      source: "Calendar",
      sourceColor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      value: totalWorkingDays,
      prefix: "",
      suffix: "days",
      formulaText: `Total days in ${MONTH_NAMES[month - 1]} ${year}`,
      isCalculated: false,
      step: 1,
    },
    {
      id: "weekOffs",
      num: 3,
      label: "Week Off (Fetch From Calendar) (WO)",
      symbol: "WO",
      source: "Calendar (Sundays)",
      sourceColor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      value: weekOffs,
      prefix: "",
      suffix: "days",
      formulaText: "Count of Sundays in month",
      isCalculated: false,
      step: 1,
    },
    {
      id: "holidaysCount",
      num: 4,
      label: "Holiday (Fetch From Holiday) (H)",
      symbol: "H",
      source: "Holiday Master",
      sourceColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      value: holidaysCount,
      prefix: "",
      suffix: "days",
      formulaText: "Company holidays (excluding Sundays)",
      isCalculated: false,
      step: 1,
    },
    {
      id: "expectedWorkingDays",
      num: 5,
      label: "Expected Working Days [(EWD) = (T - WO - H)]",
      symbol: "EWD",
      source: "Formula: T - WO - H",
      sourceColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      value: expectedWorkingDays,
      prefix: "",
      suffix: "days",
      formulaText: `${totalWorkingDays} − ${weekOffs} − ${holidaysCount} = ${expectedWorkingDays} days`,
      isCalculated: true,
      step: 1,
    },
    {
      id: "salaryPerDay",
      num: 6,
      label: "Salary Per Day [(SPD) = (S / EWD)]",
      symbol: "SPD",
      source: "Formula: S / EWD",
      sourceColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      value: salaryPerDay,
      prefix: "₹",
      suffix: "/day",
      formulaText: `₹${monthlySalary.toLocaleString("en-IN")} / ${expectedWorkingDays}d = ₹${salaryPerDay.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 0.01,
    },
    {
      id: "salaryPerHour",
      num: 7,
      label: "Salary Per Hour [(SPH) = (SPD / 8)]",
      symbol: "SPH",
      source: "Formula: SPD / 8",
      sourceColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      value: salaryPerHour,
      prefix: "₹",
      suffix: "/hr",
      formulaText: `₹${salaryPerDay.toLocaleString("en-IN")} / 8h shift = ₹${salaryPerHour.toLocaleString("en-IN")}/hr`,
      isCalculated: true,
      step: 0.01,
    },
    {
      id: "leavesAbsent",
      num: 8,
      label: "Leaves / Absent (Fetch from Attendance Machine) (A)",
      symbol: "A",
      source: "Attendance Hardware",
      sourceColor: "text-red-400 bg-red-500/10 border-red-500/20",
      value: leavesAbsent,
      prefix: "",
      suffix: "days",
      formulaText: "Recorded absent days from hardware & logs",
      isCalculated: false,
      step: 1,
    },
    {
      id: "actualWorkingDays",
      num: 9,
      label: "Actual Working Days [(WD) = (T - WO - H - A)]",
      symbol: "WD",
      source: "Formula: EWD - A",
      sourceColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      value: actualWorkingDays,
      prefix: "",
      suffix: "days",
      formulaText: `${expectedWorkingDays} − ${leavesAbsent} = ${actualWorkingDays} days`,
      isCalculated: true,
      step: 1,
    },
    {
      id: "extraWorkingHours",
      num: 10,
      label: "Extra Working Hours (Fetch from Attendance System) (EWH)",
      symbol: "EWH",
      source: "Attendance System",
      sourceColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      value: extraWorkingHours,
      prefix: "",
      suffix: "hrs",
      formulaText: "Payable overtime (>1h excess, floored, 0 on Sun)",
      isCalculated: false,
      step: 0.5,
    },
    {
      id: "lateEntry",
      num: 11,
      label: "Late Entry (LE)",
      symbol: "LE",
      source: "Attendance Machine",
      sourceColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      value: lateEntry,
      prefix: "",
      suffix: "entries",
      formulaText: "Total late punch-ins for the month",
      isCalculated: false,
      step: 1,
    },
    {
      id: "amendmentsLateEntry",
      num: 12,
      label: "Amendments for Late Entry (ALE)",
      symbol: "ALE",
      source: "Approved Disputes",
      sourceColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      value: amendmentsLateEntry,
      prefix: "",
      suffix: "entries",
      formulaText: "Approved late arrival waivers/disputes",
      isCalculated: false,
      step: 1,
    },
    {
      id: "finalLateEntry",
      num: 13,
      label: "Final Late Entry [(L) = (LE - ALE)]",
      symbol: "L",
      source: "Formula: LE - ALE",
      sourceColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      value: finalLateEntry,
      prefix: "",
      suffix: "entries",
      formulaText: `${lateEntry} − ${amendmentsLateEntry} = ${finalLateEntry} applicable late`,
      isCalculated: true,
      step: 1,
    },
    {
      id: "payoutWorkingDays",
      num: 14,
      label: "Payout For Working Days [(PWD) = (WD * SPD)]",
      symbol: "PWD",
      source: "Formula: WD × SPD",
      sourceColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      value: payoutWorkingDays,
      prefix: "₹",
      suffix: "",
      formulaText: `${actualWorkingDays}d × ₹${salaryPerDay.toLocaleString("en-IN")} = ₹${payoutWorkingDays.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 10,
    },
    {
      id: "payoutExtraHours",
      num: 15,
      label: "Payout For Extra Working Hours [(PEWH) = (EWH * SPH)]",
      symbol: "PEWH",
      source: "Formula: EWH × SPH",
      sourceColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      value: payoutExtraHours,
      prefix: "₹",
      suffix: "",
      formulaText: `${extraWorkingHours}h × ₹${salaryPerHour.toLocaleString("en-IN")}/hr = ₹${payoutExtraHours.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 10,
    },
    {
      id: "penaltyDebt",
      num: 16,
      label: "Penalty / Debt (D) [Late + Advance + Deductions]",
      symbol: "D",
      source: "Formula: (L × Rate) + Adv + Other",
      sourceColor: "text-red-400 bg-red-500/10 border-red-500/20",
      value: penaltyDebt,
      prefix: "₹",
      suffix: "",
      formulaText: `Late (₹${Math.round(finalLateEntry * lateRate)}) + Adv (₹${advanceRecovery}) + Other (₹${otherDeductions}) = ₹${penaltyDebt.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 10,
    },
    {
      id: "bonusCreditReward",
      num: 17,
      label: "Bonus / Credit / Reward (C) [Bonus + Claims]",
      symbol: "C",
      source: "Formula: Bonus + Claims",
      sourceColor: "text-green-400 bg-green-500/10 border-green-500/20",
      value: bonusCreditReward,
      prefix: "₹",
      suffix: "",
      formulaText: `Bonus (₹${bonus}) + Approved Claims (₹${approvedReimbursements}) = ₹${bonusCreditReward.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 10,
    },
    {
      id: "finalSalary",
      num: 18,
      label: "Final Salary [(FS) = (PWD + PEWH - D + C)]",
      symbol: "FS",
      source: "Master Payout Formula",
      sourceColor: "text-cyan-300 bg-cyan-500/20 border-cyan-400/40 font-bold",
      value: finalSalary,
      prefix: "₹",
      suffix: "",
      formulaText: `₹${payoutWorkingDays.toLocaleString("en-IN")} + ₹${payoutExtraHours.toLocaleString("en-IN")} − ₹${penaltyDebt.toLocaleString("en-IN")} + ₹${bonusCreditReward.toLocaleString("en-IN")} = ₹${finalSalary.toLocaleString("en-IN")}`,
      isCalculated: true,
      step: 10,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative w-full max-w-5xl my-4 rounded-3xl overflow-hidden"
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
            <p className="text-white text-sm font-semibold">Retrieving authoritative database records & formula sheet...</p>
            <p className="text-white/40 text-xs mt-1">Fetching monthly attendance, overtime, advance recovery, reimbursements & calendar</p>
          </div>
        )}

        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
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
                <h3 className="text-white font-black text-xl">Authoritative Payroll Formula Sheet</h3>
                <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Automated & Manual Mode
                </span>
              </div>
              <p className="text-white/40 text-xs mt-0.5">
                Exact mathematical breakdown with full in-place manual editing, real-time formula recalculation & DB snapshot
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
        <div className="p-5 max-h-[78vh] overflow-y-auto space-y-4">
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

          {/* Master 18-Row Formula Spreadsheet Table */}
          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Authoritative Formula Sheet Breakdown (Rows 1 — 18)
                </span>
              </div>
              <span className="text-[11px] text-white/40">
                Click any input to override manually • Formulas recompute automatically
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-white/40 border-b border-white/10 bg-white/[0.02]">
                    <th className="py-2.5 px-3 w-10 text-center font-mono">#</th>
                    <th className="py-2.5 px-3">Metric Description & Symbol</th>
                    <th className="py-2.5 px-3">Data Origin</th>
                    <th className="py-2.5 px-3 w-48 text-right">Value / Manual Input</th>
                    <th className="py-2.5 px-3 text-left">Mathematical Formula & Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {formulaRows.map((r) => {
                    const isOverridden = Boolean(customOverrides[r.id]);
                    const isFinalSalaryRow = r.num === 18;

                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isFinalSalaryRow
                            ? "bg-cyan-500/[0.08] hover:bg-cyan-500/[0.12] border-t-2 border-cyan-400/30"
                            : "hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* Row # */}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-white/50">
                          {r.num}
                        </td>

                        {/* Metric Label */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isFinalSalaryRow ? "text-cyan-300 font-bold text-sm" : "text-white"}`}>
                              {r.label}
                            </span>
                            {isOverridden && (
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30">
                                Overridden
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Source Tag */}
                        <td className="py-2.5 px-3">
                          <span className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${r.sourceColor}`}>
                            {r.source}
                          </span>
                        </td>

                        {/* Value / Input Field */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isOverridden && r.isCalculated && (
                              <button
                                type="button"
                                onClick={() => resetFieldToFormula(r.id)}
                                title="Reset to authoritative formula"
                                className="p-1 rounded text-amber-400 hover:text-white hover:bg-white/10 transition-all"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}

                            <div className="relative inline-flex items-center">
                              {r.prefix && (
                                <span className="absolute left-2.5 text-white/40 font-mono text-xs pointer-events-none">
                                  {r.prefix}
                                </span>
                              )}
                              <input
                                type="number"
                                step={r.step}
                                value={r.value}
                                onChange={(e) => handleFieldChange(r.id, Math.max(0, Number(e.target.value) || 0), r.isCalculated)}
                                className={`w-32 py-1 text-right font-mono font-bold text-xs rounded-lg outline-none border transition-all ${
                                  r.prefix ? "pl-5" : "pl-2"
                                } ${r.suffix ? "pr-8" : "pr-2"} ${
                                  isFinalSalaryRow
                                    ? "bg-cyan-500/15 border-cyan-400 text-cyan-300 text-sm py-1.5 font-black"
                                    : isOverridden
                                    ? "bg-amber-500/10 border-amber-400 text-amber-300"
                                    : "bg-white/[0.04] border-white/10 text-white focus:border-cyan-400"
                                }`}
                              />
                              {r.suffix && (
                                <span className="absolute right-2 text-white/30 font-mono text-[10px] pointer-events-none">
                                  {r.suffix}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Mathematical Note */}
                        <td className="py-2.5 px-3 font-mono text-[11px] text-white/60">
                          {r.formulaText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sub-parameters Fine Tuning: Debt (D) and Credit (C) Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Debt (D) Components: Late Rate, Advance Recovery, Other Deductions */}
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} className="text-red-400" />
                  Penalty & Debt Components (D)
                </h4>
                <span className="text-[10px] font-mono text-red-400">
                  Total D: ₹{penaltyDebt.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Rate per Late Entry */}
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Late Penalty Rate (₹/mark)</label>
                  <input
                    type="number"
                    value={lateRate}
                    onChange={(e) => handleFieldChange("lateRate", Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 text-xs text-amber-300 bg-white/[0.04] border border-amber-500/30 rounded-xl outline-none font-mono font-bold"
                  />
                  <span className="text-[10px] text-white/40 mt-0.5 block">
                    {finalLateEntry} late × ₹{lateRate} = ₹{Math.round(finalLateEntry * lateRate)}
                  </span>
                </div>

                {/* Other Deductions */}
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Other Deductions (₹)</label>
                  <input
                    type="number"
                    value={otherDeductions}
                    onChange={(e) => handleFieldChange("otherDeductions", Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 text-xs text-red-400 bg-white/[0.04] border border-red-500/30 rounded-xl outline-none font-mono font-bold"
                  />
                  <span className="text-[10px] text-white/40 mt-0.5 block">TDS, insurance or penalties</span>
                </div>
              </div>

              {/* Advance Recovery Option */}
              <div className="pt-2 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Salary Advance Recovery</span>
                  <span className="font-mono text-[11px] text-cyan-300">
                    Outstanding: ₹{advanceOutstanding.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(["none", "partial", "full"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setAdvanceMode(mode);
                        let rec = 0;
                        if (mode === "full") rec = advanceOutstanding;
                        if (mode === "none") rec = 0;
                        if (mode === "partial") rec = advanceAmount;
                        setAdvanceAmount(rec);

                        // Trigger recompute with new advance recovery
                        const debt = customOverrides.penaltyDebt
                          ? penaltyDebt
                          : Math.round(((finalLateEntry * lateRate) + rec + otherDeductions) * 100) / 100;
                        setPenaltyDebt(debt);
                        if (!customOverrides.finalSalary) {
                          setFinalSalary(Math.max(0, Math.round((payoutWorkingDays + payoutExtraHours - debt + bonusCreditReward) * 100) / 100));
                        }
                      }}
                      className={`flex-1 py-1 text-xs font-semibold rounded-lg border transition-all uppercase ${
                        advanceMode === mode
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                          : "border-white/10 text-white/40 hover:text-white"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {advanceMode === "partial" && (
                  <div className="pt-1">
                    <input
                      type="number"
                      max={advanceOutstanding}
                      value={advanceAmount}
                      onChange={(e) => {
                        const rec = Math.min(advanceOutstanding, Math.max(0, Number(e.target.value) || 0));
                        setAdvanceAmount(rec);
                        const debt = customOverrides.penaltyDebt
                          ? penaltyDebt
                          : Math.round(((finalLateEntry * lateRate) + rec + otherDeductions) * 100) / 100;
                        setPenaltyDebt(debt);
                        if (!customOverrides.finalSalary) {
                          setFinalSalary(Math.max(0, Math.round((payoutWorkingDays + payoutExtraHours - debt + bonusCreditReward) * 100) / 100));
                        }
                      }}
                      placeholder="Partial recovery amount"
                      className="w-full px-3 py-1.5 text-xs text-cyan-300 bg-white/[0.04] border border-cyan-500/30 rounded-xl outline-none font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-white/40">Recovered: <strong className="text-red-400">−₹{advanceRecovery.toLocaleString("en-IN")}</strong></span>
                  <span className="text-white/40">Remaining: <strong className="text-cyan-300">₹{remainingAdvance.toLocaleString("en-IN")}</strong></span>
                </div>
              </div>
            </div>

            {/* Credit (C) Components: Incentive Bonus, Approved Reimbursements */}
            <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-green-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt size={14} className="text-green-400" />
                  Bonus & Reward Components (C)
                </h4>
                <span className="text-[10px] font-mono text-green-400">
                  Total C: ₹{bonusCreditReward.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Incentive Bonus */}
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Incentive / Bonus (+) (₹)</label>
                  <input
                    type="number"
                    value={bonus}
                    onChange={(e) => handleFieldChange("bonus", Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 text-xs text-green-400 bg-white/[0.04] border border-green-500/30 rounded-xl outline-none font-mono font-bold"
                  />
                  <span className="text-[10px] text-white/40 mt-0.5 block">Performance rewards or festive bonus</span>
                </div>

                {/* Approved Reimbursements */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60 text-[11px]">Approved Expense Reimbursements:</span>
                    <span className="font-mono font-bold text-green-400">+₹{approvedReimbursements.toLocaleString("en-IN")}</span>
                  </div>
                  <p className="text-white/40 text-[10px]">
                    Auto-fetched from verified employee claims. Excludes unapproved or pending claims.
                  </p>
                </div>

                {/* Audit Remarks */}
                <div>
                  <label className="text-white/50 text-[11px] font-medium mb-1 block">Calculation Remarks & Audit Note</label>
                  <input
                    type="text"
                    placeholder="e.g. Calculated with authoritative formula sheet and attendance logs"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-white bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>
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

          {/* Final Payable Highlight Card */}
          <div
            className="p-5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4"
            style={{
              background: "linear-gradient(135deg, rgba(0,245,255,0.08), rgba(124,58,237,0.08))",
              borderColor: "rgba(0,245,255,0.3)",
            }}
          >
            <div className="space-y-1 text-center md:text-left">
              <span className="text-white/50 text-xs font-semibold uppercase tracking-wider block">
                Authoritative Master Payout (Row 18)
              </span>
              <p className="text-white/70 text-xs font-mono">
                PWD (₹{payoutWorkingDays.toLocaleString("en-IN")}) + PEWH (₹{payoutExtraHours.toLocaleString("en-IN")}) − D (₹{penaltyDebt.toLocaleString("en-IN")}) + C (₹{bonusCreditReward.toLocaleString("en-IN")})
              </p>
              {Object.keys(customOverrides).length > 0 && (
                <p className="text-amber-400 text-[11px] font-semibold flex items-center gap-1 justify-center md:justify-start">
                  <AlertCircle size={12} /> {Object.keys(customOverrides).length} custom override(s) applied and will be preserved in snapshot
                </p>
              )}
            </div>

            <div className="text-center md:text-right shrink-0">
              <p className="text-white/50 text-xs mb-0.5">Final Net Payable Salary</p>
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
              <RefreshCw size={13} /> Reset to DB Values
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
