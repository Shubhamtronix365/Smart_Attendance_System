"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight,
  Building, Tag, FileText, CheckCircle2, AlertCircle, Info, Sparkles
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { holidayApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

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

const HOLIDAY_TYPES = ["National", "Public", "Company", "Optional", "Observance"];

export default function AdminHolidaysPage() {
  const { success, error } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("National");
  const [formCompany, setFormCompany] = useState("All");

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchHolidays = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await holidayApi.list({ year: currentYear });
      setHolidays(res.data || []);
    } catch (err: any) {
      console.error("Error loading holidays", err);
      error("Failed to load company holidays.");
    } finally {
      setIsLoading(false);
    }
  }, [currentYear, error]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const openCreateModal = (presetDate?: string) => {
    setEditingHoliday(null);
    setFormName("");
    setFormDate(presetDate || `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`);
    setFormDescription("");
    setFormType("National");
    setFormCompany("All");
    setIsModalOpen(true);
  };

  const openEditModal = (h: Holiday) => {
    setEditingHoliday(h);
    setFormName(h.name);
    setFormDate(h.date);
    setFormDescription(h.description || "");
    setFormType(h.holiday_type || "National");
    setFormCompany(h.company_name || "All");
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDate) {
      error("Holiday name and date are required.");
      return;
    }

    try {
      if (editingHoliday) {
        await holidayApi.update(editingHoliday.holiday_id, {
          name: formName.trim(),
          date: formDate,
          description: formDescription.trim(),
          holiday_type: formType,
          company_name: formCompany.trim() || "All",
        });
        success("Holiday updated successfully.");
      } else {
        await holidayApi.create({
          name: formName.trim(),
          date: formDate,
          description: formDescription.trim(),
          holiday_type: formType,
          company_name: formCompany.trim() || "All",
        });
        success("Company holiday created successfully.");
      }
      setIsModalOpen(false);
      fetchHolidays();
    } catch (err: any) {
      console.error("Error saving holiday", err);
      error(err.response?.data?.detail || "Failed to save holiday entry.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await holidayApi.delete(id);
      success("Holiday removed.");
      setDeleteConfirmId(null);
      fetchHolidays();
    } catch (err: any) {
      console.error("Error deleting holiday", err);
      error(err.response?.data?.detail || "Failed to delete holiday.");
    }
  };

  // Calendar Grid Computations
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const days = [];

    // Prefix empty slots
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
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
      <AdminSidebar />
      <AdminTopBar title="Holiday Calendar" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
                <CalendarIcon className="text-cyan-400" /> Company Holiday Calendar
              </h1>
              <p className="text-white/40 text-sm mt-0.5">
                Manage organization holidays (excluded from absence and payroll working day counts)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
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

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openCreateModal()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
              >
                <Plus size={16} /> Add Holiday
              </motion.button>
            </div>
          </div>

          {/* Month Navigation Row */}
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

            <div className="flex items-center gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> {monthHolidays.length} Holidays this month
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
            <div className="neo-card p-4 sm:p-6 overflow-hidden">
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

                  const dayDateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

                  return (
                    <div
                      key={`day-${d}`}
                      onClick={() => openCreateModal(dayDateStr)}
                      className={`h-28 p-2 rounded-xl border flex flex-col justify-between transition-all cursor-pointer group ${
                        isToday
                          ? "bg-cyan-500/10 border-cyan-500/40"
                          : isSun
                          ? "bg-amber-500/[0.03] border-amber-500/15"
                          : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]"
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
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(h);
                            }}
                            className="p-1 rounded-lg text-[10px] font-semibold bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 truncate hover:bg-cyan-500/30 transition-all flex items-center justify-between"
                            title={`${h.name} (${h.holiday_type}) - ${h.description || "No description"}`}
                          >
                            <span className="truncate">{h.name}</span>
                          </div>
                        ))}
                      </div>

                      <div className="text-[9px] text-white/20 group-hover:text-cyan-400/70 transition-colors text-right">
                        + Add
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* View Mode: List */
            <div className="neo-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Date", "Holiday Name", "Type", "Applicable Company", "Description", "Actions"].map((th) => (
                      <th key={th} className="px-5 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holidays.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-white/40 text-sm">
                        No company holidays configured for {currentYear}.
                      </td>
                    </tr>
                  ) : (
                    holidays.map((h) => (
                      <tr
                        key={h.holiday_id}
                        className="hover:bg-white/[0.02] transition-colors border-b border-white/5"
                      >
                        <td className="px-5 py-4 font-mono text-cyan-300 font-semibold">{h.date}</td>
                        <td className="px-5 py-4 text-white font-bold">{h.name}</td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {h.holiday_type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-white/70">{h.company_name}</td>
                        <td className="px-5 py-4 text-white/50 text-xs max-w-xs truncate">{h.description || "—"}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(h)}
                              className="p-1.5 rounded-lg text-white/40 hover:text-cyan-300 hover:bg-cyan-400/10 transition-all"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(h.holiday_id)}
                              className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md rounded-3xl bg-[#0a0f1e] border border-cyan-500/25 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <h3 className="text-white font-black text-lg">
                  {editingHoliday ? "Edit Company Holiday" : "Add Company Holiday"}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Holiday Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Independence Day"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                      Holiday Type
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-white bg-[#0a0f1e] border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                    >
                      {HOLIDAY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Applicable Company / Org
                  </label>
                  <input
                    type="text"
                    placeholder="All (or specific company name)"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1">
                    Description / Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Additional context about this holiday..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-white/5 border border-white/10 rounded-xl outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm text-white/60 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black"
                    style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                  >
                    {editingHoliday ? "Update Holiday" : "Save Holiday"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-3xl bg-[#0a0f1e] border border-red-500/30 p-6 text-center">
              <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
              <h4 className="text-lg font-bold text-white mb-2">Delete this Holiday?</h4>
              <p className="text-white/50 text-xs mb-6">
                This will remove the holiday from the calendar. Existing historical payroll records will not be affected.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 rounded-xl text-xs text-white/60 hover:text-white border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
