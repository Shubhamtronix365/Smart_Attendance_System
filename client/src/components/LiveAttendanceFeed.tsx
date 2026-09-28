"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { attendanceApi } from "@/services/api";
import { formatTime } from "@/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttendanceEntry {
  id: string;
  name: string;
  department: string;
  time: string;
  status: "present" | "late" | "absent" | "checkout";
  avatar: string;
  timestamp: number;
}

// ─── Status Config ─────────────────────────────────────────────────────────────
const STATUS = {
  present:  { label: "Present",  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   dot: "bg-green-400"  },
  late:     { label: "Late",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  dot: "bg-amber-400"  },
  absent:   { label: "Absent",   color: "#ef4444", bg: "rgba(239,68,68,0.12)",   dot: "bg-red-400"    },
  checkout: { label: "Checkout", color: "#a78bfa", bg: "rgba(167,139,250,0.12)", dot: "bg-violet-400" },
};

// ─── Avatar Component ─────────────────────────────────────────────────────────
function Avatar({ initials, status }: { initials: string; status: AttendanceEntry["status"] }) {
  const s = STATUS[status];
  return (
    <div className="relative shrink-0">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-black"
        style={{ background: `linear-gradient(135deg, ${s.color}cc, ${s.color}66)` }}
      >
        {initials}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${s.dot}`}
        style={{ borderColor: "#0a0f1e" }}
      />
    </div>
  );
}

// ─── Entry Row ────────────────────────────────────────────────────────────────
function FeedEntry({ entry, isNew }: { entry: AttendanceEntry; isNew: boolean }) {
  const s = STATUS[entry.status];
  return (
    <motion.div
      layout
      key={entry.id}
      initial={isNew ? { y: -20, opacity: 0, scale: 0.97 } : false}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.03]"
      style={{ border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <Avatar initials={entry.avatar} status={entry.status} />

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{entry.name}</p>
        <p className="text-white/40 text-xs">{entry.department}</p>
      </div>

      <span className="text-white/30 text-xs shrink-0 tabular-nums">{entry.time}</span>

      <span
        className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
        style={{ background: s.bg, color: s.color }}
      >
        {s.label}
      </span>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveAttendanceFeed() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async (isInitial = false) => {
    try {
      const res = await attendanceApi.live();
      const dbEntries = res.data;
      const mapped = dbEntries.map((r: any) => {
        const hasCheckOut = !!r.check_out;
        const timeStr = hasCheckOut ? r.check_out : r.check_in;
        const mappedStatus: any = hasCheckOut ? "checkout" : (r.status === "late" ? "late" : (r.status === "absent" ? "absent" : "present"));
        const rawTime = timeStr || r.created_at;
        const t = new Date(rawTime);

        return {
          id: String(r.attendance_id),
          name: r.employee_name || "Unknown",
          department: r.employee_dept || "N/A",
          avatar: (r.employee_name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          status: mappedStatus,
          time: formatTime(rawTime, true),
          timestamp: isNaN(t.getTime()) ? Date.now() : t.getTime(),
        };
      });

      if (!isInitial) {
        setEntries((prev) => {
          const currentIds = new Set(prev.map((e) => e.id));
          const newEntryIds: string[] = [];
          mapped.forEach((m: any) => {
            if (!currentIds.has(m.id)) {
              newEntryIds.push(m.id);
            }
          });
          if (newEntryIds.length > 0) {
            setNewIds((p) => new Set([...p, ...newEntryIds]));
            setTimeout(() => {
              setNewIds((p) => {
                const next = new Set(p);
                newEntryIds.forEach((id) => next.delete(id));
                return next;
              });
            }, 2000);
          }
          return mapped;
        });
      } else {
        setEntries(mapped);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Error fetching live feed", err);
    }
  }, []);

  // Init
  useEffect(() => {
    fetchFeed(true);
  }, [fetchFeed]);

  // 10-second polling fallback
  useEffect(() => {
    if (!isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchFeed(false), 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLive, fetchFeed]);

  // WebSocket for instant real-time updates
  useEffect(() => {
    if (!isLive) return;
    let ws: WebSocket | null = null;
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (["attendance_updated", "live_attendance"].includes(data.event)) {
            fetchFeed(false);
          }
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}
    return () => {
      if (ws) ws.close();
    };
  }, [isLive, fetchFeed]);

  const manualRefresh = () => {
    fetchFeed(false);
  };

  const timeSince = () => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, type: "spring", stiffness: 90 }}
      className="neo-card p-6 flex flex-col"
      style={{ height: "520px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <p className="text-white font-bold text-base">Live Attendance Feed</p>
          <p className="text-white/30 text-xs">Updated {timeSince()}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live toggle */}
          <button
            onClick={() => setIsLive((l) => !l)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: isLive ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isLive ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`,
              color: isLive ? "#22c55e" : "rgba(255,255,255,0.4)",
            }}
          >
            {isLive ? <Wifi size={11} /> : <WifiOff size={11} />}
            {isLive ? "Live" : "Paused"}
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          </button>

          {/* Manual refresh */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ rotate: 180, scale: 0.9 }}
            onClick={manualRefresh}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <RefreshCw size={13} />
          </motion.button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex gap-4 mb-3 shrink-0">
        {Object.entries(STATUS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${val.dot}`} />
            <span className="text-white/30 text-xs">{val.label}</span>
          </div>
        ))}
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scroll">
        {entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-white/30 text-xs">
            No live punches recorded yet. Waiting for hardware scans...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <FeedEntry key={entry.id} entry={entry} isNew={newIds.has(entry.id)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
