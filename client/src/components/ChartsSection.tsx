"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, BarChart, Bar, Cell,
} from "recharts";
import { attendanceApi } from "@/services/api";

// ─── Shared Custom Tooltip ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: "rgba(10,15,30,0.95)",
        border: "1px solid rgba(0,245,255,0.2)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {label && <p className="text-white/50 text-xs mb-2 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-bold" style={{ color: p.color || "#00f5ff" }}>
          {p.name ? `${p.name}: ` : ""}{p.value?.toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

// ─── 1. Weekly Attendance AreaChart ───────────────────────────────────────────
interface WeeklyItem {
  day: string;
  date: string;
  attendance: number;
  target: number;
}

function WeeklyAttendanceChart({ data }: { data: WeeklyItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-base">Weekly Attendance</p>
          <p className="text-white/40 text-xs">Real daily headcount — Last 7 Days</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Present
          </span>
          <span className="flex items-center gap-1.5 text-violet-400">
            <span className="w-2 h-2 rounded-full bg-violet-400" /> Target
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00f5ff" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="target"
            name="Target Workforce"
            stroke="rgba(124,58,237,0.4)"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="url(#violetGrad)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="attendance"
            name="Present Headcount"
            stroke="#00f5ff"
            strokeWidth={2.5}
            fill="url(#cyanGrad)"
            dot={{ fill: "#00f5ff", r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#00f5ff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── 2. Department-wise Radar Chart ──────────────────────────────────────────
interface DeptItem {
  dept: string;
  total: number;
  present: number; // percentage
}

function DepartmentRadarChart({ data }: { data: DeptItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-2">
        <p className="text-white font-bold text-base">Dept. Attendance</p>
        <p className="text-white/40 text-xs">Present % across active teams today</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <defs>
            <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00f5ff" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <PolarGrid stroke="rgba(255,255,255,0.07)" />
          <PolarAngleAxis
            dataKey="dept"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="Present %"
            dataKey="present"
            stroke="#00f5ff"
            strokeWidth={2}
            fill="url(#radarGrad)"
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── 3. Monthly Payroll Trend BarChart ────────────────────────────────────────
interface PayrollTrendItem {
  month: string;
  year: number;
  payroll: number;
}

const BAR_COLORS = ["#5b21b6", "#6d28d9", "#7c3aed", "#8b5cf6", "#a78bfa", "#00f5ff"];

function MonthlyPayrollChart({ data }: { data: PayrollTrendItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-base">Monthly Payroll Trend</p>
          <p className="text-white/40 text-xs">Last 6 months company disbursements (₹)</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }} barCategoryGap="30%">
          <defs>
            {BAR_COLORS.map((color, i) => (
              <linearGradient key={i} id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.4} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v}`)}
          />
          <Tooltip
            content={({ active, payload, label }) => (
              <CustomTooltip
                active={active}
                label={label}
                payload={payload?.map((p) => ({
                  ...p,
                  value: Number(p.value),
                  name: "Payroll",
                  color: "#a78bfa",
                }))}
              />
            )}
          />
          <Bar dataKey="payroll" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800}>
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#bar-${i % BAR_COLORS.length})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── Exported Section ─────────────────────────────────────────────────────────
export default function ChartsSection() {
  const [weekly, setWeekly] = useState<WeeklyItem[]>([]);
  const [departments, setDepartments] = useState<DeptItem[]>([]);
  const [payrollTrend, setPayrollTrend] = useState<PayrollTrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await attendanceApi.analytics();
        if (res.data) {
          if (res.data.weekly) setWeekly(res.data.weekly);
          if (res.data.departments) setDepartments(res.data.departments);
          if (res.data.payroll_trend) setPayrollTrend(res.data.payroll_trend);
        }
      } catch (err) {
        console.error("Failed to fetch live analytics data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <WeeklyAttendanceChart data={weekly} />
      </div>
      <DepartmentRadarChart data={departments} />
      <div className="lg:col-span-3">
        <MonthlyPayrollChart data={payrollTrend} />
      </div>
    </div>
  );
}
