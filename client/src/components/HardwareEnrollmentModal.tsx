"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint,
  Radio,
  Cpu,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Building2,
  Briefcase,
  DollarSign,
  Phone,
  Mail,
  Lock,
  ShieldCheck,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { deviceApi } from "@/services/api";
import { useToast } from "@/components/ToastProvider";

interface HardwareEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DEPARTMENTS = [
  "Engineering",
  "HR",
  "Finance",
  "Operations",
  "Design",
  "Marketing",
  "Quality Assurance",
];

export default function HardwareEnrollmentModal({
  isOpen,
  onClose,
  onSuccess,
}: HardwareEnrollmentModalProps) {
  const { success, error: toastError } = useToast();

  // Step 1: Identity, Step 2: Fingerprint, Step 3: RFID, Step 4: Company Profile
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Core Hardware Fields (from ESP32 / Initial)
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [fingerprintId, setFingerprintId] = useState<number | null>(null);
  const [rfidUid, setRfidUid] = useState<string>("");

  // Editable Company Fields
  const [department, setDepartment] = useState("Engineering");
  const [designation, setDesignation] = useState("Software Engineer");
  const [salary, setSalary] = useState("65000");
  const [phone, setPhone] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123");
  const [role, setRole] = useState("employee");

  // Live Hardware Session Tracking
  const [sessionStatus, setSessionStatus] = useState<string>("idle");
  const [lcdLine1, setLcdLine1] = useState("Employee System");
  const [lcdLine2, setLcdLine2] = useState("Ready");
  const [hardwareMessage, setHardwareMessage] = useState("Hardware ready");
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // WebSocket Live Remote Tracking
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isHardwareOnline, setIsHardwareOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Polling ref
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Connect WebSocket when modal is open
  useEffect(() => {
    if (!isOpen) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsWsConnected(false);
      return;
    }

    // Auto-fetch next available slot on physical sensor
    deviceApi.getNextSlot().then((info: any) => {
      if (info?.next_slot) {
        setFingerprintId((prev) => prev || info.next_slot);
      }
    }).catch(() => {});

    try {
      let wsUrl = process.env.NEXT_PUBLIC_WS_URL;
      if (!wsUrl) {
        if (process.env.NEXT_PUBLIC_API_URL) {
          const apiBase = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws");
          wsUrl = `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
        } else {
          const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
          const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
          wsUrl = `${protocol}//${host}:8000/ws/client`;
        }
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "system_status") {
            setIsWsConnected(true);
            setIsHardwareOnline(data.hardware_online || false);
            if (data.enrollment_state?.fingerprint_id) {
              setFingerprintId(data.enrollment_state.fingerprint_id);
            }
          } else if (data.event === "device_online") {
            setIsHardwareOnline(true);
          } else if (data.event === "device_offline") {
            setIsHardwareOnline(false);
          } else if (data.event === "enrollment_step" || data.event === "enrollment_update") {
            const state = data.state || data.data || data;
            if (state.lcd_line1) setLcdLine1(state.lcd_line1);
            if (state.lcd_line2) setLcdLine2(state.lcd_line2);
            if (state.message) setHardwareMessage(state.message);
            if (state.fingerprint_id) setFingerprintId(state.fingerprint_id);
            if (state.rfid_uid) setRfidUid(state.rfid_uid);

            const currentStatus = state.status || data.step;
            if (currentStatus) {
              setSessionStatus(currentStatus);
              if (currentStatus === "finger_enrolled" || currentStatus === "waiting_rfid") {
                setStep(3);
              } else if (currentStatus === "rfid_captured" || currentStatus === "completed") {
                setStep(4);
              }
            }
          }
        } catch (err) {
          console.error("WS message parse error:", err);
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
      };

      ws.onerror = () => {
        setIsWsConnected(false);
      };
    } catch (e) {
      console.warn("WebSocket init error:", e);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen]);

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmployeeCode(`EMP${Math.floor(100 + Math.random() * 900)}`);
      setEmployeeName("");
      setFingerprintId(4); // Default next slot
      setRfidUid("");
      setDepartment("Engineering");
      setDesignation("Software Engineer");
      setSalary("65000");
      setPhone("+91 ");
      setEmail("");
      setPassword("password123");
      setRole("employee");
      setSessionStatus("idle");
      setLcdLine1("Employee System");
      setLcdLine2("Ready");
      setHardwareMessage("Ready to connect with ESP32 Tronix");
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen]);

  // Auto-generate email when name changes
  useEffect(() => {
    if (employeeName.trim()) {
      const cleanName = employeeName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      setEmail(`${cleanName}@smartattend.io`);
    }
  }, [employeeName]);

  // ─── Polling Hardware Status ────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const res = await deviceApi.getEnrollmentStatus();
      if (!res) return;

      setSessionStatus(res.status || "idle");
      if (res.lcd_line1) setLcdLine1(res.lcd_line1);
      if (res.lcd_line2) setLcdLine2(res.lcd_line2);
      if (res.message) setHardwareMessage(res.message);
      if (res.fingerprint_id) setFingerprintId(res.fingerprint_id);
      if (res.rfid_uid) setRfidUid(res.rfid_uid);

      // Transition steps based on ESP32 progress
      if (
        res.status === "finger_enrolled" ||
        res.status === "waiting_rfid"
      ) {
        setStep(3);
      } else if (
        res.status === "rfid_captured" ||
        res.status === "completed"
      ) {
        setStep(4);
      }
    } catch (e) {
      console.warn("Poll error", e);
    }
  }, []);

  useEffect(() => {
    if (isOpen && (step === 2 || step === 3)) {
      pollTimerRef.current = setInterval(checkStatus, 900);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, step, checkStatus]);

  // ─── Step 1: Send Identity to ESP32 ─────────────────────────────────────────
  const handleInitiateHardware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeCode.trim() || !employeeName.trim()) {
      toastError("Please provide both Employee ID and Employee Name.");
      return;
    }

    const slotNum = fingerprintId ? Number(fingerprintId) : 1;

    setIsTransmitting(true);
    try {
      // Send instantaneous command via WebSocket if open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: "start_enroll",
          employee_code: employeeCode.trim(),
          name: employeeName.trim(),
          fingerprint_id: slotNum,
        }));
      }

      const res = await deviceApi.startEnrollment({
        employee_code: employeeCode.trim(),
        name: employeeName.trim(),
        fingerprint_id: slotNum,
      });
      setFingerprintId(res.fingerprint_id || slotNum);
      setLcdLine1(res.lcd_line1 || "Register Emp");
      setLcdLine2(res.lcd_line2 || employeeName.slice(0, 16));
      setHardwareMessage(res.message || "Awaiting fingerprint scan on sensor");
      setStep(2);
      success(`Handshake started! Assigned slot #${res.fingerprint_id || slotNum} to ${employeeName}.`);
    } catch (err: any) {
      toastError(err.response?.data?.detail || "Could not connect to ESP32 backend.");
    } finally {
      setIsTransmitting(false);
    }
  };

  // ─── Step 2 Helper: Advance if testing without physical finger sensor ────────
  const handleSimulateFingerprint = () => {
    const assignedId = fingerprintId || Math.floor(1 + Math.random() * 120);
    setFingerprintId(assignedId);
    setLcdLine1("Finger Saved");
    setLcdLine2(`ID: ${assignedId}`);
    setHardwareMessage(`Fingerprint enrolled successfully into slot #${assignedId}!`);
    success(`Fingerprint confirmed on slot #${assignedId}!`);
    setStep(3);
  };

  // ─── Step 3: Handle RFID or Skip ────────────────────────────────────────────
  const handleSimulateRfid = () => {
    const fakeRfid = "E2 4B 89 1A";
    setRfidUid(fakeRfid);
    setLcdLine1("RFID Saved");
    setLcdLine2("Reg Complete");
    setHardwareMessage(`RFID Card ${fakeRfid} linked!`);
    success("RFID card captured successfully!");
    setStep(4);
  };

  const handleSkipRfid = () => {
    setRfidUid("");
    setLcdLine1("No RFID");
    setLcdLine2("Finger Only");
    setHardwareMessage("Proceeding with fingerprint authentication only.");
    setStep(4);
  };

  // ─── Step 4: Finalize & Save Employee to Database ───────────────────────────
  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFinalizing(true);
    try {
      await deviceApi.finalizeEnrollment({
        employee_code: employeeCode,
        name: employeeName,
        email,
        phone,
        department,
        designation,
        salary: parseFloat(salary) || 30000,
        fingerprint_id: fingerprintId,
        rfid_uid: rfidUid || null,
        role,
        password,
      });

      success(`Employee ${employeeName} registered successfully into the system!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toastError(err.response?.data?.detail || "Failed to finalize employee registration.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCancel = async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel_enroll" }));
      }
      await deviceApi.cancelEnrollment();
    } catch (e) {
      // ignore
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{
          background: "rgba(3, 7, 18, 0.85)",
          backdropFilter: "blur(20px)",
        }}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-2xl rounded-3xl overflow-hidden border my-8"
          style={{
            background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)",
            borderColor: "rgba(0, 245, 255, 0.25)",
            boxShadow: "0 0 80px rgba(0, 245, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-5 flex items-center justify-between border-b"
            style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 245, 255, 0.2), rgba(124, 58, 237, 0.2))",
                  border: "1px solid rgba(0, 245, 255, 0.4)",
                  boxShadow: "0 0 20px rgba(0, 245, 255, 0.2)",
                }}
              >
                <Cpu size={20} className="text-cyan-400" />
              </div>
              <div>
                <h3 className="text-white font-black text-lg flex items-center gap-2">
                  ESP32 Hardware Registration Wizard
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
                    Tronix Protocol
                  </span>
                </h3>
                <p className="text-white/40 text-xs flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isWsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                  <span>{isWsConnected ? "⚡ WebSocket Real-Time Active (Remote / Any Wi-Fi)" : "📡 REST Polling Fallback"}</span>
                  {isHardwareOnline && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                      ESP32 ONLINE
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stepper Wizard Bar */}
          <div
            className="px-6 py-3 bg-white/[0.02] border-b flex items-center justify-between text-xs font-semibold"
            style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
          >
            {[
              { num: 1, label: "Identity" },
              { num: 2, label: "Fingerprint" },
              { num: 3, label: "RFID Card" },
              { num: 4, label: "Company Profile" },
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] transition-all ${
                    step >= s.num
                      ? "bg-cyan-400 text-black shadow-lg shadow-cyan-400/20"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span className={step >= s.num ? "text-white" : "text-white/30"}>
                  {s.label}
                </span>
                {idx < 3 && <div className="w-8 h-[1px] bg-white/10 hidden sm:block" />}
              </div>
            ))}
          </div>

          {/* Virtual 16x2 I2C LCD Display (Hardware Twin) */}
          <div className="px-6 pt-5">
            <div
              className="p-3.5 rounded-2xl border font-mono text-xs relative overflow-hidden"
              style={{
                background: "rgba(6, 78, 59, 0.35)",
                borderColor: "rgba(52, 211, 153, 0.4)",
                boxShadow: "inset 0 0 20px rgba(16, 185, 129, 0.2)",
              }}
            >
              <div className="flex items-center justify-between text-[10px] text-emerald-400/70 mb-1.5 uppercase tracking-widest">
                <span>ESP32 16x2 LCD Telemetry</span>
                <span>I2C Address: 0x27</span>
              </div>
              <div className="bg-black/60 p-2.5 rounded-xl border border-emerald-500/20 space-y-1">
                <div className="text-emerald-400 font-bold tracking-wider flex items-center justify-between">
                  <span>&gt; {lcdLine1}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div className="text-emerald-300 tracking-wider">
                  <span>&gt; {lcdLine2}</span>
                </div>
              </div>
              <p className="text-emerald-400/60 text-[11px] mt-2 italic flex items-center gap-1.5">
                <Cpu size={12} /> {hardwareMessage}
              </p>
            </div>
          </div>

          {/* Modal Body: Steps */}
          <div className="p-6">
            {/* STEP 1: Identification */}
            {step === 1 && (
              <form onSubmit={handleInitiateHardware} className="space-y-4">
                <div className="p-4 rounded-2xl bg-cyan-400/5 border border-cyan-400/20 text-xs text-white/70">
                  <p className="font-semibold text-cyan-300 mb-1">
                    Synchronized Serial Initialization
                  </p>
                  <p>
                    Enter the Employee ID and Name below. The software will transmit these directly
                    to the ESP32 board, display them on the 16x2 LCD, and allocate an empty
                    fingerprint storage slot in the optical sensor.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-white/60 text-xs font-semibold mb-1 block">
                      Employee ID / Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP001"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs font-semibold mb-1 block">
                      Employee Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="e.g. Bhavesh Burad"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs font-semibold mb-1 flex items-center justify-between">
                      <span>Fingerprint Slot # *</span>
                      <span className="text-[10px] text-cyan-400 font-mono">1 - 127</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={127}
                      value={fingerprintId || ""}
                      onChange={(e) => setFingerprintId(e.target.value ? Number(e.target.value) : null)}
                      placeholder="e.g. 4"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isTransmitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-black shadow-lg transition-transform hover:scale-105"
                    style={{
                      background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
                    }}
                  >
                    {isTransmitting ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                    Transmit to ESP32 Hardware
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Fingerprint Enrollment */}
            {step === 2 && (
              <div className="space-y-6 text-center">
                <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                  {/* Glowing rings */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/40"
                  />
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: "rgba(0, 245, 255, 0.1)",
                      border: "1px solid rgba(0, 245, 255, 0.3)",
                      boxShadow: "0 0 30px rgba(0, 245, 255, 0.2)",
                    }}
                  >
                    <Fingerprint size={42} className="text-cyan-400" />
                    {/* Laser scan line */}
                    <motion.div
                      animate={{ y: [-30, 30, -30] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-0 right-0 h-0.5 bg-cyan-300 shadow-lg shadow-cyan-400"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-bold text-base mb-1">
                    Place Finger on R307S Sensor
                  </h4>
                  <p className="text-white/50 text-xs max-w-md mx-auto leading-relaxed">
                    Assigned Sensor Slot:{" "}
                    <span className="text-cyan-400 font-mono font-bold">
                      #{fingerprintId || "Allocating..."}
                    </span>
                    . Follow the physical LED &amp; 16x2 LCD prompts: Scan 1 $\rightarrow$ Remove Finger $\rightarrow$ Scan 2 to build the template.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-[11px] font-mono">
                  <div
                    className={`p-2 rounded-xl border ${
                      sessionStatus.includes("scan_1") || step > 2
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 text-white/40"
                    }`}
                  >
                    1. Scan 1
                  </div>
                  <div
                    className={`p-2 rounded-xl border ${
                      sessionStatus.includes("remove") || step > 2
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 text-white/40"
                    }`}
                  >
                    2. Lift Finger
                  </div>
                  <div
                    className={`p-2 rounded-xl border ${
                      sessionStatus.includes("enrolled") || step > 2
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 text-white/40"
                    }`}
                  >
                    3. Scan 2 &amp; Save
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white"
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSimulateFingerprint}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 border border-cyan-400/30 bg-cyan-400/10 transition-colors"
                      title="Confirm fingerprint manually if sensor finished or for desktop testing"
                    >
                      ✓ Confirm Fingerprint Scan
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: RFID Card Tap */}
            {step === 3 && (
              <div className="space-y-6 text-center">
                <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border border-violet-500/30"
                  />
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "rgba(124, 58, 237, 0.12)",
                      border: "1px solid rgba(124, 58, 237, 0.35)",
                      boxShadow: "0 0 30px rgba(124, 58, 237, 0.2)",
                    }}
                  >
                    <Radio size={36} className="text-violet-400" />
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-bold text-base mb-1">
                    Tap RFID Card on RC522 Sensor
                  </h4>
                  <p className="text-white/50 text-xs max-w-md mx-auto leading-relaxed">
                    Optionally assign an RFID keyfob or smart card to this employee for dual-factor
                    punching. You may also skip if only fingerprint is needed.
                  </p>
                  {rfidUid && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 font-mono text-xs">
                      <CheckCircle2 size={13} />
                      Scanned UID: {rfidUid}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white"
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSkipRfid}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white/50 hover:text-white border border-white/10"
                    >
                      Skip RFID (Finger Only)
                    </button>
                    <button
                      type="button"
                      onClick={handleSimulateRfid}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg"
                    >
                      ✓ Card Detected / Confirm RFID
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Complete & Editable Company Details */}
            {step === 4 && (
              <form onSubmit={handleFinalize} className="space-y-4">
                {/* 4 Main Core Hardware Fields Summary Pill */}
                <div
                  className="p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
                  style={{
                    background: "rgba(0, 245, 255, 0.04)",
                    borderColor: "rgba(0, 245, 255, 0.2)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-cyan-400" />
                    <span className="text-white font-bold">4 Hardware Fields Locked:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/80">
                      ID: {employeeCode}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/80">
                      Name: {employeeName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-400/10 border border-cyan-400/30 text-cyan-300">
                      FP #{fingerprintId}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-violet-400/10 border border-violet-400/30 text-violet-300">
                      RFID: {rfidUid || "None"}
                    </span>
                  </div>
                </div>

                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                  Fill Editable Company Profile:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-white/60 mb-1 block">Department</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d} className="bg-[#0a0f1e]">
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-white/60 mb-1 block">Designation</label>
                    <input
                      type="text"
                      required
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Lead Engineer"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-white/60 mb-1 block">Monthly Basic Salary (₹ / $)</label>
                    <input
                      type="number"
                      required
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder="60000"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-white/60 mb-1 block">Phone Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-white/60 mb-1 block">Official Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-white/60 mb-1 block">Account Password</label>
                    <input
                      type="text"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isFinalizing}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-black shadow-lg transition-transform hover:scale-105"
                    style={{
                      background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
                    }}
                  >
                    {isFinalizing ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Complete Registration &amp; Save Employee
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
