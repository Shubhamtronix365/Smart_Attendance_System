"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, DollarSign, Calendar, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2, AlertCircle, Loader2
} from "lucide-react";
import EmployeeSidebar from "@/components/EmployeeSidebar";
import EmployeeTopBar from "@/components/EmployeeTopBar";
import { advanceApi } from "@/services/api";

export default function EmployeeAdvancesPage() {
  const [advances, setAdvances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMyAdvances = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await advanceApi.my();
      setAdvances(res.data || []);
    } catch (err) {
      console.error("Error loading my advances", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyAdvances();
  }, [fetchMyAdvances]);

  const totalDisbursed = advances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalRecovered = advances.reduce((s, a) => s + Number(a.recovered_amount || 0), 0);
  const outstandingBalance = advances.reduce((s, a) => s + Number(a.remaining_balance || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <EmployeeSidebar />
      <EmployeeTopBar title="Salary Advances" />

      <main className="min-h-screen pt-16 md:ml-60 transition-all">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-black text-white flex items-center gap-2.5">
              <CreditCard className="text-cyan-400" /> My Salary Advances
            </h1>
            <p className="text-white/40 text-sm mt-0.5">
              Track emergency advances received and monthly payroll recovery progress
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white/40 text-xs uppercase font-semibold">Total Advances Disbursed</p>
                <p className="text-2xl font-black text-white mt-1 font-mono">₹{totalDisbursed.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ArrowUpRight size={20} />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white/40 text-xs uppercase font-semibold">Total Recovered via Payroll</p>
                <p className="text-2xl font-black text-green-400 mt-1 font-mono">₹{totalRecovered.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                <ArrowDownRight size={20} />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-between">
              <div>
                <p className="text-cyan-300/70 text-xs uppercase font-semibold">Current Outstanding Balance</p>
                <p className="text-2xl font-black text-cyan-300 mt-1 font-mono">₹{outstandingBalance.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <DollarSign size={20} />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="neo-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Advance #", "Disbursed Date", "Initial Amount", "Recovered in Payroll", "Remaining Balance", "Status", "Reason / Notes"].map((th) => (
                      <th key={th} className="px-4 py-3.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-white/40">
                        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
                        Loading advances...
                      </td>
                    </tr>
                  ) : advances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-white/40">
                        No salary advances on record.
                      </td>
                    </tr>
                  ) : (
                    advances.map((a) => (
                      <tr key={a.advance_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-4 font-mono text-xs text-white/40">#{a.advance_id}</td>
                        <td className="px-4 py-4 font-mono text-xs text-white/70">{a.disbursement_date}</td>
                        <td className="px-4 py-4 font-mono font-bold text-white">
                          ₹{Number(a.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 font-mono text-green-400 font-semibold">
                          ₹{Number(a.recovered_amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-cyan-300">
                          ₹{Number(a.remaining_balance).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                            a.status === "active"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : a.status === "recovered"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-white/5 text-white/40 border border-white/10"
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-white/60 max-w-xs truncate">{a.reason || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
