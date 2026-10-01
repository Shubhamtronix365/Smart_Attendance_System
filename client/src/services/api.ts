import axios from "axios";

// ─── Base Instance ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ─── Cookie Helper ────────────────────────────────────────────────────────────
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

// ─── Request Interceptor — Attach JWT ────────────────────────────────────────
api.interceptors.request.use((config) => {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = localStorage.getItem("access_token");
  }
  if (!token) {
    token = getCookie("access_token") || null;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor — 401 Redirect ──────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("role");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);


// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string, rememberMe?: boolean) =>
    api.post("/api/auth/login", { email, password, rememberMe }),
  logout: () => api.post("/api/auth/logout"),
  me: () => api.get("/api/auth/me"),
  changePassword: (data: unknown) => api.put("/api/auth/change-password", data),
};

// ─── Employees ─────────────────────────────────────────────────────────────────
export const employeesApi = {
  list: (params?: Record<string, string>) => api.get("/api/employees", { params }),
  get: (id: string) => api.get(`/api/employees/${id}`),
  create: (data: unknown) => api.post("/api/employees", data),
  update: (id: string, data: unknown) => api.put(`/api/employees/${id}`, data),
  delete: (id: string) => api.delete(`/api/employees/${id}`),
  deleteAll: () => api.delete("/api/employees/all/clear"),
};

// ─── Attendance ────────────────────────────────────────────────────────────────
// ─── Attendance ────────────────────────────────────────────────────────────────
export const attendanceApi = {
  list: (dateOrParams?: string | Record<string, any>, extraParams?: Record<string, any>) => {
    if (typeof dateOrParams === "string") {
      return api.get("/api/attendance", { params: { date: dateOrParams, ...extraParams } });
    }
    return api.get("/api/attendance", { params: { ...dateOrParams, ...extraParams } });
  },
  live: () => api.get("/api/attendance/live"),
  stats: () => api.get("/api/attendance/stats/today"),
  analytics: () => api.get("/api/attendance/analytics"),
  create: (data: unknown) => api.post("/api/attendance", data),
  update: (id: string, data: unknown) => api.put(`/api/attendance/${id}`, data),
  export: (paramsOrDate: string | Record<string, any>, format: "excel" | "pdf" = "excel") => {
    if (typeof paramsOrDate === "string") {
      return api.get("/api/attendance/export", { params: { date: paramsOrDate, format }, responseType: "blob" });
    }
    return api.get("/api/attendance/export", { params: { ...paramsOrDate, format: paramsOrDate.format || format }, responseType: "blob" });
  },
};

// ─── Leave ────────────────────────────────────────────────────────────────────
export const leaveApi = {
  list: (status?: string) => api.get("/api/leave", { params: { status } }),
  request: (data: unknown) => api.post("/api/leave/request", data),
  approve: (id: string | number) => api.put(`/api/leave/${id}/approve`),
  reject: (id: string | number, reason?: string) => api.put(`/api/leave/${id}/reject`, { reason }),
  cancel: (id: string | number) => api.delete(`/api/leave/${id}`),
};

// ─── Payroll ──────────────────────────────────────────────────────────────────
export const payrollApi = {
  list: (month: number, year: number, employeeId?: number) =>
    api.get("/api/payroll", { params: { month, year, employee_id: employeeId } }),
  generate: (month: number, year: number) =>
    api.post(`/api/payroll/generate/${year}/${month}`),
  payslip: (id: string | number) =>
    api.get(`/api/payroll/payslip/${id}`, { responseType: "blob" }),
  downloadPdf: (id: string | number) =>
    api.get(`/api/payroll/payslip/${id}`, { responseType: "blob" }),
  markPaid: (id: string | number, isPaid: boolean) =>
    api.put(`/api/payroll/${id}/mark_paid`, { is_paid: isPaid }),
  previewIndividual: (employeeId: number, year: number, month: number) =>
    api.get(`/api/payroll/preview/${employeeId}`, { params: { year, month } }).then((res) => res.data),
  saveManualPayroll: (data: unknown) =>
    api.post("/api/payroll/manual-save", data).then((res) => res.data),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  dailyAttendance: (params: Record<string, string>) =>
    api.get("/api/reports/attendance/daily", { params }),
  monthlyAttendance: (params: Record<string, string>) =>
    api.get("/api/reports/attendance/monthly", { params }),
  detailedAttendanceLogs: (params: Record<string, any>) =>
    api.get("/api/reports/attendance/detailed-logs", { params }),
  payroll: (params: Record<string, string>) =>
    api.get("/api/reports/payroll", { params }),
  exportDailyAttendance: (params: Record<string, string>, format: "pdf" | "excel") =>
    api.get("/api/reports/attendance/daily", { params: { ...params, format }, responseType: "blob" }),
  exportMonthlyAttendance: (params: Record<string, string>, format: "pdf" | "excel") =>
    api.get("/api/reports/attendance/monthly", { params: { ...params, format }, responseType: "blob" }),
  exportDetailedAttendanceLogs: (params: Record<string, any>, format: "pdf" | "excel") =>
    api.get("/api/reports/attendance/detailed-logs", { params: { ...params, format }, responseType: "blob" }),
  exportPayroll: (params: Record<string, string>, format: "pdf" | "excel") =>
    api.get("/api/reports/payroll", { params: { ...params, format }, responseType: "blob" }),
};

