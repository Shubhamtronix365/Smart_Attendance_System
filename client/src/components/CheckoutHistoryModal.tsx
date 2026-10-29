"use client";

import { motion } from "framer-motion";
import { X, Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle, SunMedium } from "lucide-react";

export interface PunchSession {
  session: number;
  in: string;
  out?: string | null;
  hours?: number;
}

export interface CheckoutModalRecord {
  id: string;
  date: string;
  empId: string;
  name: string;
  department: string;
  avatar: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: string;
  otHours: string;
  checkoutCount?: number;
  punches?: PunchSession[];
}

interface CheckoutHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CheckoutModalRecord | null;
}

function formatFullDateTime(rawStr?: string | null): { dateStr: string; timeStr: string; isNextDay?: boolean } {
  if (!rawStr) return { dateStr: "—", timeStr: "—" };

  try {
    let d: Date;
    if (rawStr.includes("T")) {
      d = new Date(rawStr);
    } else {
      // "YYYY-MM-DD HH:MM:SS"
      const [datePart, timePart] = rawStr.split(" ");
      d = new Date(`${datePart}T${timePart}`);
    }

    if (isNaN(d.getTime())) {
      // Fallback
      return { dateStr: rawStr.split(" ")[0] || rawStr, timeStr: rawStr.split(" ")[1] || rawStr };
    }

    const dateStr = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      weekday: "short",
    });

    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    return { dateStr, timeStr };
  } catch {
    return { dateStr: "—", timeStr: rawStr };
  }
}

export default function CheckoutHistoryModal({ isOpen, onClose, record }: CheckoutHistoryModalProps) {
  if (!isOpen || !record) return null;

  // Normalize sessions array
  let sessions: PunchSession[] = [];
  if (record.punches && Array.isArray(record.punches) && record.punches.length > 0) {
    sessions = record.punches;
  } else if (record.checkIn && record.checkIn !== "—" && record.checkIn !== "-") {
    // Single fallback session
    sessions = [
      {
        session: 1,
        in: record.checkIn,
        out: record.checkOut !== "—" && record.checkOut !== "-" ? record.checkOut : null,
        hours: parseFloat(record.workingHours) || 0,
      },
    ];
  }

  const completedCheckouts = sessions.filter((s) => s.out).length;
  const isSunday = (() => {
    try {
      const d = new Date(record.date + "T00:00:00");
      return d.getDay() === 0;
    } catch {
      return false;
    }
  })();

  const shiftDateFormatted = (() => {
    try {
      const d = new Date(record.date + "T00:00:00");
      return d.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return record.date;
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="w-full max-w-2xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: "rgba(10, 15, 30, 0.98)" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between bg-white/[0.02]">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
              <Clock size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-bold text-lg">Checkout & Session Breakdown</h3>
                {isSunday && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <SunMedium size={12} />
                    Sunday Shift · 100% Overtime
                  </span>
                )}
              </div>
              <p className="text-white/60 text-xs mt-1">
                <span className="font-semibold text-white/90">{record.name}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-mono text-cyan-400">{record.empId}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="text-white/60">{record.department}</span>
              </p>
              <p className="text-white/40 text-[11px] mt-0.5 flex items-center gap-1.5">
                <Calendar size={12} className="text-cyan-400/80" />
                <span>Shift Date: <span className="text-white/80 font-medium">{shiftDateFormatted}</span></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Overview Stats Bar */}
        <div className="px-6 py-3.5 bg-white/[0.03] border-b border-white/5 grid grid-cols-3 gap-3">
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Checkouts</span>
            <span className="text-cyan-400 font-mono font-black text-xl mt-0.5 block">
              {completedCheckouts} <span className="text-xs font-sans font-normal text-white/50">completed</span>
            </span>
          </div>
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Working Hours</span>
            <span className="text-white font-mono font-black text-xl mt-0.5 block">
              {record.workingHours}
            </span>
          </div>
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Overtime</span>
            <span className="text-purple-400 font-mono font-black text-xl mt-0.5 block">
              {record.otHours}
            </span>
          </div>
        </div>

        {/* Session Details List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
              Recorded Punch Sessions ({sessions.length})
            </h4>
            <span className="text-[11px] text-white/40">
              Chronological check-in & check-out logs
            </span>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-10 bg-white/[0.02] rounded-2xl border border-white/5">
              <AlertCircle size={32} className="mx-auto text-white/20 mb-2" />
              <p className="text-white/50 text-sm">No punch session history available for this day.</p>
            </div>
          ) : (
            sessions.map((session, index) => {
              const inParsed = formatFullDateTime(session.in);
              const outParsed = formatFullDateTime(session.out);
              const isClosed = !!session.out;
              const sessionHours = session.hours != null ? Number(session.hours).toFixed(2) : "—";

              // Check if cross-midnight
              const isDifferentDate = isClosed && inParsed.dateStr !== outParsed.dateStr && inParsed.dateStr !== "—" && outParsed.dateStr !== "—";

              return (
                <div
                  key={session.session || index + 1}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:border-cyan-500/30 transition-all shadow-sm"
                >
                  {/* Session Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-cyan-500/15 text-cyan-400 font-mono text-xs font-bold flex items-center justify-center">
                        #{session.session || index + 1}
                      </span>
                      <span className="text-white font-bold text-sm">
                        Session {session.session || index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isClosed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 size={11} />
                          Checkout #{index + 1} Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                          <Clock size={11} />
                          Active / Currently Working
                        </span>
                      )}

                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white/90">
                        Duration: {sessionHours}h
                      </span>
                    </div>
                  </div>

                  {/* Punch Timestamps Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Check-In */}
                    <div className="bg-emerald-500/[0.04] rounded-xl p-3 border border-emerald-500/15">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
                        <LogIn size={14} />
                        <span>Check-In Time</span>
                      </div>
                      <div className="font-mono text-white text-base font-bold">
                        {inParsed.timeStr}
                      </div>
                      <div className="text-white/40 text-[11px] font-sans mt-0.5 flex items-center gap-1">
                        <Calendar size={11} />
                        <span>{inParsed.dateStr}</span>
                      </div>
                    </div>

                    {/* Check-Out */}
                    <div className="bg-cyan-500/[0.04] rounded-xl p-3 border border-cyan-500/15">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
                          <LogOut size={14} />
                          <span>Check-Out Time (Checkout #{index + 1})</span>
                        </div>
                        {isDifferentDate && (
                          <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold mb-1">
                            Next Day
                          </span>
                        )}
                      </div>
                      {isClosed ? (
                        <>
                          <div className="font-mono text-cyan-300 text-base font-bold">
                            {outParsed.timeStr}
                          </div>
                          <div className="text-cyan-400/60 text-[11px] font-sans mt-0.5 flex items-center gap-1">
                            <Calendar size={11} />
                            <span>{outParsed.dateStr}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-amber-400/80 text-xs italic font-medium py-1">
                          In progress — check out when leaving
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-white/40 font-sans">
            Timestamps synced via Biometric R307 / RFID Hardware RTC in Indian Standard Time (IST).
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-all cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
