"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useAnimationFrame, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Fingerprint, Activity, DollarSign, Clock, ArrowRight, Play, Shield, Zap } from "lucide-react";

// Dynamically import 3D component (SSR disabled — WebGL requires browser)
const Esp32Model = dynamic(() => import("./Esp32Model"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-16 h-16 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
    </div>
  ),
});

// ─── Animation Variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { x: -60, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 100 },
  },
};

const floatVariants = (delay: number) => ({
  animate: {
    y: [0, -12, 0],
    transition: {
      duration: 3 + delay,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  },
});

const scanRingVariants = {
  initial: { scale: 0, rotate: -180, opacity: 0 },
  animate: {
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 80, damping: 15 },
  },
};

const glowPulse = {
  animate: {
    boxShadow: [
      "0 0 20px rgba(0,245,255,0.3)",
      "0 0 40px rgba(0,245,255,0.7)",
      "0 0 20px rgba(0,245,255,0.3)",
    ],
    transition: { duration: 2, repeat: Infinity },
  },
};

// ─── Typewriter Hook ───────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 60, delay = 800) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, speed, delay]);

  return { displayed, done };
}

// ─── Particle Field (DOM-based) ────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  size: number;
}

function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Init particles
    particles.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
      size: Math.random() * 2 + 0.5,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(124, 58, 237, ${p.opacity})`;
        ctx.fill();
      });
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

// ─── Magnetic Button ───────────────────────────────────────────────────────────
function MagneticButton({
  children,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.35;
    const dy = (e.clientY - cy) * 0.35;
    setPos({ x: dx, y: dy });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPos({ x: 0, y: 0 });
  }, []);

  return (
    <motion.button
      ref={ref}
      style={style}
      animate={{ x: pos.x, y: pos.y, ...glowPulse.animate }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.button>
  );
}

// ─── Floating Data Card ────────────────────────────────────────────────────────
interface DataCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  glowColor: string;
  delay: number;
  position: string;
}

function FloatingDataCard({
  icon,
  label,
  value,
  color,
  glowColor,
  delay,
  position,
}: DataCardProps) {
  return (
    <motion.div
      className={`absolute ${position} z-10`}
      initial={{ opacity: 0, filter: "blur(12px)", scale: 0.8 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ delay, duration: 0.7, ease: "easeOut" }}
    >
      <motion.div
        animate={floatVariants(delay).animate}
        className="relative backdrop-blur-xl rounded-2xl p-4 border"
        style={{
          background: "rgba(10, 15, 30, 0.7)",
          borderColor: `${color}40`,
          boxShadow: `0 0 24px ${glowColor}30, inset 0 1px 0 rgba(255,255,255,0.06)`,
          minWidth: "160px",
        }}
      >
        {/* Glow dot */}
        <div
          className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
        <div className="flex items-center gap-2 mb-1">
          <div style={{ color }}>{icon}</div>
          <span className="text-xs text-white/50 font-medium">{label}</span>
        </div>
        <p className="text-white font-bold text-lg leading-tight" style={{ color }}>
          {value}
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Value Prop Chip ───────────────────────────────────────────────────────────
function PropChip({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="flex items-center gap-3 px-5 py-3 rounded-full border border-white/10 backdrop-blur-md"
      style={{
        background: "rgba(0, 245, 255, 0.05)",
        boxShadow: "0 0 12px rgba(0, 245, 255, 0.08)",
      }}
      whileHover={{
        borderColor: "rgba(0, 245, 255, 0.4)",
        boxShadow: "0 0 24px rgba(0, 245, 255, 0.2)",
        scale: 1.02,
      }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <span className="text-cyan-400">{icon}</span>
      <span className="text-white/80 text-sm font-medium">{text}</span>
    </motion.div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
export default function HeroSection() {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef });
  const rightY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const leftY = useTransform(scrollYProgress, [0, 1], [0, -30]);

  const { displayed: subtitle } = useTypewriter("Powered by Biometrics", 70, 1200);

  const words = ["Smart", "Attendance"];

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: "#0a0f1e" }}
    >
      {/* ── Background layers ── */}
      <ParticleBg />

      {/* Radial glow — cyan left */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0,245,255,0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Radial glow — violet right */}
      <div
        className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,245,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Top Navigation Bar ── */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-12 py-3.5 sm:py-5 max-w-7xl mx-auto border-b border-white/5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3">
          <div
            className="w-9 sm:w-10 h-9 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,245,255,0.2), rgba(124,58,237,0.2))",
              border: "1px solid rgba(0,245,255,0.4)",
            }}
          >
            <Fingerprint size={20} className="text-cyan-400" />
          </div>
          <span className="font-extrabold text-lg sm:text-xl text-white tracking-tight">
            Smart<span className="text-cyan-400">Attend</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => router.push("/employee/dashboard")}
            className="hidden sm:inline-flex px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
          >
            Employee Portal
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/dashboard")}
            className="hidden sm:inline-flex px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 border border-cyan-400/30 hover:border-cyan-400/50 bg-cyan-400/10 transition-colors cursor-pointer"
          >
            Admin Dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs font-bold text-black shadow-lg transition-transform hover:scale-105 cursor-pointer whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
            }}
          >
            Sign In
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-col lg:flex-row items-center gap-8 lg:gap-0 pt-24 sm:pt-32 pb-12 sm:pb-16">

        {/* ── LEFT SIDE (60%) ── */}
        <motion.div
          className="w-full lg:w-[60%] flex flex-col gap-8"
          style={{ y: leftY }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div variants={itemVariants}>
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase"
              style={{
                background: "rgba(0,245,255,0.1)",
                border: "1px solid rgba(0,245,255,0.25)",
                color: "#00f5ff",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              IoT · Biometric · Real-time
            </span>
          </motion.div>

          {/* Headline — word-by-word stagger */}
          <div>
            <div className="flex flex-wrap gap-3 mb-3">
              {words.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: 0.4 + i * 0.18,
                    type: "spring",
                    stiffness: 90,
                    damping: 16,
                  }}
                  className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black leading-tight sm:leading-none tracking-tight"
                  style={{
                    background: "linear-gradient(135deg, #00f5ff 0%, #7c3aed 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </div>

            {/* Typewriter subtitle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="text-xl sm:text-2xl lg:text-3xl font-light text-white/70 tracking-wide h-10"
            >
              {subtitle}
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="inline-block w-0.5 h-6 sm:h-7 bg-cyan-400 ml-1 align-middle"
              />
            </motion.div>
          </div>

          {/* Value-prop chips */}
          <motion.div
            variants={containerVariants}
            className="flex flex-wrap gap-3"
          >
            <PropChip
              icon={<Fingerprint size={16} />}
              text="Fingerprint Authentication"
            />
            <PropChip
              icon={<Activity size={16} />}
              text="Real-time Tracking"
            />
            <PropChip
              icon={<Zap size={16} />}
              text="Auto Payroll"
            />
          </motion.div>

          {/* Description */}
          <motion.p
            variants={itemVariants}
            className="text-white/50 text-lg leading-relaxed max-w-xl"
          >
            Automate workforce management with ESP32-powered fingerprint scanners,
            live attendance dashboards, and intelligent payroll computation — all
            in one unified platform.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-4">
            {/* Primary CTA */}
            <MagneticButton
              onClick={() => router.push("/login")}
              className="group flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-black relative overflow-hidden cursor-pointer shadow-xl transition-all"
              style={{
                background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
              } as React.CSSProperties}
            >
              <Shield size={18} />
              Get Started / Sign In
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-1"
              />
            </MagneticButton>

            {/* Secondary CTA */}
            <motion.button
              type="button"
              onClick={() => router.push("/admin/dashboard")}
              whileHover={{
                borderColor: "rgba(0,245,255,0.6)",
                boxShadow: "0 0 24px rgba(0,245,255,0.15)",
                color: "#00f5ff",
              }}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white/80 border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(0,245,255,0.15)",
                  border: "1px solid rgba(0,245,255,0.3)",
                }}
              >
                <Play size={12} fill="currentColor" className="text-cyan-400 ml-0.5" />
              </div>
              Admin Portal
            </motion.button>
          </motion.div>

          {/* Quick Route Launchers Grid */}
          <motion.div variants={itemVariants} className="pt-2">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
              ⚡ Instant Route Access:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { label: "Sign In", path: "/login", desc: "Access accounts", color: "hover:border-cyan-400/50 hover:bg-cyan-500/10 text-cyan-400" },
                { label: "Admin Dashboard", path: "/admin/dashboard", desc: "Live analytics & metrics", color: "hover:border-violet-400/50 hover:bg-violet-500/10 text-violet-400" },
                { label: "Attendance Logs", path: "/admin/attendance", desc: "Biometric daily registry", color: "hover:border-emerald-400/50 hover:bg-emerald-500/10 text-emerald-400" },
                { label: "Employee List", path: "/admin/employees", desc: "Add staff & fingers", color: "hover:border-amber-400/50 hover:bg-amber-500/10 text-amber-400" },
                { label: "Payroll", path: "/admin/payroll", desc: "Generate payslips & PDF", color: "hover:border-rose-400/50 hover:bg-rose-500/10 text-rose-400" },
                { label: "Employee Portal", path: "/employee/dashboard", desc: "Punch status & leave", color: "hover:border-sky-400/50 hover:bg-sky-500/10 text-sky-400" },
              ].map((btn) => (
                <button
                  key={btn.path}
                  type="button"
                  onClick={() => router.push(btn.path)}
                  className={`flex flex-col text-left p-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md transition-all cursor-pointer ${btn.color}`}
                >
                  <span className="text-white text-xs font-bold">{btn.label}</span>
                  <span className="text-white/40 text-[10px]">{btn.desc}</span>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-8 pt-4 border-t border-white/5"
          >
            {[
              { value: "99.8%", label: "Accuracy" },
              { value: "<500ms", label: "Scan Speed" },
              { value: "10K+", label: "Employees" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p
                  className="text-2xl font-black"
                  style={{
                    background: "linear-gradient(135deg, #00f5ff, #7c3aed)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {value}
                </p>
                <p className="text-white/40 text-xs font-medium">{label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* ── RIGHT SIDE (40%) ── */}
        <motion.div
          className="w-full lg:w-[40%] relative flex items-center justify-center min-h-[360px] sm:min-h-[440px] lg:min-h-[520px]"
          style={{ y: rightY }}
        >
          {/* Scan ring wrapper behind canvas */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            variants={scanRingVariants}
            initial="initial"
            animate="animate"
          >
            <div
              className="w-64 sm:w-80 h-64 sm:h-80 rounded-full"
              style={{
                border: "1px solid rgba(0,245,255,0.12)",
                boxShadow: "0 0 60px rgba(0,245,255,0.06), inset 0 0 60px rgba(124,58,237,0.04)",
              }}
            />
          </motion.div>

          {/* 3D Canvas */}
          <motion.div
            className="relative w-full h-[360px] sm:h-[440px] lg:h-[520px]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
          >
            <Esp32Model />
          </motion.div>

          {/* ── Floating Data Cards ── */}
          <FloatingDataCard
            icon={<Activity size={14} />}
            label="Today Present"
            value="124 / 130"
            color="#22c55e"
            glowColor="#22c55e"
            delay={1.0}
            position="top-2 left-2 sm:left-0 lg:-left-12 lg:top-4"
          />
          <FloatingDataCard
            icon={<DollarSign size={14} />}
            label="Payroll"
            value="₹31,500"
            color="#a78bfa"
            glowColor="#7c3aed"
            delay={1.3}
            position="top-2 right-2 sm:right-0 lg:-right-8 lg:top-4"
          />
          <FloatingDataCard
            icon={<Clock size={14} />}
            label="Overtime"
            value="2.5 hrs"
            color="#f59e0b"
            glowColor="#f59e0b"
            delay={1.6}
            position="bottom-4 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:-right-8 lg:bottom-16"
          />
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
      >
        <span className="text-white/30 text-xs tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-8 bg-gradient-to-b from-cyan-400/60 to-transparent"
        />
      </motion.div>
    </section>
  );
}
