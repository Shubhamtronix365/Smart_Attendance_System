"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Info, Clock, Sparkles
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
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeeHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <EmployeeSidebar />
      <EmployeeTopBar title="Holidays" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
              <CalendarIcon className="text-cyan-400" /> Company Holiday Calendar
            </h1>
            <p className="text-white/40 text-sm mt-0.5">
              Official organization holidays and public observances for {currentYear}
            </p>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-6">
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
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 border border-white/10"
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
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 border border-white/10"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-xl font-medium">
              {monthHolidays.length} Holidays this month
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="neo-card p-4 sm:p-6 mb-6">
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, idx) => (
                <div
                  key={dayName}
                  className={`py-2 text-xs font-bold uppercase tracking-wider ${
                    idx === 0 ? "text-amber-400/80" : "text-white/40"
                  }`}
                >
                  {dayName}
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
                    className={`h-28 p-2 rounded-xl border flex flex-col justify-between ${
                      isToday
                        ? "bg-cyan-500/10 border-cyan-500/40"
                        : isSun
                        ? "bg-amber-500/[0.03] border-amber-500/15"
                        : "bg-white/[0.02] border-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold rounded-md px-1.5 py-0.5 ${
                          isToday
                            ? "bg-cyan-400 text-black"
                            : isSun
                            ? "text-amber-400 font-semibold"
                            : "text-white/70"
                        }`}
                      >
                        {d}
                      </span>
                      {isSun && <span className="text-[10px] text-amber-400/60 font-mono">Sun</span>}
                    </div>

                    <div className="space-y-1 overflow-y-auto max-h-16">
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
        </div>
      </main>
    </div>
  );
}
