import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Smart Attendance System | Biometric Powered",
  description:
    "IoT-powered biometric attendance management with ESP32 fingerprint scanning, real-time tracking, and automated payroll computation.",
  keywords: ["attendance", "biometric", "ESP32", "fingerprint", "payroll", "IoT"],
  authors: [{ name: "Smart Attendance" }],
  openGraph: {
    title: "Smart Attendance System",
    description: "Biometric-powered workforce attendance management",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

