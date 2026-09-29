"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  CalendarCheck,
  Clock,
  DollarSign,
  User,
  LogOut,
  Fingerprint,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/employee/dashboard" },
  { id: "attendance", label: "Attendance", icon: CalendarCheck, href: "/employee/attendance" },
  { id: "leave", label: "Leave Requests", icon: Clock, href: "/employee/leave" },
  { id: "payroll", label: "Payroll & Payslips", icon: DollarSign, href: "/employee/payroll" },
  { id: "profile", label: "My Profile", icon: User, href: "/employee/profile" },
];

export default function EmployeeSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setMobileOpen((o) => !o);
    const handleClose = () => setMobileOpen(false);
    window.addEventListener("toggle-employee-sidebar", handleToggle);
    window.addEventListener("close-employee-sidebar", handleClose);
    return () => {
      window.removeEventListener("toggle-employee-sidebar", handleToggle);
      window.removeEventListener("close-employee-sidebar", handleClose);
    };
  }, []);

  const employeeName = user?.name || "Employee";
  const employeeRole = user?.designation || "Staff Member";
  const employeeAvatar = (user?.name || "EM")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sidebarWidth = collapsed ? 72 : 240;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ type: "spring", stiffness: 200, damping: 26 }}
        className={`fixed left-0 top-0 h-screen z-40 flex flex-col overflow-hidden transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "rgba(10, 15, 30, 0.95)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Header / Logo */}
        <div
          className="flex items-center gap-3 px-4 h-16 shrink-0 relative"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            onClick={() => router.push("/employee/dashboard")}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, rgba(0,245,255,0.2), rgba(124,58,237,0.2))",
              border: "1px solid rgba(0,245,255,0.3)",
            }}
          >
            <Fingerprint size={18} className="text-cyan-400" />
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onClick={() => router.push("/employee/dashboard")}
                className="font-black text-white text-base whitespace-nowrap cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                SmartAttend
              </motion.span>
            )}
          </AnimatePresence>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full items-center justify-center z-10 transition-all"
            style={{
              background: "#0a0f1e",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 0 12px rgba(0,0,0,0.5)",
            }}
          >
            {collapsed ? (
              <ChevronRight size={12} className="text-white/50" />
            ) : (
              <ChevronLeft size={12} className="text-white/50" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-1 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <div key={item.id} className="relative">
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        layoutId="active-pill-emp"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(0,245,255,0.12), rgba(124,58,237,0.12))",
                          border: "1px solid rgba(0,245,255,0.2)",
                        }}
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                  </AnimatePresence>

                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      router.push(item.href);
                    }}
                    className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                    style={{ color: isActive ? "#00f5ff" : "rgba(255,255,255,0.45)" }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      size={18}
                      className="shrink-0 transition-colors"
                      style={{ color: isActive ? "#00f5ff" : undefined }}
                    />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.15 }}
                          className="text-sm font-medium whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Employee Profile Footer */}
        <div className="p-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div
            className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
              collapsed ? "justify-center" : ""
            }`}
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 text-black"
              style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
            >
              {employeeAvatar}
            </div>

            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p className="text-white text-xs font-semibold truncate leading-tight">{employeeName}</p>
                  <p className="text-white/40 text-[10px] truncate leading-tight">{employeeRole}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={logout}
              title="Sign out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
