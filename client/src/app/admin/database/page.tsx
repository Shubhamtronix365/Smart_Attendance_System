"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Lock,
  Unlock,
  ShieldAlert,
  Server,
  Table,
  Search,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Key,
  HardDrive,
  FileSpreadsheet,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { databaseApi } from "@/services/api";

export default function AdminDatabasePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { success, error, info } = useToast();

  // Vault Auth State
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Database Overview & Catalog
  const [dbOverview, setDbOverview] = useState<any>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"data" | "schema" | "sql">("data");
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false);

  // Table Data State
  const [tableData, setTableData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [revealSecrets, setRevealSecrets] = useState(false);

  // Schema State
  const [tableSchema, setTableSchema] = useState<any>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // SQL Query Console State
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM employees LIMIT 10;");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isRunningQuery, setIsRunningQuery] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Enforce Admin Authentication
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  // Load Saved Vault Token from sessionStorage if valid
  useEffect(() => {
    const savedToken = sessionStorage.getItem("neon_vault_token");
    if (savedToken) {
      setVaultToken(savedToken);
    }
  }, []);

  // ─── 1. Password Verification Handler ───────────────────────────────────────
  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setAuthError("Please enter your administrator password.");
      return;
    }

    try {
      setIsVerifying(true);
      setAuthError(null);
      const res = await databaseApi.verifyAccess(adminPassword);
      if (res?.vault_token) {
        setVaultToken(res.vault_token);
        sessionStorage.setItem("neon_vault_token", res.vault_token);
        setAdminPassword("");
        success("Access granted. Database vault unlocked.");
      }
    } catch (err: any) {
      console.error("Vault unlock failed", err);
      const msg = err.response?.data?.detail || "Invalid administrator password. Access denied.";
      setAuthError(msg);
      error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLockVault = () => {
    setVaultToken(null);
    sessionStorage.removeItem("neon_vault_token");
    setDbOverview(null);
    setTableData(null);
    info("Database vault has been locked.");
  };

  // ─── 2. Fetch Database Overview ─────────────────────────────────────────────
  const loadDatabaseOverview = useCallback(async () => {
    if (!vaultToken) return;
    try {
      setIsRefreshingOverview(true);
      const overview = await databaseApi.getOverview(vaultToken);
      setDbOverview(overview);
      if (overview.tables?.length > 0 && !selectedTable) {
        // Default to 'employees' or first table
        const defaultTable = overview.tables.find((t: any) => t.table_name === "employees")?.table_name || overview.tables[0].table_name;
        setSelectedTable(defaultTable);
      }
    } catch (err: any) {
      console.error("Failed to load DB overview", err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        handleLockVault();
        error("Vault session expired. Please re-authenticate.");
      } else {
        error("Unable to connect to NeonDB. Please verify database connection string.");
      }
    } finally {
      setIsRefreshingOverview(false);
    }
  }, [vaultToken, selectedTable]);

  useEffect(() => {
    if (vaultToken) {
      loadDatabaseOverview();
    }
  }, [vaultToken, loadDatabaseOverview]);

  // ─── 3. Fetch Table Records ─────────────────────────────────────────────────
  const loadTableData = useCallback(async () => {
    if (!vaultToken || !selectedTable) return;
    try {
      setIsLoadingData(true);
      const res = await databaseApi.getTableData(
        selectedTable,
        {
          page: currentPage,
          page_size: pageSize,
          search: searchQuery || undefined,
          sort_by: sortBy || undefined,
          sort_dir: sortDir,
          reveal_secrets: revealSecrets,
        },
        vaultToken
      );
      setTableData(res);
    } catch (err: any) {
      console.error("Failed to load table data", err);
      error(err.response?.data?.detail || `Failed to fetch data for ${selectedTable}`);
    } finally {
      setIsLoadingData(false);
    }
  }, [vaultToken, selectedTable, currentPage, pageSize, searchQuery, sortBy, sortDir, revealSecrets, error]);

  useEffect(() => {
    if (vaultToken && selectedTable && activeTab === "data") {
      loadTableData();
    }
  }, [vaultToken, selectedTable, activeTab, loadTableData]);

  // ─── 4. Fetch Table Schema ──────────────────────────────────────────────────
  const loadTableSchema = useCallback(async () => {
    if (!vaultToken || !selectedTable) return;
    try {
      setIsLoadingSchema(true);
      const res = await databaseApi.getTableSchema(selectedTable, vaultToken);
      setTableSchema(res);
    } catch (err: any) {
      console.error("Failed to load schema", err);
      error(`Unable to inspect schema for ${selectedTable}`);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [vaultToken, selectedTable, error]);

  useEffect(() => {
    if (vaultToken && selectedTable && activeTab === "schema") {
      loadTableSchema();
    }
  }, [vaultToken, selectedTable, activeTab, loadTableSchema]);

  // ─── 5. Run SQL Query ───────────────────────────────────────────────────────
  const handleExecuteQuery = async () => {
    if (!vaultToken || !sqlQuery.trim()) return;
    try {
      setIsRunningQuery(true);
      const res = await databaseApi.runQuery(sqlQuery, vaultToken);
      setQueryResult(res);
      success(`Query executed successfully in ${res.execution_time_ms} ms (${res.row_count} rows)`);
    } catch (err: any) {
      console.error("Query failed", err);
      error(err.response?.data?.detail || "SQL query execution failed.");
    } finally {
      setIsRunningQuery(false);
    }
  };

  // ─── 6. CSV Export ──────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (!vaultToken || !selectedTable) return;
    try {
      setIsExporting(true);
      await databaseApi.downloadCsv(selectedTable, vaultToken);
      success(`Exported ${selectedTable}.csv`);
    } catch (err: any) {
      console.error("Export failed", err);
      error("Failed to export table data.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSort = (colName: string) => {
    if (sortBy === colName) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(colName);
      setSortDir("asc");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <AdminSidebar />
      <AdminTopBar
        title="NeonDB Database Explorer"
      />

      <main className="md:ml-60 pt-20 px-4 md:px-8 pb-12">
        {/* ─── VAULT LOCKED SCREEN ─────────────────────────────────────────── */}
        {!vaultToken ? (
          <div className="min-h-[75vh] flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md p-8 rounded-3xl bg-[#0d1424] border border-cyan-500/20 shadow-2xl relative overflow-hidden"
              style={{
                boxShadow: "0 0 60px rgba(0,245,255,0.08)",
              }}
            >
              {/* Background Glow */}
              <div className="absolute -top-20 -right-20 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative text-center mb-6">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
                  <Lock size={28} />
                </div>
                <h2 className="text-xl font-black text-white">Elevated Security Zone</h2>
                <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                  Enter your Administrator password to unlock the raw NeonDB database explorer and schema viewer.
                </p>
              </div>

              <form onSubmit={handleUnlockVault} className="space-y-4 relative">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5">
                    Administrator Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        setAuthError(null);
                      }}
                      placeholder="Enter administrator password..."
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:border-cyan-400 focus:outline-none transition-all pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {authError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 mt-2 text-rose-400 text-xs"
                    >
                      <AlertTriangle size={13} />
                      <span>{authError}</span>
                    </motion.div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15 flex items-start gap-2.5 text-[11px] text-cyan-300/80">
                  <ShieldAlert size={15} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    This elevated session grants direct read access to PostgreSQL tables, schemas, and live record counts.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3.5 rounded-xl font-bold text-xs text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                  style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Verifying Password...
                    </>
                  ) : (
                    <>
                      <Unlock size={16} />
                      Unlock Database Vault
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        ) : (
          /* ─── VAULT UNLOCKED: EXPLORER DASHBOARD ─────────────────────────── */
          <div className="space-y-6">
            {/* Database Metadata Header Card */}
            <div className="p-6 rounded-2xl bg-[#0d1424] border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <Database size={24} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-black text-white">
                        {dbOverview?.database_name || "NeonDB"}
                      </h2>
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {dbOverview?.provider || "PostgreSQL Connected"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-white/50 bg-white/5 border border-white/10">
                        Host: {dbOverview?.host || "aws.neon.tech"}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs mt-1 font-mono truncate max-w-xl">
                      {dbOverview?.version?.split(" on ")[0] || "PostgreSQL 16 (Neon Serverless)"}
                    </p>
                  </div>
                </div>

                {/* Metrics Badges & Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                    <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Tables</p>
                    <p className="text-base font-black text-cyan-400">{dbOverview?.total_tables ?? "-"}</p>
                  </div>
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                    <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Total Rows</p>
                    <p className="text-base font-black text-purple-400">{dbOverview?.total_records ?? "-"}</p>
                  </div>
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                    <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">DB Size</p>
                    <p className="text-base font-black text-white">{dbOverview?.database_size ?? "-"}</p>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={loadDatabaseOverview}
                      disabled={isRefreshingOverview}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all disabled:opacity-50"
                      title="Refresh Database Catalog"
                    >
                      <RefreshCw size={15} className={isRefreshingOverview ? "animate-spin text-cyan-400" : ""} />
                    </button>
                    <button
                      onClick={handleLockVault}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-semibold transition-all"
                      title="Lock Explorer"
                    >
                      <Lock size={13} />
                      Lock Vault
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Layout Grid: Left Tables Selector + Right Explorer Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Tables Sidebar */}
              <div className="lg:col-span-3 space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 shadow-xl">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={13} className="text-cyan-400" />
                      Public Tables
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">
                      {dbOverview?.tables?.length ?? 0}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {dbOverview?.tables?.map((t: any) => {
                      const isSelected = selectedTable === t.table_name;
                      return (
                        <button
                          key={t.table_name}
                          onClick={() => {
                            setSelectedTable(t.table_name);
                            setCurrentPage(1);
                            setSearchQuery("");
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                            isSelected
                              ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shadow-md shadow-cyan-500/5"
                              : "bg-white/[0.02] hover:bg-white/5 border border-white/5 text-white/70 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Table size={14} className={isSelected ? "text-cyan-400" : "text-white/40"} />
                            <span className="truncate font-mono">{t.table_name}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                              isSelected
                                ? "bg-cyan-400/20 text-cyan-300"
                                : "bg-white/5 text-white/40"
                            }`}
                          >
                            {t.row_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Database Quick Info Card */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-white/50 space-y-2">
                  <div className="flex items-center gap-2 text-white/70 font-semibold">
                    <Server size={14} className="text-purple-400" />
                    <span>Neon Architecture</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Tables are synchronized in real-time across your serverless PostgreSQL cluster on AWS with autoscaling compute.
                  </p>
                </div>
              </div>

              {/* Right Column: Work Area with Tabs */}
              <div className="lg:col-span-9 space-y-4">
                {/* Tabs Selector Bar */}
                <div className="p-1.5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab("data")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeTab === "data"
                          ? "bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-300"
                          : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <Table size={14} />
                      Data Records ({tableData?.total ?? "-"})
                    </button>
                    <button
                      onClick={() => setActiveTab("schema")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeTab === "schema"
                          ? "bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-300"
                          : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <Key size={14} />
                      Schema & Columns
                    </button>
                    <button
                      onClick={() => setActiveTab("sql")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeTab === "sql"
                          ? "bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-300"
                          : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <Terminal size={14} />
                      SQL Query Runner
                    </button>
                  </div>

                  {activeTab === "data" && (
                    <div className="flex items-center gap-2 px-2">
                      <button
                        onClick={() => setRevealSecrets(!revealSecrets)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          revealSecrets
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                            : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                        }`}
                        title="Toggle password hash masking"
                      >
                        {revealSecrets ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>{revealSecrets ? "Hide Hashes" : "Reveal Hashes"}</span>
                      </button>

                      <button
                        onClick={handleExportCsv}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all disabled:opacity-50"
                        title="Download entire table as CSV"
                      >
                        {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Export CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* ─── TAB 1: DATA BROWSER ─────────────────────────────────── */}
                {activeTab === "data" && (
                  <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
                    {/* Filter and Search Bar */}
                    <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="relative w-full sm:w-72">
                        <Search
                          size={14}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
                        />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder={`Search ${selectedTable}...`}
                          className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:border-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-3 text-xs text-white/50 justify-between sm:justify-end">
                        <span>
                          Showing Page <strong className="text-white">{tableData?.page ?? 1}</strong> of{" "}
                          <strong className="text-white">{tableData?.total_pages ?? 1}</strong> ({tableData?.total ?? 0} total)
                        </span>

                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none"
                        >
                          <option value={10} className="bg-[#0a0f1e]">10 / page</option>
                          <option value={25} className="bg-[#0a0f1e]">25 / page</option>
                          <option value={50} className="bg-[#0a0f1e]">50 / page</option>
                          <option value={100} className="bg-[#0a0f1e]">100 / page</option>
                        </select>
                      </div>
                    </div>

                    {/* Table Render */}
                    <div className="overflow-x-auto max-h-[620px]">
                      <table className="w-full text-left text-xs border-collapse font-sans">
                        <thead className="sticky top-0 bg-[#0d1424] z-10 border-b border-white/10">
                          <tr>
                            {tableData?.columns?.map((c: any) => (
                              <th
                                key={c.column_name}
                                onClick={() => handleSort(c.column_name)}
                                className="py-3 px-4 uppercase text-[10px] font-bold text-white/50 tracking-wider whitespace-nowrap cursor-pointer hover:text-cyan-400 select-none transition-colors"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>{c.column_name}</span>
                                  <ArrowUpDown size={11} className="opacity-40" />
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                          {isLoadingData ? (
                            <LoadingSkeleton rows={8} cols={tableData?.columns?.length || 6} />
                          ) : tableData?.rows?.length === 0 ? (
                            <tr>
                              <td
                                colSpan={tableData?.columns?.length || 6}
                                className="py-20 text-center text-white/40"
                              >
                                <Table size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-medium">No records found in table</p>
                                <p className="text-xs mt-0.5 text-white/30">
                                  {searchQuery ? "Try refining your search term" : "Table is currently empty"}
                                </p>
                              </td>
                            </tr>
                          ) : (
                            tableData?.rows?.map((row: any, rIdx: number) => (
                              <tr key={rIdx} className="hover:bg-cyan-500/[0.04] transition-colors">
                                {tableData.columns.map((c: any) => {
                                  const val = row[c.column_name];
                                  const isNull = val === null || val === undefined;
                                  const isBool = typeof val === "boolean";

                                  return (
                                    <td
                                      key={c.column_name}
                                      className="py-3 px-4 whitespace-nowrap max-w-xs truncate"
                                      title={!isNull ? String(val) : "NULL"}
                                    >
                                      {isNull ? (
                                        <span className="text-white/20 italic font-sans text-[10px]">NULL</span>
                                      ) : isBool ? (
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            val
                                              ? "bg-emerald-500/10 text-emerald-400"
                                              : "bg-rose-500/10 text-rose-400"
                                          }`}
                                        >
                                          {String(val)}
                                        </span>
                                      ) : String(val).includes("••••••••") ? (
                                        <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                                          {String(val)}
                                        </span>
                                      ) : (
                                        <span className="text-white/85">{String(val)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Pagination Footer */}
                    <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
                      <span>
                        Showing {tableData?.rows?.length || 0} rows from{" "}
                        <strong className="text-cyan-400 font-mono">{selectedTable}</strong>
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1 || isLoadingData}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all disabled:opacity-40"
                        >
                          <ChevronLeft size={14} /> Previous
                        </button>
                        <span className="px-2 font-mono text-white">
                          {currentPage} / {tableData?.total_pages || 1}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(tableData?.total_pages || 1, p + 1))}
                          disabled={currentPage >= (tableData?.total_pages || 1) || isLoadingData}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all disabled:opacity-40"
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── TAB 2: SCHEMA & COLUMNS INSPECTOR ────────────────────── */}
                {activeTab === "schema" && (
                  <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key size={16} className="text-cyan-400" />
                        <h3 className="text-sm font-bold text-white">
                          Table Schema: <span className="font-mono text-cyan-300">{selectedTable}</span>
                        </h3>
                      </div>
                      <span className="text-xs text-white/40">
                        {tableSchema?.columns?.length ?? 0} columns defined
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.02] text-white/40 uppercase tracking-wider font-semibold text-[10px]">
                            <th className="py-3 px-6">#</th>
                            <th className="py-3 px-6">Column Name</th>
                            <th className="py-3 px-6">Data Type</th>
                            <th className="py-3 px-6">Primary Key</th>
                            <th className="py-3 px-6">Nullable</th>
                            <th className="py-3 px-6">Default Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-xs">
                          {isLoadingSchema ? (
                            <LoadingSkeleton rows={6} cols={6} />
                          ) : (
                            tableSchema?.columns?.map((c: any, idx: number) => (
                              <tr key={c.name} className="hover:bg-white/[0.02] transition-colors">
                                <td className="py-3.5 px-6 text-white/30">{idx + 1}</td>
                                <td className="py-3.5 px-6 font-bold text-white flex items-center gap-2">
                                  {c.name}
                                  {c.is_primary_key && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                      PK
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-6 text-cyan-400">{c.type}</td>
                                <td className="py-3.5 px-6">
                                  {c.is_primary_key ? (
                                    <span className="text-emerald-400 flex items-center gap-1 font-sans text-xs">
                                      <CheckCircle2 size={12} /> Yes
                                    </span>
                                  ) : (
                                    <span className="text-white/20 font-sans text-xs">No</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-6 font-sans">
                                  {c.is_nullable ? (
                                    <span className="text-amber-400/80 text-[11px]">Nullable</span>
                                  ) : (
                                    <span className="text-white/40 text-[11px]">NOT NULL</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-6 text-white/50 text-[11px]">
                                  {c.default || <span className="text-white/20 italic">None</span>}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ─── TAB 3: READ-ONLY SQL RUNNER ──────────────────────────── */}
                {activeTab === "sql" && (
                  <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Terminal size={16} className="text-cyan-400" />
                          SQL Query Runner (Read-Only)
                        </h3>
                        <p className="text-xs text-white/40 mt-0.5">
                          Execute custom SELECT statements against your NeonDB instance with automatic safety guards.
                        </p>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSqlQuery(`SELECT * FROM ${selectedTable} LIMIT 10;`)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-cyan-300 font-mono transition-colors"
                        >
                          SELECT * FROM {selectedTable}
                        </button>
                        <button
                          onClick={() => setSqlQuery("SELECT * FROM employees ORDER BY employee_id ASC;")}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-purple-300 font-mono transition-colors"
                        >
                          Employees
                        </button>
                        <button
                          onClick={() => setSqlQuery("SELECT date, count(*) as punches FROM attendance GROUP BY date ORDER BY date DESC LIMIT 7;")}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-emerald-300 font-mono transition-colors"
                        >
                          Weekly Attendance
                        </button>
                      </div>
                    </div>

                    {/* Query Editor */}
                    <div className="relative">
                      <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        rows={4}
                        placeholder="SELECT * FROM public.employees WHERE is_active = true..."
                        className="w-full p-4 rounded-xl bg-[#090d18] border border-white/15 text-cyan-300 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        onClick={handleExecuteQuery}
                        disabled={isRunningQuery || !sqlQuery.trim()}
                        className="absolute right-3 bottom-4 px-4 py-2 rounded-xl font-bold text-xs text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                        style={{ background: "linear-gradient(135deg, #00f5ff, #7c3aed)" }}
                      >
                        {isRunningQuery ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} fill="black" />
                        )}
                        Run Query
                      </button>
                    </div>

                    {/* Query Result Grid */}
                    {queryResult && (
                      <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between text-xs text-white/50">
                          <span>
                            Result: <strong className="text-white">{queryResult.row_count} rows</strong> returned
                          </span>
                          <span className="font-mono text-cyan-400">
                            Executed in {queryResult.execution_time_ms} ms
                          </span>
                        </div>

                        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto max-h-96">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-white/5 border-b border-white/10">
                              <tr>
                                {queryResult.columns?.map((col: string) => (
                                  <th key={col} className="py-2.5 px-4 text-white/60 font-semibold whitespace-nowrap">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {queryResult.rows?.map((row: any, rIdx: number) => (
                                <tr key={rIdx} className="hover:bg-white/[0.02]">
                                  {queryResult.columns.map((col: string) => (
                                    <td key={col} className="py-2.5 px-4 whitespace-nowrap text-white/80">
                                      {row[col] === null ? (
                                        <span className="text-white/20 italic">NULL</span>
                                      ) : (
                                        String(row[col])
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
