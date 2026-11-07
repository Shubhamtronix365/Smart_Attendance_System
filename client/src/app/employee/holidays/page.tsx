"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Info, Clock, Sparkles, CheckCircle2
} from "lucide-react";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { holidayApi } from "@/services/api";

interface Holiday {
  holiday_id: number;
  name: string;
  date: string;
  description?: string;
  holiday_type: string;
  company_name: string;
  is_recurring?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeeHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [includeSundaysInList, setIncludeSundaysInList] = useState(true);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1);

  const fetchHolidays = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await holidayApi.list({ year: currentYear });
      setHolidays(res.data || []);
    } catch (err) {
      console.error("Error loading holidays", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Calendar Grid Computations
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [currentYear, currentMonth]);

  const sundaysInMonth = useMemo(() => {
    let count = 0;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(currentYear, currentMonth - 1, d).getDay() === 0) {
        count++;
      }
    }
    return count;
  }, [currentYear, currentMonth]);

  const monthHolidays = useMemo(() => {
    return holidays.filter((h) => {
      const parts = h.date.split("-");
      return Number(parts[0]) === currentYear && Number(parts[1]) === currentMonth;
    });
  }, [holidays, currentYear, currentMonth]);

  const holidaysByDay = useMemo(() => {
    const map = new Map<number, Holiday[]>();
    monthHolidays.forEach((h) => {
      const day = Number(h.date.split("-")[2]);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(h);
    });
    return map;
  }, [monthHolidays]);

  const displayHolidays = useMemo(() => {
    if (!includeSundaysInList) return holidays;

    const existingDateMap = new Set(holidays.map((h) => h.date));
    const sundayHolidays: Holiday[] = [];

    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(currentYear, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(currentYear, m - 1, d);
        if (dt.getDay() === 0) {
          const dateStr = `${currentYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (!existingDateMap.has(dateStr)) {
            sundayHolidays.push({
              holiday_id: -dt.getTime(),
              name: "Sunday (Weekly Off)",
              date: dateStr,
              holiday_type: "Fixed Holiday",
              company_name: "All",
              description: "Standard weekly company holiday (Non-working day / Record only attendance)",
              is_recurring: true,
            });
          }
        }
      }
    }

    return [...holidays, ...sundayHolidays].sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, includeSundaysInList, currentYear]);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <EmployeeSidebar />
      <EmployeeTopBar title="Holidays" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <CalendarIcon className="text-cyan-400" /> Company Holiday Calendar
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Official organization holidays and public observances for {currentYear}
              </p>
            </div>

            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl self-start sm:self-auto">
              <button
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "calendar" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-white/50 hover:text-white"
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "list" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-white/50 hover:text-white"
                }`}
              >
                List
              </button>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (currentMonth === 1) {
                    setCurrentMonth(12);
                    setCurrentYear((y) => y - 1);
                  } else {
                    setCurrentMonth((m) => m - 1);
                  }
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 border border-white/10 transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-xl font-bold text-white min-w-44 text-center">
                {MONTH_NAMES[currentMonth - 1]} {currentYear}
              </h2>
              <button
                onClick={() => {
                  if (currentMonth === 12) {
                    setCurrentMonth(1);
                    setCurrentYear((y) => y + 1);
                  } else {
                    setCurrentMonth((m) => m + 1);
                  }
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 border border-white/10 transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> {sundaysInMonth} Sundays (Fixed Holiday)
              </span>
              <span className="flex items-center gap-1.5 text-cyan-300 font-semibold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> {monthHolidays.length} Company Holidays
              </span>
              <button
                onClick={() => {
                  setCurrentYear(today.getFullYear());
                  setCurrentMonth(today.getMonth() + 1);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
              >
                Today
              </button>
            </div>
          </div>

          {/* View Mode: Calendar */}
          {viewMode === "calendar" ? (
            <div className="neo-card p-4 sm:p-6 mb-6">
              <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, idx) => (
                  <div
                    key={dayName}
                    className={`py-2 text-xs font-bold uppercase tracking-wider ${
                      idx === 0 ? "text-amber-400 font-extrabold" : "text-white/40"
                    }`}
                  >
                    {dayName} {idx === 0 && <span className="text-[10px] text-amber-400/70 lowercase block">(fixed off)</span>}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((d, index) => {
                  if (d === null) {
                    return <div key={`empty-${index}`} className="h-28 rounded-xl bg-white/[0.01]" />;
                  }

                  const dayHolidays = holidaysByDay.get(d) || [];
                  const isSun = (index % 7) === 0;
                  const isToday =
                    d === today.getDate() &&
                    currentMonth === (today.getMonth() + 1) &&
                    currentYear === today.getFullYear();

                  return (
                    <div
                      key={`day-${d}`}
                      className={`h-28 p-2 rounded-xl border flex flex-col justify-between transition-all ${
                        isToday
                          ? "bg-cyan-500/10 border-cyan-500/40"
                          : isSun
                          ? "bg-amber-500/[0.04] border-amber-500/25 shadow-[inset_0_0_12px_rgba(245,158,11,0.05)]"
                          : "bg-white/[0.02] border-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold rounded-md px-1.5 py-0.5 ${
                            isToday
                              ? "bg-cyan-400 text-black"
                              : isSun
                              ? "text-amber-300 font-bold bg-amber-500/20 px-1.5"
                              : "text-white/70"
                          }`}
                        >
                          {d}
                        </span>
                        {isSun && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                            Fixed Holiday
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 overflow-y-auto max-h-16">
                        {/* Sunday Fixed Holiday Badge */}
                        {isSun && (
                          <div
                            className="p-1 rounded-lg text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/40 truncate flex items-center justify-between"
                            title="Sunday: Fixed weekly company holiday (Non-working day / Record only)"
                          >
                            <span className="truncate flex items-center gap-1 font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              Sunday (Weekly Off)
                            </span>
                            <span className="text-[8px] uppercase tracking-wider text-amber-400 font-mono shrink-0 ml-1 bg-amber-400/20 px-1 py-0.5 rounded">
                              Fixed
                            </span>
                          </div>
                        )}

                        {dayHolidays.map((h) => (
                          <div
                            key={h.holiday_id}
                            className="p-1 rounded-lg text-[10px] font-semibold bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 truncate"
                            title={`${h.name} (${h.holiday_type}) - ${h.description || ""}`}
                          >
                            {h.name}
                          </div>
                        ))}
                      </div>
                      <div />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* View Mode: List */
            <div className="space-y-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
                  <span>
                    <strong>Fixed Sunday Policy:</strong> Every Sunday is recognized as a permanent fixed company holiday. Sunday work is recorded for administrative tracking only and does not count as a standard workday or absence.
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none text-white/80 shrink-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSundaysInList}
                    onChange={(e) => setIncludeSundaysInList(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-amber-400 focus:ring-0"
                  />
                  <span>Show Sundays in List</span>
                </label>
              </div>

              <div className="neo-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Date", "Holiday Name", "Type", "Applicable Company", "Description"].map((th) => (
                        <th key={th} className="px-5 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">
                          {th}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayHolidays.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-16 text-white/40 text-sm">
                          No holidays scheduled for {currentYear}.
                        </td>
                      </tr>
                    ) : (
                      displayHolidays.map((h) => {
                        const isFixedSunday = h.holiday_id < 0 || h.holiday_type === "Fixed Holiday" || h.name.includes("Sunday");
                        return (
                          <tr
                            key={h.holiday_id}
                            className={`transition-colors border-b border-white/5 ${
                              isFixedSunday ? "bg-amber-500/[0.02] hover:bg-amber-500/[0.05]" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <td className="px-5 py-4 font-mono font-semibold">
                              <span className={isFixedSunday ? "text-amber-300" : "text-cyan-300"}>{h.date}</span>
                            </td>
                            <td className="px-5 py-4 font-bold text-white flex items-center gap-2">
                              {isFixedSunday && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                              {h.name}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                  isFixedSunday
                                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                    : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                                }`}
                              >
                                {h.holiday_type}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-white/70">{h.company_name}</td>
                            <td className="px-5 py-4 text-white/50 text-xs max-w-xs truncate">{h.description || "—"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Information Card */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-start gap-3 text-xs text-white/40">
            <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white/70 font-semibold mb-0.5">Understanding Company Holidays</p>
              <p>
                Company holidays and Sundays are excluded from required working days and never penalize employee attendance or create unapproved absences. Attendance recorded on Sundays is tracked for historical reference only.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}