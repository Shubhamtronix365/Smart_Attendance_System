"use client";

import { motion } from "framer-motion";

// ─── Shimmer animation keyframes (injected inline) ───────────────────────────
const shimmerStyle = {
  background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.8s infinite",
};

// ─── Base Block ───────────────────────────────────────────────────────────────
function Block({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{ ...shimmerStyle, ...style }}
    />
  );
}

// ─── Table Row Skeleton ───────────────────────────────────────────────────────
export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          {i === 0 ? (
            <div className="flex items-center gap-3">
              <Block className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex flex-col gap-1.5">
                <Block className="h-3 w-28" />
                <Block className="h-2.5 w-16" />
              </div>
            </div>
          ) : (
            <Block className="h-3" style={{ width: `${60 + Math.random() * 40}%` }} />
          )}
        </td>
      ))}
    </tr>
  );
}

// ─── Card Skeleton ─────────────────────────────────────────────────────────────
export function CardSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <div
      className={`rounded-2xl ${height} overflow-hidden`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Block className="w-full h-full" />
    </div>
  );
}

// ─── Stat Card Skeleton ───────────────────────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <Block className="w-11 h-11 rounded-xl" />
        <Block className="w-20 h-5 rounded-full" />
      </div>
      <Block className="h-8 w-24 mb-2" />
      <Block className="h-3 w-32" />
    </div>
  );
}

// ─── Default export (generic loading rows) ────────────────────────────────────
export default function LoadingSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </>
  );
}
