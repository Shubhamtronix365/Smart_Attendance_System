"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, CalendarCheck, FileText,
  DollarSign, BarChart2, Settings, LogOut,
  Fingerprint, ChevronLeft, ChevronRight, Database,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard" },
  { id: "employees", label: "Employees", icon: Users, href: "/admin/employees" },
  { id: "attendance", label: "Attendance", icon: CalendarCheck, href: "/admin/attendance" },
  { id: "leave", label: "Leave", icon: FileText, href: "/admin/leave" },
  { id: "payroll", label: "Payroll", icon: DollarSign, href: "/admin/payroll" },
  { id: "reports", label: "Reports", icon: BarChart2, href: "/admin/reports" },
  { id: "database", label: "Database", icon: Database, href: "/admin/database" },
  { id: "settings", label: "Settings", icon: Settings, href: "/admin/settings" },
];

interface AdminSidebarProps {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
}

export default function AdminSidebar({
  userName: propUserName,
  userRole: propUserRole,
  userAvatar: propUserAvatar,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setMobileOpen((o) => !o);
    const handleClose = () => setMobileOpen(false);
    window.addEventListener("toggle-admin-sidebar", handleToggle);
    window.addEventListener("close-admin-sidebar", handleClose);
    return () => {
      window.removeEventListener("toggle-admin-sidebar", handleToggle);
      window.removeEventListener("close-admin-sidebar", handleClose);
    };
  }, []);

  const userName = user?.name || propUserName || "Admin User";
  const userRole = user?.role === "admin" ? "Administrator" : (user?.designation || propUserRole || "Employee");
  const userAvatar = user?.avatar || propUserAvatar;

  const sidebarWidth = collapsed ? 72 : 240;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 shrink-0 relative"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(0,245,255,0.2), rgba(124,58,237,0.2))",
            border: "1px solid rgba(0,245,255,0.3)",
          }}>
          <Fingerprint size={18} className="text-cyan-400" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="font-black text-white text-base whitespace-nowrap"
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

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center z-10 transition-all"
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

      {/* Nav items */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <div key={item.id} className="relative">
                {/* Active pill indicator */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
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

      {/* User card at bottom */}
      <div className="px-2 pb-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-3 py-3 mt-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)" }}>
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
              boxShadow: "0 0 12px rgba(0,245,255,0.3)",
            }}
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              userName.charAt(0).toUpperCase()
            )}
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0"
              >
                <p className="text-white text-xs font-semibold truncate">{userName}</p>
                <p className="text-white/40 text-xs truncate">{userRole}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={logout}
                className="text-white/30 hover:text-red-400 transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut size={15} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  </>
);
}
