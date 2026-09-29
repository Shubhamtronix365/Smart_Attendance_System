"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Fingerprint,
  Radio,
  Lock,
  Building2,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  Key,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { authApi } from "@/services/api";
import { formatDate } from "@/utils/formatters";

export default function EmployeeProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      error("Please enter both current and new password.");
      return;
    }
    if (newPassword.length < 6) {
      error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      error("New password and confirm password do not match.");
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Change password error:", err);
      error(err.response?.data?.detail || "Failed to update password.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  const avatar = (user.name || "EM")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <EmployeeSidebar />
      <EmployeeTopBar
        title="My Profile"
        subtitle="Manage your personal information, biometric credentials, and security"
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        <div className="max-w-4xl">
          {/* Header Banner */}
          <div className="p-6 md:p-8 rounded-3xl bg-white/[0.03] border border-white/10 mb-8 relative overflow-hidden shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-2xl text-black shrink-0 shadow-lg shadow-cyan-500/20"
                style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
              >
                {avatar}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mb-1.5">
                  <h2 className="text-2xl font-black text-white">{user.name}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active Staff
                  </span>
                </div>
                <p className="text-white/60 text-xs mb-3">
                  {user.designation || "Software Engineer"} · {user.department || "Engineering"}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-white/40">
                  <span className="flex items-center gap-1.5">
                    <User size={13} className="text-cyan-400" />
                    ID: {user.employee_code || `EMP${String(user.employee_id).padStart(3, "0")}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mail size={13} className="text-cyan-400" />
                    {user.email}
                  </span>
                  {user.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} className="text-cyan-400" />
                      {user.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Biometric & Hardware Credentials */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                  <Fingerprint size={18} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Biometric Credentials</h3>
                </div>

                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                        <Fingerprint size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">R307 Optical Sensor Slot</p>
                        <p className="text-[10px] text-white/40">Hardware fingerprint slot on ESP32 terminal</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {user.fingerprint_id ? `Slot #${user.fingerprint_id}` : "Not Enrolled"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <Radio size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">RC522 RFID Card UID</p>
                        <p className="text-[10px] text-white/40">Contactless badge reader ID</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {user.rfid_uid || "Not Linked"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                        <Calendar size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Date of Joining</p>
                        <p className="text-[10px] text-white/40">Official service start date</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-white/70">
                      {user.joining_date ? formatDate(user.joining_date) : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-2 text-[11px] text-white/40">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                <span>Sensor slots are registered and managed by System Administrator.</span>
              </div>
            </motion.div>

            {/* Change Password Form */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                  <Key size={18} className="text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Change Account Password</h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white outline-none focus:border-cyan-400 transition-all placeholder:text-white/20"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                    >
                      {isUpdatingPassword ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Updating Password...
                        </>
                      ) : (
                        <>
                          <Lock size={13} />
                          Update Password
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <p className="text-[10px] text-white/30 mt-4 text-center">
                Updating your password will require signing in again on next visit.
              </p>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
