"use client";

import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, BarChart, Bar, Cell, Legend,
} from "recharts";

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
const weeklyData = [
  { day: "Mon", attendance: 218, target: 248 },
  { day: "Tue", attendance: 232, target: 248 },
  { day: "Wed", attendance: 225, target: 248 },
  { day: "Thu", attendance: 241, target: 248 },
  { day: "Fri", attendance: 213, target: 248 },
  { day: "Sat", attendance: 145, target: 248 },
  { day: "Sun", attendance: 52,  target: 248 },
];

function WeeklyAttendanceChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-5">
        <p className="text-white font-bold text-base">Weekly Attendance</p>
        <p className="text-white/40 text-xs">Daily headcount — Mon to Sun</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={weeklyData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#00f5ff" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Target area */}
          <Area
            type="monotone"
            dataKey="target"
            name="Target"
            stroke="rgba(124,58,237,0.4)"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="url(#violetGrad)"
            dot={false}
          />
          {/* Actual area */}
          <Area
            type="monotone"
            dataKey="attendance"
            name="Present"
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
const radarData = [
  { dept: "Eng",     present: 88 },
  { dept: "HR",      present: 95 },
  { dept: "Finance", present: 91 },
  { dept: "Ops",     present: 78 },
  { dept: "Design",  present: 84 },
  { dept: "Mktg",    present: 72 },
];

function DepartmentRadarChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-2">
        <p className="text-white font-bold text-base">Dept. Attendance</p>
        <p className="text-white/40 text-xs">Present % per department</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <defs>
            <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="#00f5ff" stopOpacity={0.4} />
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
const payrollData = [
  { month: "Jan", payroll: 1620000 },
  { month: "Feb", payroll: 1710000 },
  { month: "Mar", payroll: 1680000 },
  { month: "Apr", payroll: 1750000 },
  { month: "May", payroll: 1800000 },
  { month: "Jun", payroll: 1842500 },
];

const BAR_COLORS = ["#5b21b6", "#6d28d9", "#7c3aed", "#8b5cf6", "#a78bfa", "#00f5ff"];

function MonthlyPayrollChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, type: "spring", stiffness: 90 }}
      className="neo-card p-6"
    >
      <div className="mb-5">
        <p className="text-white font-bold text-base">Monthly Payroll Trend</p>
        <p className="text-white/40 text-xs">Last 6 months (₹)</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={payrollData} margin={{ top: 5, right: 8, left: -10, bottom: 0 }} barCategoryGap="30%">
          <defs>
            {BAR_COLORS.map((color, i) => (
              <linearGradient key={i} id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={1} />
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
            tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
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
            {payrollData.map((_, i) => (
              <Cell key={i} fill={`url(#bar-${i})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── Exported Section ─────────────────────────────────────────────────────────
export default function ChartsSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <WeeklyAttendanceChart />
      </div>
      <DepartmentRadarChart />
      <div className="lg:col-span-3">
        <MonthlyPayrollChart />
      </div>
    </div>
  );
}
