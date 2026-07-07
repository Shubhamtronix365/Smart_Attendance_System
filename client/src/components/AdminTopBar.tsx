"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, Search, Fingerprint, LogOut, User, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Live clock hook
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

const NOTIFICATIONS = [
  { id: 1, text: "Raj Kumar clocked in late (9:24 AM)", time: "5m ago", unread: true },
  { id: 2, text: "New leave request from Priya Singh", time: "12m ago", unread: true },
  { id: 3, text: "Payroll processing complete", time: "1h ago", unread: false },
];

interface AdminTopBarProps {
  title?: string;
  userName?: string;
  userRole?: string;
  sidebarCollapsed?: boolean;
}

export default function AdminTopBar({
  title = "Dashboard",
  userName: propUserName,
  userRole: propUserRole,
  sidebarCollapsed = false,
}: AdminTopBarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const now = useLiveClock();

  const userName = user?.name || propUserName || "Admin User";
  const userRole = user?.role === "admin" ? "Administrator" : (user?.designation || propUserRole || "Employee");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length;

  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <header
      className="fixed top-0 right-0 z-20 h-16 flex items-center px-6 gap-4"
      style={{
        left: sidebarCollapsed ? "72px" : "240px",
        transition: "left 0.3s",
        background: "rgba(10,15,30,0.85)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Hamburger Menu Button (Mobile only) */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("toggle-admin-sidebar"))}
        className="md:hidden text-white/60 hover:text-white p-1.5 rounded-xl hover:bg-white/5 transition-all mr-2 flex items-center justify-center border border-white/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Page title */}
      <h2 className="text-white font-bold text-lg mr-auto">{title}</h2>

      {/* Live date/time */}
      <div className="hidden md:flex flex-col items-end">
        <span className="text-white/70 text-xs font-mono tabular-nums">{timeStr}</span>
        <span className="text-white/30 text-xs">{dateStr}</span>
      </div>

      {/* Search bar */}
      <div className="relative hidden lg:flex items-center">
        <Search size={14} className="absolute left-3 text-white/30" />
        <input
          type="text"
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-48 pl-9 pr-4 py-2 text-white text-sm outline-none rounded-xl transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
      </div>

      {/* Notification Bell */}
      <div className="relative">
        <motion.button
          id="notification-bell"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowNotifications((s) => !s); setShowUserMenu(false); }}
          className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-black"
              style={{ background: "#00f5ff", boxShadow: "0 0 8px rgba(0,245,255,0.6)" }}
            >
              {unreadCount}
            </motion.span>
          )}
        </motion.button>

        {/* Notification dropdown */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-12 w-80 rounded-2xl overflow-hidden z-50"
              style={{
                background: "rgba(10,15,30,0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white text-sm font-semibold">Notifications</p>
              </div>
              {NOTIFICATIONS.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${n.unread ? "bg-cyan-400" : "bg-white/20"}`}
                    style={n.unread ? { boxShadow: "0 0 6px #00f5ff" } : {}} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-xs leading-relaxed">{n.text}</p>
                    <p className="text-white/30 text-xs mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 text-center">
                <button className="text-cyan-400/70 hover:text-cyan-400 text-xs transition-colors">
                  View all notifications
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User menu */}
      <div className="relative">
        <motion.button
          id="user-menu-toggle"
          whileHover={{ scale: 1.02 }}
          onClick={() => { setShowUserMenu((s) => !s); setShowNotifications(false); }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-black"
            style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white text-sm font-medium hidden md:block">{userName}</span>
          <ChevronDown size={14} className="text-white/40" />
        </motion.button>

        {/* User dropdown */}
        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-12 w-52 rounded-2xl overflow-hidden z-50"
              style={{
                background: "rgba(10,15,30,0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white text-sm font-semibold">{userName}</p>
                <p className="text-white/40 text-xs">{userRole}</p>
              </div>
              {[
                { icon: User, label: "My Profile", href: "/admin/profile" },
                { icon: Settings, label: "Settings", href: "/admin/settings" },
              ].map(({ icon: Icon, label, href }) => (
                <button
                  key={label}
                  onClick={() => router.push(href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors text-sm"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Close dropdowns when clicking outside */}
      {(showNotifications || showUserMenu) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setShowNotifications(false); setShowUserMenu(false); }}
        />
      )}
    </header>
  );
}
