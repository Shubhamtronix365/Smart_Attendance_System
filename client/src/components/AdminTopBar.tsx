"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, Search, Fingerprint, LogOut, User, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

import { attendanceApi } from "@/services/api";
import { formatTime } from "@/utils/formatters";

// Live clock hook
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  unread: boolean;
  link?: string;
}

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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Load real recent live events as notifications
  useEffect(() => {
    let isMounted = true;
    const loadRecentEvents = async () => {
      try {
        const res = await attendanceApi.live();
        if (res.data && Array.isArray(res.data) && isMounted) {
          const items: NotificationItem[] = res.data.map((item: any) => ({
            id: `att-${item.attendance_id || item.employee_id}-${item.check_in || Date.now()}`,
            text: `${item.employee_name || 'Employee'} punched ${item.status || 'in'} (${formatTime(item.check_in || item.check_out, false)})`,
            time: item.check_in ? formatTime(item.check_in, false) : "Recent",
            unread: true,
            link: "/admin/attendance",
          }));
          setNotifications(items);
        }
      } catch (err) {
        // Fallback default
        if (isMounted) {
          setNotifications([
            { id: "1", text: "Biometric system online and listening for events", time: "Just now", unread: false, link: "/admin/attendance" }
          ]);
        }
      }
    };

    loadRecentEvents();

    // Listen to real-time WebSocket events
    let ws: WebSocket | null = null;
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws");
      const wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "live_attendance" || data.event === "attendance_updated") {
            const empName = data.employee_name || data.data?.employee_name || "Employee";
            const punchStatus = data.status || data.data?.status || "checked in";
            const newNotif: NotificationItem = {
              id: `ws-${Date.now()}-${Math.random()}`,
              text: `${empName} ${punchStatus} via biometric hardware`,
              time: "Just now",
              unread: true,
              link: "/admin/attendance",
            };
            setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
          } else if (data.event === "leave_created") {
            const newNotif: NotificationItem = {
              id: `ws-leave-${Date.now()}`,
              text: `New leave request submitted`,
              time: "Just now",
              unread: true,
              link: "/admin/leave",
            };
            setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
          }
        } catch {}
      };
    } catch {}

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, []);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/admin/employees?search=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <header
      className={`fixed top-0 right-0 z-20 h-16 flex items-center px-4 md:px-6 gap-3 md:gap-4 transition-all duration-300 left-0 ${
        sidebarCollapsed ? "md:left-[72px]" : "md:left-60"
      }`}
      style={{
        background: "rgba(10,15,30,0.85)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Hamburger Menu Button (Mobile only) */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("toggle-admin-sidebar"))}
        className="md:hidden text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-all shrink-0 flex items-center justify-center border border-white/10"
        aria-label="Toggle navigation menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Page title */}
      <h2 className="text-white font-bold text-base sm:text-lg mr-auto truncate">{title}</h2>

      {/* Live date/time */}
      <div className="hidden md:flex flex-col items-end">
        <span className="text-white/70 text-xs font-mono tabular-nums">{timeStr}</span>
        <span className="text-white/30 text-xs">{dateStr}</span>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="relative hidden lg:flex items-center">
        <Search size={14} className="absolute left-3 text-white/30" />
        <input
          type="text"
          placeholder="Search employees..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-52 pl-9 pr-4 py-2 text-white text-sm outline-none rounded-xl transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
      </form>

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
              className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden z-50"
              style={{
                background: "rgba(10,15,30,0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-white/30 text-xs">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      setNotifications((prev) =>
                        prev.map((item) => (item.id === n.id ? { ...item, unread: false } : item))
                      );
                      setShowNotifications(false);
                      if (n.link) router.push(n.link);
                    }}
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
                ))
              )}
              <div className="px-4 py-3 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    router.push("/admin/attendance");
                  }}
                  className="text-cyan-400/70 hover:text-cyan-400 text-xs transition-colors"
                >
                  View live attendance feed &rarr;
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
              className="absolute right-0 top-12 w-52 max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden z-50"
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
