"use client";

import { motion } from "framer-motion";

// ─── Status Config ─────────────────────────────────────────────────────────────
type Status = "present" | "absent" | "late" | "halfday" | "leave" | "wfh" | "active" | "inactive" | "pending" | "approved" | "rejected" | "paid" | "unpaid";

const STATUS_MAP: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  present:  { label: "Present",   color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)"  },
  absent:   { label: "Absent",    color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"  },
  late:     { label: "Late",      color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" },
  halfday:  { label: "Half Day",  color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)" },
  leave:    { label: "On Leave",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)"},
  wfh:      { label: "WFH",       color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)" },
  active:   { label: "Active",    color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)"  },
  inactive: { label: "Inactive",  color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"  },
  pending:  { label: "Pending",   color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" },
  approved: { label: "Approved",  color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)"  },
  rejected: { label: "Rejected",  color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"  },
  paid:     { label: "Paid",      color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)"  },
  unpaid:   { label: "Unpaid",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" },
};

interface StatusBadgeProps {
  status: Status | string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export default function StatusBadge({ status, size = "md", pulse = false }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status as Status] ?? {
    label: status,
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.1)",
    border: "rgba(148,163,184,0.2)",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {pulse && (
        <motion.span
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
}
