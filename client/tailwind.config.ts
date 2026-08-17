import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design token colors
        "neon-cyan": "#00f5ff",
        "neon-violet": "#7c3aed",
        "neon-violet-light": "#a78bfa",
        "bg-primary": "#0a0f1e",
        "bg-card": "rgba(255, 255, 255, 0.03)",
        "status-green": "#22c55e",
        "status-amber": "#f59e0b",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-cyber":
          "linear-gradient(135deg, #00f5ff 0%, #7c3aed 100%)",
        "gradient-dark":
          "linear-gradient(180deg, #0a0f1e 0%, #0d1424 100%)",
      },
      boxShadow: {
        "neon-cyan": "0 0 20px rgba(0, 245, 255, 0.4)",
        "neon-cyan-lg": "0 0 40px rgba(0, 245, 255, 0.6)",
        "neon-violet": "0 0 20px rgba(124, 58, 237, 0.4)",
        "neon-violet-lg": "0 0 40px rgba(124, 58, 237, 0.6)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      animation: {
        "glow-cyan": "glow-pulse-cyan 2s ease-in-out infinite",
        "glow-violet": "glow-pulse-violet 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
        scan: "scan-rotate 4s linear infinite",
      },
      keyframes: {
        "glow-pulse-cyan": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 245, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 245, 255, 0.7)" },
        },
        "glow-pulse-violet": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(124, 58, 237, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(124, 58, 237, 0.7)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "scan-rotate": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
