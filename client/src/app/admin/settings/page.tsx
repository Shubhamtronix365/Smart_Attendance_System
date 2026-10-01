"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Clock, Key, ShieldAlert, Save, RefreshCw,
  Info, CheckCircle, Database, Cpu, Wifi, Copy, Check, Terminal
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
  const [deviceId, setDeviceId] = useState("ESP32_TRONIX_01");
  const [deviceApiKey, setDeviceApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Admin credentials states
  const [adminEmail, setAdminEmail] = useState("");
  const [adminNewEmail, setAdminNewEmail] = useState("");
  const [adminCurrentPassword, setAdminCurrentPassword] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [isChangingCredentials, setIsChangingCredentials] = useState(false);

  // Load active configurations from API
  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true);
        const [settingsData, meData] = await Promise.all([
          settingsApi.get(),
          authApi.me().then(r => r.data).catch(() => null)
        ]);
        setStandardWorkHours(settingsData.standard_work_hours);
        setLateThresholdMinutes(settingsData.late_threshold_minutes);
        setOtMultiplier(settingsData.ot_multiplier);
        setDeviceApiKey(settingsData.device_api_key);
        if (settingsData.device_id) setDeviceId(settingsData.device_id);
        if (meData?.email) {
          setAdminEmail(meData.email);
          setAdminNewEmail(meData.email);
        }
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
        device_id: deviceId,
      });
      setStandardWorkHours(updated.standard_work_hours);
      setLateThresholdMinutes(updated.late_threshold_minutes);
      setOtMultiplier(updated.ot_multiplier);
      setDeviceApiKey(updated.device_api_key);
      if (updated.device_id) setDeviceId(updated.device_id);
      success("System configurations & device credentials updated successfully.");
    } catch (err) {
      console.error("Failed to update settings:", err);
      error("Failed to save configuration updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    success(`Copied ${field} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateRandomDeviceId = () => {
    const prefixes = ["ESP32_TRONIX", "ESP32_MAIN", "ESP32_GATE", "ESP32_SITE"];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = String(Math.floor(1 + Math.random() * 99)).padStart(2, "0");
    const newId = `${p}_${num}`;
    setDeviceId(newId);
    success(`Generated new Device ID: ${newId}`);
  };

  const generateRandomKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let key = "sk_esp32_";
    for (let i = 0; i < 20; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setDeviceApiKey(key);
    success("Generated new Device API Key. Click 'Save' to apply.");
  };

  const generateFreshPair = () => {
    generateRandomDeviceId();
    generateRandomKey();
    success("Generated fresh Device ID & Security Key pair! Remember to Save.");
  };

  const handleChangeAdminCredentials = async () => {
    if (!adminCurrentPassword) {
      error("Please enter your current password to verify your identity.");
      return;
    }
    const hasEmailChange = adminNewEmail && adminNewEmail.trim().toLowerCase() !== adminEmail.trim().toLowerCase();
    const hasPasswordChange = Boolean(adminNewPassword && adminNewPassword.trim().length >= 4);

    if (!hasEmailChange && !hasPasswordChange) {
      error("Please specify a new email or a new password (min 4 chars) to update.");
      return;
    }

    try {
      setIsChangingCredentials(true);
      const res = await authApi.updateCredentials({
        current_password: adminCurrentPassword,
        new_email: hasEmailChange ? adminNewEmail.trim() : undefined,
        new_password: hasPasswordChange ? adminNewPassword.trim() : undefined,
      });

      if (res.data?.token) {
        localStorage.setItem("access_token", res.data.token);
      }
      if (res.data?.email) {
        setAdminEmail(res.data.email);
        setAdminNewEmail(res.data.email);
      }
      success("Admin credentials updated successfully!");
      setAdminCurrentPassword("");
      setAdminNewPassword("");
    } catch (err: any) {
      console.error(err);
      error(err.response?.data?.detail || "Failed to update admin credentials.");
    } finally {
      setIsChangingCredentials(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <AdminSidebar />
      <AdminTopBar title="Settings" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
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

                    {/* ESP32 Hardware & IoT Gateway Terminal Card */}
                    <div className="neo-card p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.05]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(124, 58, 237, 0.15)", border: "1px solid rgba(124, 58, 237, 0.3)" }}>
                            <Cpu className="text-violet-400" size={20} />
                          </div>
                          <div>
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                              Biometric Hardware & IoT Gateway
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                WSS Live
                              </span>
                            </h3>
                            <p className="text-white/40 text-xs">Configure the identity & security credentials for physical attendance terminals</p>
                          </div>
                        </div>

                        {/* Quick 1-Click Reset Both Button */}
                        <button
                          type="button"
                          onClick={generateFreshPair}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all self-start sm:self-auto"
                        >
                          <RefreshCw size={13} />
                          Regenerate Pair (ID + Key)
                        </button>
                      </div>

                      <div className="space-y-6">
                        {/* Two Column Grid: Device ID and API Access Key */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* 1. Device Identifier */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-white/60 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                <Terminal size={12} className="text-cyan-400" />
                                Hardware Device ID
                              </label>
                              <button
                                type="button"
                                onClick={generateRandomDeviceId}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                              >
                                + New ID
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                required
                                value={deviceId}
                                onChange={(e) => setDeviceId(e.target.value)}
                                placeholder="e.g. ESP32_TRONIX_01"
                                className="flex-1 px-4 py-3 text-white text-sm outline-none rounded-xl font-mono font-medium"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                              />
                              <button
                                type="button"
                                onClick={() => handleCopy(deviceId, "Device ID")}
                                className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl text-xs font-semibold text-white/70 hover:text-white border border-white/10 hover:bg-white/5 transition-all"
                                title="Copy Device ID"
                              >
                                {copiedField === "Device ID" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                <span className="hidden sm:inline">Copy</span>
                              </button>
                            </div>
                            <p className="text-white/30 text-[11px]">Unique identifier for this terminal (e.g. Main Gate, Office Floor 2).</p>
                          </div>

                          {/* 2. Device Access Token */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-white/60 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                <Key size={12} className="text-violet-400" />
                                Device Access Secret Key
                              </label>
                              <button
                                type="button"
                                onClick={generateRandomKey}
                                className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                              >
                                Rotate Key
                              </button>
                            </div>
                            <div className="flex gap-2">
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
                                className="px-3 py-3 rounded-xl text-xs font-semibold text-white/50 hover:text-white border border-white/10 hover:bg-white/5 transition-all"
                              >
                                {showApiKey ? "Hide" : "Show"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(deviceApiKey, "Security Key")}
                                className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl text-xs font-semibold text-white/70 hover:text-white border border-white/10 hover:bg-white/5 transition-all"
                                title="Copy Security Key"
                              >
                                {copiedField === "Security Key" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                <span className="hidden sm:inline">Copy</span>
                              </button>
                            </div>
                            <p className="text-white/30 text-[11px]">Encrypted authentication bearer key for WebSocket & REST punches.</p>
                          </div>
                        </div>

                        {/* Arduino C++ Firmware Copy Snippet Card */}
                        <div className="p-4 rounded-2xl bg-black/40 border border-cyan-500/20 relative group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-cyan-400 text-xs font-mono font-semibold">Arduino IDE Firmware Configuration</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const snippet = `// Paste into firmware/attendace_device_tronix_ws.ino (lines 19-22):
const char* WS_HOST = "smart-attendance-backend-tzp4.onrender.com";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/device?device_id=${deviceId || "ESP32_TRONIX_01"}&api_key=${deviceApiKey || "esp32_device_secret_key"}";
const bool  USE_SSL = true;`;
                                handleCopy(snippet, "Arduino Code");
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all"
                            >
                              {copiedField === "Arduino Code" ? (
                                <>
                                  <Check size={13} className="text-emerald-400" />
                                  <span>Copied Code!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span>Copy Arduino Code</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="text-xs font-mono text-white/80 p-3 rounded-xl bg-black/50 overflow-x-auto select-all leading-relaxed">
{`const char* WS_HOST = "smart-attendance-backend-tzp4.onrender.com";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/device?device_id=${deviceId || "ESP32_TRONIX_01"}&api_key=${deviceApiKey || "esp32_device_secret_key"}";
const bool  USE_SSL = true;`}
                          </pre>
                          <p className="text-white/30 text-[11px] mt-2">
                            💡 Copy and paste these lines into <span className="text-white/60 font-mono">attendace_device_tronix_ws.ino</span> (lines 19–22) in Arduino IDE.
                          </p>
                        </div>

                        {/* Connection Endpoints Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider block mb-1">Cloud WebSocket Endpoint (WSS)</span>
                            <span className="text-cyan-400 text-xs font-mono select-all block">wss://smart-attendance-backend-tzp4.onrender.com/ws/device</span>
                          </div>
                          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider block mb-1">REST Check-in Fallback Endpoint</span>
                            <span className="text-violet-400 text-xs font-mono select-all block">https://smart-attendance-backend-tzp4.onrender.com/api/device/checkin</span>
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

                  {/* Admin Credentials & Login Management Card */}
                  <div className="neo-card p-6 mt-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0, 245, 255, 0.1)", border: "1px solid rgba(0, 245, 255, 0.25)" }}>
                        <ShieldAlert className="text-cyan-400" size={20} />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">System Administrator Credentials</h3>
                        <p className="text-white/40 text-xs">Update your root login email and secure administrator password</p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 mb-5 flex items-start gap-2">
                      <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-white">System Admin Isolation:</span> As a System Administrator, your account has root administrative access. Changing your email or password updates your portal login credentials immediately without affecting biometric terminals.
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Current email & new email */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">Current Admin Email</label>
                          <input
                            type="email"
                            disabled
                            value={adminEmail || "admin@system.com"}
                            className="w-full px-4 py-3 text-white/50 text-sm outline-none rounded-xl cursor-not-allowed"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                          />
                        </div>

                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">New Admin Email</label>
                          <input
                            type="email"
                            value={adminNewEmail}
                            onChange={(e) => setAdminNewEmail(e.target.value)}
                            placeholder="admin@yourdomain.com"
                            className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          />
                        </div>
                      </div>

                      {/* Current password & new password */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">
                            Current Password <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="password"
                            required
                            value={adminCurrentPassword}
                            onChange={(e) => setAdminCurrentPassword(e.target.value)}
                            placeholder="Required for verification"
                            className="w-full px-4 py-3 text-white text-sm outline-none rounded-xl"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          />
                        </div>

                        <div>
                          <label className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 block">
                            New Password <span className="text-white/30 text-[10px] lowercase">(leave blank to keep current)</span>
                          </label>
                          <input
                            type="password"
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
                          onClick={handleChangeAdminCredentials}
                          disabled={isChangingCredentials}
                          className="px-6 py-2.5 rounded-xl text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:opacity-90 transition-all flex items-center gap-1.5"
                          style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                        >
                          {isChangingCredentials ? "Saving Credentials..." : "Update Admin Email & Password"}
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