// ─── Health & Keep-Alive ──────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get("/api/health"),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get("/api/settings").then((res) => res.data),
  update: (data: {
    standard_work_hours: number;
    late_threshold_minutes: number;
    ot_multiplier: number;
    device_api_key: string;
    device_id?: string;
  }) => api.put("/api/settings", data).then((res) => res.data),
};

// ─── Hardware Enrollment (ESP32) ───────────────────────────────────────────
export const deviceApi = {
  startEnrollment: (data: { employee_code: string; name: string; fingerprint_id?: number | null }) =>
    api.post("/api/device/enroll/start", data).then((res) => res.data),
  getEnrollmentStatus: () =>
    api.get("/api/device/enroll/status").then((res) => res.data),
  cancelEnrollment: () =>
    api.post("/api/device/enroll/cancel").then((res) => res.data),
  finalizeEnrollment: (data: unknown) =>
    api.post("/api/device/enroll/finalize", data).then((res) => res.data),
  getNextSlot: () =>
    api.get("/api/device/next-slot").then((res) => res.data),
  deleteSlot: (slotId: number) =>
    api.delete(`/api/device/sensor/slot/${slotId}`).then((res) => res.data),
  clearSensor: () =>
    api.post("/api/device/sensor/clear-all").then((res) => res.data),
};

// ─── Employee Self-Service ────────────────────────────────────────────────────
export const employeeSelfApi = {
  myAttendance: (month: number, year: number) =>
    api.get("/api/attendance/my", { params: { month, year } }),
  myStats: (month: number, year: number) =>
    api.get("/api/attendance/my-stats", { params: { month, year } }),
  myPayroll: (year?: number) =>
    api.get("/api/payroll/my", { params: year ? { year } : {} }),
  myLeaveBalance: () =>
    api.get("/api/leave/my-balance"),
};

// ─── Database Vault & Explorer (NeonDB) ──────────────────────────────────────
export const databaseApi = {
  verifyAccess: (password: string) =>
    api.post("/api/database/verify-access", { password }).then((res) => res.data),
  getOverview: (vaultToken: string) =>
    api.get("/api/database/overview", {
      headers: { "X-Vault-Token": vaultToken },
    }).then((res) => res.data),
  getTableSchema: (tableName: string, vaultToken: string) =>
    api.get(`/api/database/tables/${tableName}/schema`, {
      headers: { "X-Vault-Token": vaultToken },
    }).then((res) => res.data),
  getTableData: (
    tableName: string,
    params: {
      page?: number;
      page_size?: number;
      search?: string;
      sort_by?: string;
      sort_dir?: string;
      reveal_secrets?: boolean;
    },
    vaultToken: string
  ) =>
    api.get(`/api/database/tables/${tableName}/data`, {
      params,
      headers: { "X-Vault-Token": vaultToken },
    }).then((res) => res.data),
  runQuery: (query: string, vaultToken: string) =>
    api.post(
      "/api/database/query",
      { query },
      { headers: { "X-Vault-Token": vaultToken } }
    ).then((res) => res.data),
  downloadCsv: async (tableName: string, vaultToken: string) => {
    const res = await api.get(`/api/database/tables/${tableName}/export`, {
      headers: { "X-Vault-Token": vaultToken },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${tableName}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};

export default api;


