"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Clock, Key, ShieldAlert, Save, RefreshCw,
  Info, CheckCircle, Database, Cpu, Wifi
} from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import { useToast } from "@/components/ToastProvider";
import { settingsApi, authApi } from "@/services/api";

export default function SettingsPage() {
  const { success, error } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [standardWorkHours, setStandardWorkHours] = useState(8);
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(30);
  const [otMultiplier, setOtMultiplier] = useState(1.5);
  const [deviceApiKey, setDeviceApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Admin password states
  const [adminCurrentPassword, setAdminCurrentPassword] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Load active configurations from API
  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true);
        const data = await settingsApi.get();
        setStandardWorkHours(data.standard_work_hours);
        setLateThresholdMinutes(data.late_threshold_minutes);
        setOtMultiplier(data.ot_multiplier);
        setDeviceApiKey(data.device_api_key);
      } catch (err) {
        console.error("Failed to load settings:", err);
        error("Could not fetch system settings. Make sure backend is running.");
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [error]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const updated = await settingsApi.update({
        standard_work_hours: Number(standardWorkHours),
        late_threshold_minutes: Number(lateThresholdMinutes),
        ot_multiplier: Number(otMultiplier),
        device_api_key: deviceApiKey,
      });
      setStandardWorkHours(updated.standard_work_hours);
      setLateThresholdMinutes(updated.late_threshold_minutes);
      setOtMultiplier(updated.ot_multiplier);
      setDeviceApiKey(updated.device_api_key);
      success("System configurations updated successfully.");
    } catch (err) {
      console.error("Failed to update settings:", err);
      error("Failed to save configuration updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const generateRandomKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-$#@";
    let key = "";
    for (let i = 0; i < 24; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setDeviceApiKey(key);
    success("Generated new API key candidate. Save to apply.");
  };

  const handleChangeAdminPassword = async () => {
    if (!adminCurrentPassword || !adminNewPassword) {
      error("Please enter both current and new passwords.");
      return;
    }
    try {
      setIsChangingPassword(true);
      await authApi.changePassword({
        current_password: adminCurrentPassword,
        new_password: adminNewPassword,
      });
      success("Admin password changed successfully.");
      setAdminCurrentPassword("");
      setAdminNewPassword("");
    } catch (err) {
      console.error(err);
      const errAny = err as any;
      error(errAny.response?.data?.detail || "Failed to update admin password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar userName="Admin User" userRole="Administrator" />
      <AdminTopBar title="Settings" userName="Admin User" userRole="Administrator" />

      <main className="min-h-screen pt-16" style={{ marginLeft: "240px" }}>
        <div className="p-6 lg:p-8">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <h1 className="text-3xl font-black text-white mb-1">System Settings</h1>
            <p className="text-white/40 font-medium text-sm">Configure system thresholds, office hour targets, and ESP32 IoT API credentials</p>
          </motion.div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-10 h-10 rounded-full border-4 border-cyan-400 border-t-transparent"
                />
                <span className="text-white/40 text-sm font-semibold">Loading system settings...</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* Column 1 & 2: Forms */}
                <div className="lg:col-span-2 space-y-6">
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    {/* Shift & Thresholds Card */}
                    <div className="neo-card p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0, 245, 255, 0.1)", border: "1px solid rgba(0, 245, 255, 0.2)" }}>
                          <Clock className="text-cyan-400" size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">Shift & Overtime Thresholds</h3>
                          <p className="text-white/30 text-xs">Define standard times and limits for logging attendance</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Standard Shift Hours</label>
                          <div className="relative">
                            <input
                              type="number"
                              required
                              min="4"
                              max="16"
                              value={standardWorkHours}
                              onChange={(e) => setStandardWorkHours(Number(e.target.value))}
                              className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                            <span className="absolute right-4 top-3.5 text-white/30 text-xs font-semibold">Hours</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Late Arrival Grace Period</label>
                          <div className="relative">
                            <input
                              type="number"
                              required
                              min="0"
                              max="120"
                              value={lateThresholdMinutes}
                              onChange={(e) => setLateThresholdMinutes(Number(e.target.value))}
                              className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                            <span className="absolute right-4 top-3.5 text-white/30 text-xs font-semibold">Minutes</span>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Overtime Pay Rate Multiplier</label>
                          <div className="relative">
                            <input
                              type="number"
                              required
                              step="0.1"
                              min="1.0"
                              max="3.0"
                              value={otMultiplier}
                              onChange={(e) => setOtMultiplier(Number(e.target.value))}
                              className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                            <span className="absolute right-4 top-3.5 text-white/30 text-xs font-semibold">multiplier (e.g. 1.5x)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ESP32 Hardware API Authentication Card */}
                    <div className="neo-card p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(124, 58, 237, 0.1)", border: "1px solid rgba(124, 58, 237, 0.2)" }}>
                          <Key className="text-violet-400" size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">Biometric Hardware API Authorization</h3>
                          <p className="text-white/30 text-xs">Manage authentication credentials used by the physical fingerprint scanner</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Device Access Security Token (x-device-key)</label>
                          <div className="flex gap-3">
                            <input
                              type={showApiKey ? "text" : "password"}
                              required
                              value={deviceApiKey}
                              onChange={(e) => setDeviceApiKey(e.target.value)}
                              placeholder="Enter secret device token"
                              className="flex-1 px-4 py-3 text-white text-sm outline-none rounded-xl font-mono"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="px-4 py-3 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:bg-white/5 transition-all"
                            >
                              {showApiKey ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              onClick={generateRandomKey}
                              className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-semibold text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/10 transition-all"
                            >
                              <RefreshCw size={13} />
                              Generate
                            </button>
                          </div>
                          <p className="text-white/20 text-xs mt-2 flex items-center gap-1.5">
                            <Info size={12} className="text-white/40 shrink-0" />
                            This key must match the value configured in the ESP32 firmware headers.
                          </p>
                        </div>

                        {/* Connection guide blocks */}
                        <div className="pt-4 border-t border-white/[0.05] grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider block mb-1">Check-in POST Endpoint</span>
                            <span className="text-cyan-400 text-xs font-mono select-all block">http://&lt;your-server-ip&gt;:8000/api/device/checkin</span>
                          </div>
                          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider block mb-1">Required HTTP Header</span>
                            <span className="text-violet-400 text-xs font-mono select-all block">x-device-key: &lt;access-key&gt;</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Save Action Bar */}
                    <div className="flex justify-end">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-black shadow-lg shadow-cyan-500/10 transition-all select-none w-full sm:w-auto"
                        style={{
                          background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
                          cursor: isSaving ? "not-allowed" : "pointer"
                        }}
                      >
                        {isSaving ? (
                          <>
                            <RefreshCw className="animate-spin" size={16} />
                            Applying configurations...
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Save System Config
                          </>
                        )}
                      </motion.button>
                    </div>
                  </form>

                  {/* Change Admin Password Card */}
                  <div className="neo-card p-6 mt-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                        <ShieldAlert className="text-red-400" size={20} />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">Change Admin Password</h3>
                        <p className="text-white/30 text-xs">Update your personal administrator account credentials</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Current Password</label>
                          <input
                            type="password"
                            required
                            value={adminCurrentPassword}
                            onChange={(e) => setAdminCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          />
                        </div>

                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">New Password</label>
                          <input
                            type="password"
                            required
                            value={adminNewPassword}
                            onChange={(e) => setAdminNewPassword(e.target.value)}
                            placeholder="Min 4 characters"
                            className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleChangeAdminPassword}
                          disabled={isChangingPassword}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white/80 hover:text-white border border-white/10 hover:bg-white/5 transition-all flex items-center gap-1.5"
                          style={{ background: "rgba(255,255,255,0.03)" }}
                        >
                          {isChangingPassword ? "Updating..." : "Update Admin Password"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Stats & Setup Instructions */}
                <div className="space-y-6">
                  {/* System Status Info Card */}
                  <div className="neo-card p-6">
                    <h3 className="text-white font-bold text-lg mb-5 flex items-center gap-2">
                      <Wifi size={18} className="text-emerald-400" />
                      Infrastructure Health
                    </h3>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2.5 border-b border-white/[0.04]">
                        <span className="text-white/40 text-xs font-semibold">Database Engine</span>
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                          <CheckCircle size={12} />
                          PostgreSQL (Active)
                        </div>
                      </div>

                      <div className="flex justify-between items-center py-2.5 border-b border-white/[0.04]">
                        <span className="text-white/40 text-xs font-semibold">FastAPI Gateway</span>
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                          <CheckCircle size={12} />
                          Healthy (v1.0.0)
                        </div>
                      </div>

                      <div className="flex justify-between items-center py-2.5 border-b border-white/[0.04]">
                        <span className="text-white/40 text-xs font-semibold">Standard Shift window</span>
                        <span className="text-white text-xs font-bold">09:00 AM - 05:00 PM</span>
                      </div>

                      <div className="flex justify-between items-center py-2.5">
                        <span className="text-white/40 text-xs font-semibold">Token Algorithm</span>
                        <span className="text-white/60 text-xs font-mono font-semibold">JWT (HS256)</span>
                      </div>
                    </div>
                  </div>

                  {/* ESP32 Setup Guide */}
                  <div className="neo-card p-6">
                    <h3 className="text-white font-bold text-lg mb-5 flex items-center gap-2">
                      <Cpu size={18} className="text-cyan-400" />
                      ESP32 Biometric Device Setup
                    </h3>

                    <div className="space-y-4 text-white/50 text-xs font-medium leading-relaxed">
                      <div className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>
                        <p>Configure the physical ESP32 controller with client Wi-Fi networks and the checkin HTTP endpoints.</p>
                      </div>

                      <div className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>
                        <p>Add the <strong>x-device-key</strong> header shown in the security token config into the board&apos;s HTTP connection request parameters.</p>
                      </div>

                      <div className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>
                        <p>To register new employees, use the <strong>Employees list</strong> and click on fingerprint settings to register a card or finger index.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
