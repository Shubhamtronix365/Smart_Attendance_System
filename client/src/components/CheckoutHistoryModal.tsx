"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Clock,
  LogIn,
  LogOut,
  Calendar,
  CheckCircle2,
  AlertCircle,
  SunMedium,
  Pencil,
  Trash2,
  Plus,
  Save,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { attendanceApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

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
  avatar?: string;
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
  isAdmin?: boolean;
  onUpdate?: (updatedRecord: CheckoutModalRecord) => void;
}

function parseDateTimeParts(rawStr?: string | null, fallbackDate: string = ""): { date: string; time: string } {
  if (!rawStr) return { date: fallbackDate || "", time: "09:00" };
  try {
    let d: Date;
    if (rawStr.includes("T")) {
      d = new Date(rawStr);
    } else if (rawStr.includes(" ")) {
      const [dPart, tPart] = rawStr.split(" ");
      d = new Date(`${dPart}T${tPart}`);
    } else {
      d = new Date(`${fallbackDate}T${rawStr}`);
    }
    if (isNaN(d.getTime())) {
      const parts = rawStr.split(" ");
      return { date: parts[0] || fallbackDate, time: parts[1]?.slice(0, 5) || "09:00" };
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
  } catch {
    return { date: fallbackDate, time: "09:00" };
  }
}

function formatFullDateTime(rawStr?: string | null): { dateStr: string; timeStr: string } {
  if (!rawStr) return { dateStr: "—", timeStr: "—" };

  try {
    let d: Date;
    if (rawStr.includes("T")) {
      d = new Date(rawStr);
    } else {
      const [datePart, timePart] = rawStr.split(" ");
      d = new Date(`${datePart}T${timePart}`);
    }

    if (isNaN(d.getTime())) {
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

export default function CheckoutHistoryModal({
  isOpen,
  onClose,
  record,
  isAdmin = true,
  onUpdate,
}: CheckoutHistoryModalProps) {
  const { success, error } = useToast();
  const [currentRecord, setCurrentRecord] = useState<CheckoutModalRecord | null>(record);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit session state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editInDate, setEditInDate] = useState("");
  const [editInTime, setEditInTime] = useState("");
  const [editOutDate, setEditOutDate] = useState("");
  const [editOutTime, setEditOutTime] = useState("");
  const [editIsActive, setEditIsActive] = useState(false);

  // Delete session confirmation state
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  // Add session state
  const [isAdding, setIsAdding] = useState(false);
  const [newInDate, setNewInDate] = useState("");
  const [newInTime, setNewInTime] = useState("");
  const [newOutDate, setNewOutDate] = useState("");
  const [newOutTime, setNewOutTime] = useState("");
  const [newIsActive, setNewIsActive] = useState(false);

  useEffect(() => {
    setCurrentRecord(record);
    setEditingIndex(null);
    setDeletingIndex(null);
    setIsAdding(false);
  }, [record]);

  if (!isOpen || !currentRecord) return null;

  // Normalize sessions array
  let sessions: PunchSession[] = [];
  if (currentRecord.punches && Array.isArray(currentRecord.punches) && currentRecord.punches.length > 0) {
    sessions = currentRecord.punches;
  } else if (currentRecord.checkIn && currentRecord.checkIn !== "—" && currentRecord.checkIn !== "-") {
    sessions = [
      {
        session: 1,
        in: currentRecord.checkIn.includes(" ") ? currentRecord.checkIn : `${currentRecord.date} ${currentRecord.checkIn}`,
        out:
          currentRecord.checkOut && currentRecord.checkOut !== "—" && currentRecord.checkOut !== "-"
            ? currentRecord.checkOut.includes(" ")
              ? currentRecord.checkOut
              : `${currentRecord.date} ${currentRecord.checkOut}`
            : null,
        hours: parseFloat(currentRecord.workingHours) || 0,
      },
    ];
  }

  const completedCheckouts = sessions.filter((s) => s.out).length;
  const isSunday = (() => {
    try {
      const d = new Date(currentRecord.date + "T00:00:00");
      return d.getDay() === 0;
    } catch {
      return false;
    }
  })();

  const shiftDateFormatted = (() => {
    try {
      const d = new Date(currentRecord.date + "T00:00:00");
      return d.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return currentRecord.date;
    }
  })();

  const startEditSession = (session: PunchSession, index: number) => {
    setDeletingIndex(null);
    setIsAdding(false);
    const inParts = parseDateTimeParts(session.in, currentRecord.date);
    const outParts = parseDateTimeParts(session.out, inParts.date);

    setEditInDate(inParts.date);
    setEditInTime(inParts.time);
    setEditOutDate(outParts.date);
    setEditOutTime(outParts.time);
    setEditIsActive(!session.out);
    setEditingIndex(index);
  };

  const handleSaveEditSession = async (index: number) => {
    if (!editInDate || !editInTime) {
      error("Please enter a valid Check-In Date and Time.");
      return;
    }

    const inStr = `${editInDate} ${editInTime}:00`;
    const outStr = editIsActive ? null : `${editOutDate} ${editOutTime}:00`;

    // Construct updated sessions list
    const updatedSessions = sessions.map((s, i) => {
      if (i === index) {
        return {
          session: i + 1,
          in: inStr,
          out: outStr,
        };
      }
      return {
        session: i + 1,
        in: s.in,
        out: s.out,
      };
    });

    await persistSessions(updatedSessions, "Session updated successfully.");
    setEditingIndex(null);
  };

  const handleDeleteSession = async (index: number) => {
    const updatedSessions = sessions
      .filter((_, i) => i !== index)
      .map((s, i) => ({
        session: i + 1,
        in: s.in,
        out: s.out,
      }));

    await persistSessions(updatedSessions, `Session #${index + 1} deleted successfully.`);
    setDeletingIndex(null);
  };

  const startAddSession = () => {
    setEditingIndex(null);
    setDeletingIndex(null);
    setNewInDate(currentRecord.date);
    setNewInTime("09:00");
    setNewOutDate(currentRecord.date);
    setNewOutTime("18:00");
    setNewIsActive(false);
    setIsAdding(true);
  };

  const handleSaveNewSession = async () => {
    if (!newInDate || !newInTime) {
      error("Please enter Check-In Date and Time.");
      return;
    }

    const inStr = `${newInDate} ${newInTime}:00`;
    const outStr = newIsActive ? null : `${newOutDate} ${newOutTime}:00`;

    const updatedSessions = [
      ...sessions.map((s, i) => ({
        session: i + 1,
        in: s.in,
        out: s.out,
      })),
      {
        session: sessions.length + 1,
        in: inStr,
        out: outStr,
      },
    ];

    await persistSessions(updatedSessions, "New session added successfully.");
    setIsAdding(false);
  };

  const persistSessions = async (newSessions: any[], successMsg: string) => {
    setIsSubmitting(true);
    try {
      const res = await attendanceApi.updateSessions(currentRecord.id, newSessions);
      const data = res.data;

      let parsedPunches: PunchSession[] = [];
      if (data.punches) {
        try {
          parsedPunches = typeof data.punches === "string" ? JSON.parse(data.punches) : data.punches;
        } catch {
          parsedPunches = [];
        }
      }

      const updatedRec: CheckoutModalRecord = {
        ...currentRecord,
        checkIn: data.check_in
          ? new Date(data.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
          : "—",
        checkOut: data.check_out
          ? new Date(data.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
          : "—",
        workingHours: data.working_hours != null ? `${Number(data.working_hours).toFixed(2)}h` : "0.00h",
        otHours: data.overtime_hours && Number(data.overtime_hours) > 0 ? `${Number(data.overtime_hours).toFixed(2)}h` : "—",
        status: data.status,
        checkoutCount: data.checkout_count || 0,
        punches: parsedPunches,
      };

      setCurrentRecord(updatedRec);
      if (onUpdate) {
        onUpdate(updatedRec);
      }
      success(successMsg);
    } catch (err: any) {
      console.error("Failed to update sessions:", err);
      error(err.response?.data?.detail || "Failed to update session.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        className="w-full max-w-2xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[92vh]"
        style={{ background: "rgba(10, 15, 30, 0.98)" }}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10 flex items-start justify-between bg-white/[0.02]">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
              <Clock size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-bold text-base sm:text-lg">Checkout & Session Breakdown</h3>
                {isSunday && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <SunMedium size={12} />
                    Sunday Shift · 100% Overtime
                  </span>
                )}
              </div>
              <p className="text-white/60 text-xs mt-1">
                <span className="font-semibold text-white/90">{currentRecord.name}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-mono text-cyan-400">{currentRecord.empId}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="text-white/60">{currentRecord.department}</span>
              </p>
              <p className="text-white/40 text-[11px] mt-0.5 flex items-center gap-1.5">
                <Calendar size={12} className="text-cyan-400/80" />
                <span>
                  Shift Date: <span className="text-white/80 font-medium">{shiftDateFormatted}</span>
                </span>
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
        <div className="px-4 sm:px-6 py-3.5 bg-white/[0.03] border-b border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Checkouts</span>
            <span className="text-cyan-400 font-mono font-black text-xl mt-0.5 block">
              {completedCheckouts} <span className="text-xs font-sans font-normal text-white/50">completed</span>
            </span>
          </div>
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Working Hours</span>
            <span className="text-white font-mono font-black text-xl mt-0.5 block">
              {currentRecord.workingHours}
            </span>
          </div>
          <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider block">Total Overtime</span>
            <span className="text-purple-400 font-mono font-black text-xl mt-0.5 block">
              {currentRecord.otHours}
            </span>
          </div>
        </div>

        {/* Session Details List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
              Recorded Punch Sessions ({sessions.length})
            </h4>
            {isAdmin && !isAdding && (
              <button
                type="button"
                onClick={startAddSession}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all cursor-pointer"
              >
                <Plus size={13} />
                Add Session
              </button>
            )}
          </div>

          {sessions.length === 0 && !isAdding ? (
            <div className="text-center py-10 bg-white/[0.02] rounded-2xl border border-white/5">
              <AlertCircle size={32} className="mx-auto text-white/20 mb-2" />
              <p className="text-white/50 text-sm">No punch sessions recorded for this day.</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={startAddSession}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 transition-all cursor-pointer"
                >
                  + Add First Session
                </button>
              )}
            </div>
          ) : (
            sessions.map((session, index) => {
              const inParsed = formatFullDateTime(session.in);
              const outParsed = formatFullDateTime(session.out);
              const isClosed = !!session.out;
              const sessionHours = session.hours != null ? Number(session.hours).toFixed(2) : "—";
              const isEditing = editingIndex === index;
              const isDeleting = deletingIndex === index;

              return (
                <div
                  key={session.session || index + 1}
                  className={`rounded-2xl border transition-all shadow-sm overflow-hidden ${
                    isEditing
                      ? "border-cyan-500/50 bg-cyan-950/15"
                      : isDeleting
                      ? "border-red-500/50 bg-red-950/15"
                      : "border-white/10 bg-white/[0.02] hover:border-cyan-500/30"
                  }`}
                >
                  {/* Session Header */}
                  <div className="flex items-center justify-between p-4 pb-3 border-b border-white/5 flex-wrap gap-2">
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

                      {/* Admin Actions */}
                      {isAdmin && !isEditing && !isDeleting && (
                        <div className="flex items-center gap-1 ml-1 border-l border-white/10 pl-2">
                          <button
                            type="button"
                            onClick={() => startEditSession(session, index)}
                            className="p-1.5 rounded-lg text-white/50 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer"
                            title="Edit this checkpoint / session"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingIndex(index)}
                            className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/15 transition-all cursor-pointer"
                            title="Delete this checkpoint / session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline Delete Confirmation */}
                  {isDeleting && (
                    <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-red-300 text-xs font-semibold">
                        <AlertTriangle size={16} className="shrink-0 text-red-400" />
                        <span>Delete Session #{index + 1}? Total working hours and checkout count will recalculate.</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDeletingIndex(null)}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/15 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleDeleteSession(index)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/30"
                        >
                          {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Edit Form */}
                  {isEditing ? (
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Check-In Inputs */}
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                            Check-In
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-white/40 block mb-1">Date</label>
                              <input
                                type="date"
                                value={editInDate}
                                onChange={(e) => setEditInDate(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-white/40 block mb-1">Time</label>
                              <input
                                type="time"
                                value={editInTime}
                                onChange={(e) => setEditInTime(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono outline-none focus:border-cyan-400"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Check-Out Inputs */}
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                              Check-Out
                            </span>
                            <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsActive}
                                onChange={(e) => setEditIsActive(e.target.checked)}
                                className="rounded border-white/20 text-cyan-400 focus:ring-0 cursor-pointer"
                              />
                              <span>Active (No checkout)</span>
                            </label>
                          </div>
                          {!editIsActive ? (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-white/40 block mb-1">Date</label>
                                <input
                                  type="date"
                                  value={editOutDate}
                                  onChange={(e) => setEditOutDate(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-white/40 block mb-1">Time</label>
                                <input
                                  type="time"
                                  value={editOutTime}
                                  onChange={(e) => setEditOutTime(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono outline-none focus:border-cyan-400"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-amber-300/80 text-xs italic py-2">
                              Session marked as in-progress. No check-out timestamp recorded.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingIndex(null)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/15 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleSaveEditSession(index)}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-400/20"
                        >
                          {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Check-In */}
                      <div className="bg-emerald-500/[0.04] rounded-xl p-3 border border-emerald-500/15">
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
                          <LogIn size={14} />
                          <span>Check-In Time</span>
                        </div>
                        <div className="font-mono text-white text-base font-bold">{inParsed.timeStr}</div>
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
                        </div>
                        {isClosed ? (
                          <>
                            <div className="font-mono text-cyan-300 text-base font-bold">{outParsed.timeStr}</div>
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
                  )}
                </div>
              );
            })
          )}

          {/* Add Session Card Form */}
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <Plus size={14} />
                  Add New Punch Session #{sessions.length + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-white/40 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* In */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Check-In
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/40 block mb-1">Date</label>
                      <input
                        type="date"
                        value={newInDate}
                        onChange={(e) => setNewInDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 block mb-1">Time</label>
                      <input
                        type="time"
                        value={newInTime}
                        onChange={(e) => setNewInTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Out */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                      Check-Out
                    </span>
                    <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIsActive}
                        onChange={(e) => setNewIsActive(e.target.checked)}
                        className="rounded border-white/20 text-cyan-400 focus:ring-0 cursor-pointer"
                      />
                      <span>Active (No checkout)</span>
                    </label>
                  </div>
                  {!newIsActive ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-white/40 block mb-1">Date</label>
                        <input
                          type="date"
                          value={newOutDate}
                          onChange={(e) => setNewOutDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/40 block mb-1">Time</label>
                        <input
                          type="time"
                          value={newOutTime}
                          onChange={(e) => setNewOutTime(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-amber-300/80 text-xs italic py-2">
                      Session will be marked as in-progress without check-out.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/15 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveNewSession}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-400/20"
                >
                  {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Session
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-white/40 font-sans">
            Timestamps synced via Biometric R307 / RFID Hardware RTC in Indian Standard Time (IST).
          </p>
          <button
            type="button"
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
