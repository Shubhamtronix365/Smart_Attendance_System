"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Fingerprint, Mail, Lock, Loader2, AlertCircle } from "lucide-react";

// Inline OAuth provider icons
const GoogleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GithubIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";

// ─── Animation Variants ────────────────────────────────────────────────────────
const cardVariants = {
  hidden: { y: 60, opacity: 0, scale: 0.97 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 90, damping: 18, delay: 0.2 },
  },
};

const inputVariants = {
  unfocused: { boxShadow: "0 0 0px rgba(0,245,255,0)" },
  focused: { boxShadow: "0 0 20px rgba(0,245,255,0.2), 0 0 0 1px rgba(0,245,255,0.4)" },
};

// ─── Toast Component ───────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl"
      style={{
        background: "rgba(239, 68, 68, 0.15)",
        border: "1px solid rgba(239, 68, 68, 0.4)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 24px rgba(239, 68, 68, 0.2)",
      }}
    >
      <AlertCircle size={18} className="text-red-400 shrink-0" />
      <span className="text-red-300 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-red-400/60 hover:text-red-400 ml-2 transition-colors">✕</button>
    </motion.div>
  );
}

// ─── Animated Branding (Left Panel) ───────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center w-[45%] relative overflow-hidden px-12">
      {/* Background glow blobs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,245,255,0.12) 0%, transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-1/3 left-1/3 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)", filter: "blur(40px)" }} />

      {/* Animated fingerprint icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 80, damping: 15, delay: 0.1 }}
        className="mb-8 relative"
      >
        {/* Outer ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-[-24px] rounded-full"
          style={{ border: "1px dashed rgba(0,245,255,0.3)" }}
        />
        {/* Inner ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-[-12px] rounded-full"
          style={{ border: "1px dashed rgba(124,58,237,0.3)" }}
        />
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center relative"
          style={{
            background: "linear-gradient(135deg, rgba(0,245,255,0.15), rgba(124,58,237,0.15))",
            border: "1px solid rgba(0,245,255,0.3)",
            boxShadow: "0 0 40px rgba(0,245,255,0.2), 0 0 80px rgba(124,58,237,0.15)",
          }}
        >
          <Fingerprint size={48} className="text-cyan-400" />
          {/* Pulse dot */}
          <motion.span
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-400"
            style={{ boxShadow: "0 0 8px #22c55e" }}
          />
        </div>
      </motion.div>

      {/* Brand text */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="text-center"
      >
        <h1 className="text-4xl font-black mb-3"
          style={{
            background: "linear-gradient(135deg, #00f5ff 0%, #7c3aed 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SmartAttend
        </h1>
        <p className="text-white/50 text-lg font-light leading-relaxed">
          Biometric attendance management<br />for the modern workforce.
        </p>
      </motion.div>

      {/* Feature pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-10 flex flex-col gap-3 w-full max-w-xs"
      >
        {[
          { icon: "🔐", text: "Fingerprint Authentication" },
          { icon: "📡", text: "Real-time ESP32 Tracking" },
          { icon: "💰", text: "Auto Payroll Computation" },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.1, type: "spring", stiffness: 100 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-white/60 text-sm">{item.text}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom grid decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(0,245,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  );
}

// ─── OAuth2 Button ─────────────────────────────────────────────────────────────
function OAuthButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, borderColor: "rgba(0,245,255,0.4)" }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-medium text-white/70 transition-colors"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const user = await login(email, password, rememberMe);
      const role = user.role;
      // Store token in cookie (httpOnly set by server) / localStorage as fallback
      if (typeof window !== "undefined") {
        localStorage.setItem("role", role);
      }
      // Redirect based on role
      if (role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/employee/dashboard");
      }
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? err.response?.data?.detail || "Invalid credentials. Please try again."
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [email, password, rememberMe, router, login]);

  const handleOAuth = useCallback((provider: string) => {
    window.location.href = `/api/auth/oauth/${provider}`;
  }, []);

  return (
    <div className="min-h-screen flex" style={{ background: "#0a0f1e" }}>
      {/* Error toast */}
      <AnimatePresence>
        {error && <Toast message={error} onClose={() => setError(null)} />}
      </AnimatePresence>

      {/* Left branding panel */}
      <BrandPanel />

      {/* Right — login form */}
      <div className="flex-1 lg:w-[55%] flex items-center justify-center px-6 py-12 relative">
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)", filter: "blur(60px)" }} />

        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md relative"
        >
          {/* Card */}
          <div className="rounded-3xl p-8 lg:p-10"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-6 lg:hidden">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(0,245,255,0.2), rgba(124,58,237,0.2))", border: "1px solid rgba(0,245,255,0.3)" }}>
                  <Fingerprint size={22} className="text-cyan-400" />
                </div>
                <span className="text-white font-bold text-lg">SmartAttend</span>
              </div>
              <h2 className="text-2xl font-black text-white mb-1">Welcome back</h2>
              <p className="text-white/40 text-sm">Sign in to your account to continue</p>
            </div>

            {/* OAuth2 Buttons */}
            <div className="flex gap-3 mb-6">
              <OAuthButton
                icon={<GoogleIcon />}
                label="Google"
                onClick={() => handleOAuth("google")}
              />
              <OAuthButton
                icon={<GithubIcon />}
                label="GitHub"
                onClick={() => handleOAuth("github")}
              />
            </div>

            {/* Divider */}
            <div className="relative flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-white/30 text-xs">or sign in with email</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {/* Email */}
              <div>
                <label className="text-white/50 text-xs font-medium mb-2 block">Email Address</label>
                <motion.div
                  animate={focusedField === "email" ? "focused" : "unfocused"}
                  variants={inputVariants}
                  className="relative rounded-xl overflow-hidden"
                >
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                    style={{ color: focusedField === "email" ? "#00f5ff" : undefined }}
                  />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3.5 text-white text-sm outline-none rounded-xl transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${focusedField === "email" ? "rgba(0,245,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  />
                </motion.div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/50 text-xs font-medium">Password</label>
                  <a href="/auth/forgot-password" className="text-cyan-400/70 text-xs hover:text-cyan-400 transition-colors">
                    Forgot password?
                  </a>
                </div>
                <motion.div
                  animate={focusedField === "password" ? "focused" : "unfocused"}
                  variants={inputVariants}
                  className="relative rounded-xl"
                >
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2"
                    style={{ color: focusedField === "password" ? "#00f5ff" : "rgba(255,255,255,0.3)" }}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-12 py-3.5 text-white text-sm outline-none rounded-xl transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${focusedField === "password" ? "rgba(0,245,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </motion.div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-3">
                <button
                  id="remember-me"
                  type="button"
                  onClick={() => setRememberMe((r) => !r)}
                  className="w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0"
                  style={{
                    background: rememberMe ? "linear-gradient(135deg, #00f5ff, #7c3aed)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${rememberMe ? "#00f5ff" : "rgba(255,255,255,0.15)"}`,
                    boxShadow: rememberMe ? "0 0 12px rgba(0,245,255,0.3)" : "none",
                  }}
                >
                  {rememberMe && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="text-white/50 text-sm select-none cursor-pointer" onClick={() => setRememberMe((r) => !r)}>
                  Remember me for 30 days
                </span>
              </div>

              {/* Submit */}
              <motion.button
                id="login-submit"
                type="submit"
                disabled={isLoading}
                whileHover={!isLoading ? { scale: 1.02 } : {}}
                whileTap={!isLoading ? { scale: 0.98 } : {}}
                animate={!isLoading ? {
                  boxShadow: [
                    "0 0 20px rgba(0,245,255,0.3)",
                    "0 0 40px rgba(0,245,255,0.6)",
                    "0 0 20px rgba(0,245,255,0.3)",
                  ],
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-full py-4 rounded-2xl font-bold text-black text-sm mt-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #00f5ff 0%, #7c3aed 100%)",
                }}
              >
                {isLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 size={16} />
                    </motion.div>
                    Signing in...
                  </>
                ) : (
                  <>
                    <Fingerprint size={16} />
                    Sign In
                  </>
                )}
              </motion.button>
            </form>

            {/* Footer */}
            <p className="text-center text-white/30 text-xs mt-6">
              Don&apos;t have an account?{" "}
              <a href="/auth/register" className="text-cyan-400/80 hover:text-cyan-400 transition-colors font-medium">
                Contact your admin
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
