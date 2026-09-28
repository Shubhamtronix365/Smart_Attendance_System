"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight,
  Filter, Fingerprint, User, Mail, Phone, Building2, Briefcase,
  DollarSign, Calendar, CheckCircle2, XCircle, AlertTriangle,
  MoreVertical, Lock, Eye, EyeOff, Cpu, Radio,
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import HardwareEnrollmentModal from "@/components/HardwareEnrollmentModal";
import { employeesApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Employee {
  id: string;
  empId: string;
  employeeCode?: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  basicSalary: number;
  fingerprintId: string;
  rfidUid?: string;
  joiningDate: string;
  status: "active" | "inactive";
  avatar: string;
  password?: string;
}

const DEPARTMENTS = ["Engineering", "HR", "Finance", "Operations", "Design", "Marketing"];

const PAGE_SIZE = 10;

// ─── Debounce Hook ────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Input Field Component ────────────────────────────────────────────────────
function FormField({
  label, id, type = "text", value, onChange, placeholder, icon, required = false,
}: {
  label: string; id: string; type?: string; value: string; placeholder?: string;
  onChange: (v: string) => void; icon?: React.ReactNode; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-white/50 text-xs font-medium mb-1.5 block">
        {label} {required && <span className="text-cyan-400">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: focused ? "#00f5ff" : "rgba(255,255,255,0.25)" }}>
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          required={required}
          className="w-full py-2.5 text-white text-sm outline-none rounded-xl transition-all"
          style={{
            paddingLeft: icon ? "2.5rem" : "0.875rem",
            paddingRight: "0.875rem",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${focused ? "rgba(0,245,255,0.4)" : "rgba(255,255,255,0.1)"}`,
            boxShadow: focused ? "0 0 16px rgba(0,245,255,0.12)" : "none",
          }}
        />
      </div>
    </div>
  );
}

// ─── Select Field ─────────────────────────────────────────────────────────────
function SelectField({ label, id, value, onChange, options, icon }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  options: string[]; icon?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-white/50 text-xs font-medium mb-1.5 block">{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">{icon}</div>
        )}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full py-2.5 text-white text-sm outline-none rounded-xl appearance-none transition-all"
          style={{
            paddingLeft: icon ? "2.5rem" : "0.875rem",
            paddingRight: "2rem",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
        >
          <option value="" className="bg-[#0a0f1e]">Select...</option>
          {options.map((o) => (
            <option key={o} value={o} className="bg-[#0a0f1e]">{o}</option>
          ))}
        </select>
        <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none rotate-90" />
      </div>
    </div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
interface EmployeeModalProps {
  mode: "add" | "edit";
  employee?: Employee;
  onClose: () => void;
  onSave: (emp: Partial<Employee>) => void;
}

function EmployeeModal({ mode, employee, onClose, onSave }: EmployeeModalProps) {
  const [form, setForm] = useState<Partial<Employee>>({
    name: employee?.name || "",
    email: employee?.email || "",
    phone: employee?.phone || "",
    department: employee?.department || "",
    designation: employee?.designation || "",
    basicSalary: employee?.basicSalary || 0,
    fingerprintId: employee?.fingerprintId || "",
    joiningDate: employee?.joiningDate || new Date().toISOString().split("T")[0],
    status: employee?.status || "active",
    password: mode === "add" ? "password123" : "",
  });
  const set = (k: keyof Employee) => (v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="w-full max-w-2xl rounded-3xl overflow-hidden"
          style={{
            background: "rgba(10,15,30,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-8 py-5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <h3 className="text-white font-black text-lg">
                {mode === "add" ? "Add New Employee" : "Edit Employee"}
              </h3>
              <p className="text-white/40 text-xs mt-0.5">
                {mode === "add" ? "Fill in employee details below" : `Editing ${employee?.name}`}
              </p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
              <FormField label="Full Name" id="emp-name" value={form.name || ""} onChange={set("name")}
                placeholder="Arjun Sharma" icon={<User size={14} />} required />
              <FormField label="Email Address" id="emp-email" type="email" value={form.email || ""} onChange={set("email")}
                placeholder="arjun@company.com" icon={<Mail size={14} />} required />
              <FormField label="Phone Number" id="emp-phone" value={form.phone || ""} onChange={set("phone")}
                placeholder="+91 98765 43210" icon={<Phone size={14} />} />
              <SelectField label="Department" id="emp-dept" value={form.department || ""} onChange={set("department")}
                options={DEPARTMENTS} icon={<Building2 size={14} />} />
              <FormField label="Designation" id="emp-desig" value={form.designation || ""} onChange={set("designation")}
                placeholder="Sr. Engineer" icon={<Briefcase size={14} />} required />
              <FormField label="Basic Salary (₹)" id="emp-salary" type="number" value={String(form.basicSalary || "")}
                onChange={(v) => set("basicSalary")(Number(v))}
                placeholder="75000" icon={<DollarSign size={14} />} />
              <FormField label="Fingerprint ID" id="emp-fp" value={form.fingerprintId || ""} onChange={set("fingerprintId")}
                placeholder="FP-001 (from device)" icon={<Fingerprint size={14} />} />
              <FormField label={mode === "add" ? "Default Password" : "Reset Password (Leave blank to keep)"} id="emp-pwd" value={form.password || ""} onChange={set("password")}
                placeholder={mode === "add" ? "password123" : "Enter new password"} icon={<Lock size={14} />} />
              <FormField label="Joining Date" id="emp-join" type="date" value={form.joiningDate || ""} onChange={set("joiningDate")}
                icon={<Calendar size={14} />} />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-8 py-5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all">
                Cancel
              </button>
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
              >
                {mode === "add" ? "Add Employee" : "Save Changes"}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────
function EditDrawer({ employee, onClose, onSave }: {
  employee: Employee; onClose: () => void; onSave: (emp: Partial<Employee>) => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto"
          style={{
            background: "rgba(10,15,30,0.99)",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "-24px 0 80px rgba(0,0,0,0.5)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <h3 className="text-white font-black text-lg">Edit Employee</h3>
              <p className="text-white/40 text-xs">{employee.empId}</p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
              <X size={16} />
            </button>
          </div>
          <div className="p-6">
            <EmployeeModal mode="edit" employee={employee} onClose={onClose} onSave={onSave} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Delete Confirmation Dialog ───────────────────────────────────────────────
function DeleteDialog({ employee, onClose, onConfirm }: {
  employee: Employee; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-full max-w-sm rounded-3xl p-8 text-center"
          style={{
            background: "rgba(10,15,30,0.98)",
            border: "1px solid rgba(239,68,68,0.25)",
            boxShadow: "0 0 60px rgba(239,68,68,0.1)",
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <AlertTriangle size={28} className="text-red-400" />
          </motion.div>
          <h3 className="text-white font-black text-xl mb-2">Delete Employee?</h3>
          <p className="text-white/50 text-sm mb-6">
            This will permanently remove <span className="text-white font-semibold">{employee.name}</span> ({employee.empId}).
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 border border-white/10 transition-all">
              Cancel
            </button>
            <motion.button
              onClick={onConfirm}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
            >
              Delete
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Delete All Confirmation Dialog ───────────────────────────────────────────
function DeleteAllDialog({ count, onClose, onConfirm }: {
  count: number; onClose: () => void; onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const isReady = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-full max-w-md rounded-3xl p-8 text-center"
          style={{
            background: "rgba(10,15,30,0.98)",
            border: "1px solid rgba(239,68,68,0.4)",
            boxShadow: "0 0 80px rgba(239,68,68,0.2)",
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}
          >
            <Trash2 size={28} className="text-red-400" />
          </motion.div>
          <h3 className="text-white font-black text-xl mb-2">Delete ALL Employees?</h3>
          <p className="text-white/60 text-sm mb-4 leading-relaxed">
            This will wipe <span className="text-red-400 font-bold">{count} employees</span> from the cloud database AND send an immediate purge command to all connected ESP32 biometric devices.
          </p>
          <div className="mb-6 text-left">
            <label className="text-xs text-white/50 block mb-1.5 font-medium">
              Type <span className="text-red-400 font-bold">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-center font-mono font-bold tracking-widest text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 border border-white/10 transition-all"
            >
              Cancel
            </button>
            <motion.button
              disabled={!isReady}
              onClick={onConfirm}
              whileHover={{ scale: isReady ? 1.02 : 1 }}
              whileTap={{ scale: isReady ? 0.97 : 1 }}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              style={{ background: isReady ? "linear-gradient(135deg, #ef4444, #dc2626)" : "rgba(239,68,68,0.2)" }}
            >
              Confirm Wipe
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Employee Row ─────────────────────────────────────────────────────────────
function EmployeeRow({ emp, index, onEdit, onDelete }: {
  emp: Employee; index: number; onEdit: () => void; onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRowPassword, setShowRowPassword] = useState(false);
  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group transition-colors hover:bg-white/[0.025]"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
            style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}>
            {emp.avatar}
          </div>
          <div>
            <p className="text-white text-sm font-semibold">{emp.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="text-white/40 text-xs font-mono">{emp.employeeCode || emp.empId}</span>
              {emp.fingerprintId && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded font-mono">
                  <Fingerprint size={10} /> FP #{emp.fingerprintId}
                </span>
              )}
              {emp.rfidUid && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-mono">
                  <Radio size={10} /> {emp.rfidUid}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 text-white/60 text-sm hidden md:table-cell">{emp.email}</td>
      <td className="px-4 py-3.5 text-white/60 text-sm hidden md:table-cell font-mono">
        <div className="flex items-center gap-1.5">
          <span>{showRowPassword ? (emp.password || "password123") : "••••••••"}</span>
          <button 
            type="button"
            onClick={() => setShowRowPassword(!showRowPassword)}
            className="text-white/30 hover:text-cyan-400 transition-colors p-1"
            title={showRowPassword ? "Hide password" : "Show password"}
          >
            {showRowPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <span className="px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "rgba(0,245,255,0.08)", color: "#00f5ff", border: "1px solid rgba(0,245,255,0.15)" }}>
          {emp.department}
        </span>
      </td>
      <td className="px-4 py-3.5 text-white/50 text-sm hidden xl:table-cell">{emp.designation}</td>
      <td className="px-4 py-3.5 hidden xl:table-cell">
        <span className={`flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-semibold ${
          emp.status === "active"
            ? "text-green-400"
            : "text-red-400"
        }`}
          style={{
            background: emp.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${emp.status === "active" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}>
          {emp.status === "active" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
          {emp.status === "active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="relative flex items-center justify-end">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-cyan-400 hover:bg-cyan-400/10 transition-all">
              <Pencil size={13} />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </td>
    </motion.tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const { success, error } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showHardwareModal, setShowHardwareModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await employeesApi.list({ size: "100" });
      const mapped = res.data.map((emp: any) => ({
        id: String(emp.employee_id),
        empId: `EMP${String(emp.employee_id).padStart(3, "0")}`,
        employeeCode: emp.employee_code || `EMP${String(emp.employee_id).padStart(3, "0")}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone || "",
        department: emp.department || "",
        designation: emp.designation || "",
        basicSalary: Number(emp.salary) || 0,
        fingerprintId: emp.fingerprint_id ? String(emp.fingerprint_id) : "",
        rfidUid: emp.rfid_uid || "",
        joiningDate: emp.joining_date || "",
        status: emp.is_active ? "active" : "inactive",
        avatar: (emp.name || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
        password: emp.plain_password || "",
      }));
      setEmployees(mapped);
    } catch (err) {
      console.error("Error loading employees", err);
      error("Failed to load employee list.");
    }
  }, [error]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Filtered employees
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const matchSearch = !debouncedSearch ||
        e.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        e.empId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        e.email.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchDept = !deptFilter || e.department === deptFilter;
      const matchStatus = !statusFilter || e.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [employees, debouncedSearch, deptFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => setPage(1), [debouncedSearch, deptFilter, statusFilter]);

  const handleAdd = useCallback(async (data: Partial<Employee>) => {
    try {
      const backendData = {
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        department: data.department || "",
        designation: data.designation || "",
        salary: Number(data.basicSalary) || 0,
        fingerprint_id: data.fingerprintId ? Number(data.fingerprintId) : null,
        role: "employee",
        password: "password123", // default password
      };
      await employeesApi.create(backendData);
      success("Employee added successfully.");
      setShowModal(false);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error creating employee", err);
      error(err.response?.data?.detail || "Failed to create employee.");
    }
  }, [fetchEmployees, success, error]);

  const handleEdit = useCallback(async (data: Partial<Employee>) => {
    if (!editEmployee) return;
    try {
      const backendData = {
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        department: data.department || "",
        designation: data.designation || "",
        salary: Number(data.basicSalary) || 0,
        fingerprint_id: data.fingerprintId ? Number(data.fingerprintId) : null,
      };
      await employeesApi.update(editEmployee.id, backendData);
      success("Employee details updated.");
      setEditEmployee(null);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error updating employee", err);
      error(err.response?.data?.detail || "Failed to update employee.");
    }
  }, [editEmployee, fetchEmployees, success, error]);

  const handleDelete = useCallback(async () => {
    if (!deleteEmployee) return;
    try {
      await employeesApi.delete(deleteEmployee.id);
      success("Employee deleted successfully.");
      setDeleteEmployee(null);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error deleting employee", err);
      error(err.response?.data?.detail || "Failed to delete employee.");
    }
  }, [deleteEmployee, fetchEmployees, success, error]);

  const handleDeleteAll = useCallback(async () => {
    try {
      const res = await employeesApi.deleteAll();
      success(res.data?.message || "All employees cleared successfully.");
      setShowDeleteAllModal(false);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error clearing employees", err);
      error(err.response?.data?.detail || "Failed to clear all employees.");
    }
  }, [fetchEmployees, success, error]);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar userName="Admin User" userRole="Administrator" />
      <AdminTopBar title="Employees" userName="Admin User" userRole="Administrator" />

      <main className="min-h-screen pt-16 transition-all" style={{ marginLeft: "240px" }}>
        <div className="p-6 lg:p-8">

          {/* Page header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">Employee Management</h1>
            <p className="text-white/40">Manage your organization&apos;s workforce — {employees.length} total employees</p>
          </motion.div>

          {/* Toolbar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-wrap items-center gap-3 mb-6"
          >
            {/* Search */}
            <div className="relative flex-1 min-w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                id="employee-search"
                type="text"
                placeholder="Search by name, ID or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-white text-sm outline-none rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {/* Department filter */}
            <div className="relative">
              <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <select
                id="dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="pl-8 pr-8 py-2.5 text-white text-sm outline-none rounded-xl appearance-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="" className="bg-[#0a0f1e]">All Departments</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d} className="bg-[#0a0f1e]">{d}</option>)}
              </select>
              <ChevronRight size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none rotate-90" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-2.5 text-white text-sm outline-none rounded-xl appearance-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="" className="bg-[#0a0f1e]">All Status</option>
                <option value="active" className="bg-[#0a0f1e]">Active</option>
                <option value="inactive" className="bg-[#0a0f1e]">Inactive</option>
              </select>
              <ChevronRight size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none rotate-90" />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2.5 ml-auto">
              {employees.length > 0 && (
                <motion.button
                  id="delete-all-btn"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowDeleteAllModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all"
                  title="Wipe all employees from database and hardware"
                >
                  <Trash2 size={14} />
                  <span>Delete All</span>
                </motion.button>
              )}

              <motion.button
                id="smart-enroll-btn"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowHardwareModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 transition-all shadow-[0_0_15px_rgba(0,245,255,0.15)]"
              >
                <Cpu size={15} className="text-cyan-400 animate-pulse" />
                <span>⚡ Smart Enroll (ESP32 Tronix)</span>
              </motion.button>

              <motion.button
                id="add-employee-btn"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
              >
                <Plus size={15} />
                Add Employee
              </motion.button>
            </div>
          </motion.div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="neo-card overflow-hidden"
          >
            {/* Result count */}
            <div className="px-6 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-white/40 text-xs">
                Showing <span className="text-white font-semibold">{paginated.length}</span> of{" "}
                <span className="text-white font-semibold">{filtered.length}</span> employees
              </p>
              {(debouncedSearch || deptFilter || statusFilter) && (
                <button
                  onClick={() => { setSearch(""); setDeptFilter(""); setStatusFilter(""); }}
                  className="text-cyan-400/60 hover:text-cyan-400 text-xs transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Employee", "Email", "Password", "Department", "Designation", "Status", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-semibold uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {paginated.map((emp, i) => (
                      <EmployeeRow
                        key={emp.id}
                        emp={emp}
                        index={i}
                        onEdit={() => setEditEmployee(emp)}
                        onDelete={() => setDeleteEmployee(emp)}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <User size={32} className="text-white/15 mb-3" />
                  <p className="text-white/30 font-medium">No employees found</p>
                  <p className="text-white/20 text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white/30 text-xs">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    id="page-prev"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      id={`page-${p}`}
                      onClick={() => setPage(p)}
                      className="w-8 h-8 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: p === page ? "linear-gradient(135deg, #00f5ff, #7c3aed)" : "rgba(255,255,255,0.04)",
                        color: p === page ? "black" : "rgba(255,255,255,0.4)",
                        border: `1px solid ${p === page ? "transparent" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    id="page-next"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {/* Add Modal */}
      <AnimatePresence>
        {showModal && (
          <EmployeeModal mode="add" onClose={() => setShowModal(false)} onSave={handleAdd} />
        )}
      </AnimatePresence>

      {/* Edit Drawer */}
      <AnimatePresence>
        {editEmployee && (
          <EmployeeModal mode="edit" employee={editEmployee} onClose={() => setEditEmployee(null)} onSave={handleEdit} />
        )}
      </AnimatePresence>

      {/* Delete Dialog */}
      <AnimatePresence>
        {deleteEmployee && (
          <DeleteDialog employee={deleteEmployee} onClose={() => setDeleteEmployee(null)} onConfirm={handleDelete} />
        )}
      </AnimatePresence>

      {/* Delete All Dialog */}
      <AnimatePresence>
        {showDeleteAllModal && (
          <DeleteAllDialog
            count={employees.length}
            onClose={() => setShowDeleteAllModal(false)}
            onConfirm={handleDeleteAll}
          />
        )}
      </AnimatePresence>

      {/* ESP32 Tronix Hardware Enrollment Modal */}
      <HardwareEnrollmentModal
        isOpen={showHardwareModal}
        onClose={() => setShowHardwareModal(false)}
        onSuccess={() => {
          fetchEmployees();
        }}
      />
    </div>
  );
}
