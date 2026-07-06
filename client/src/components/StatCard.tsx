"use client";

import { useCountUp } from "@/hooks/useCountUp";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  trend?: string;
  trendUp?: boolean;
  index: number;
}

export default function StatCard({
  title,
  value,
  prefix = "",
  suffix = "",
  icon,
  color,
  glowColor,
  trend,
  trendUp = true,
  index,
}: StatCardProps) {
  const count = useCountUp(value, 1800, index * 120);

  const formattedCount =
    prefix === "₹"
      ? `${prefix}${count.toLocaleString("en-IN")}`
      : `${prefix}${count.toLocaleString()}${suffix}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.1,
        type: "spring",
        stiffness: 90,
        damping: 16,
      }}
      whileHover={{ scale: 1.03, y: -4 }}
      className="relative overflow-hidden rounded-2xl p-6 cursor-default"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        transition: "box-shadow 0.3s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 32px ${glowColor}25, 0 8px 32px rgba(0,0,0,0.3)`;
        (e.currentTarget as HTMLDivElement).style.borderColor = `${glowColor}40`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
      }}
    >
      {/* Corner glow */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${glowColor}20 0%, transparent 70%)` }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        {/* Icon box */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `${color}15`,
            border: `1px solid ${color}30`,
            boxShadow: `0 0 16px ${color}20`,
          }}
        >
          <span style={{ color }}>{icon}</span>
        </div>

        {/* Trend badge */}
        {trend && (
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{
              background: trendUp ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: trendUp ? "#22c55e" : "#ef4444",
              border: `1px solid ${trendUp ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}
          >
            {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trend}
          </div>
        )}
      </div>

      {/* Value */}
      <p
        className="text-3xl font-black mb-1 tabular-nums"
        style={{ color }}
      >
        {formattedCount}
      </p>

      {/* Title */}
      <p className="text-white/50 text-sm font-medium">{title}</p>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 w-full"
        style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }}
      />
    </motion.div>
  );
}
