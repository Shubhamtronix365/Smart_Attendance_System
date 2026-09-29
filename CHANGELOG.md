# Changelog — Smart Attendance System Upgrade

All notable changes made during the system audit and real-data upgrade.

---

## [Phase 2: Backend Real-Data Foundation]
### Added
- **`GET /api/attendance/my`** (`server/routes/attendance.py`):
  - Returns authenticated employee's attendance records for a specific month and year using `extract("month", Attendance.date)` and `extract("year", Attendance.date)`.
- **`GET /api/attendance/my-stats`** (`server/routes/attendance.py`):
  - Aggregates and returns employee's monthly stats: `present_days`, `absent_days`, `late_days`, `leave_days`, `overtime_hours`, `total_working_hours`.
- **`GET /api/payroll/my`** (`server/routes/payroll.py`):
  - Returns authenticated employee's official generated payroll and payslip history.
- **`GET /api/leave/my-balance`** (`server/routes/leave.py`):
  - Calculates remaining leave balances by deducting approved leaves taken in the current calendar year from standard annual quotas (`casual: 12`, `sick: 10`, `paid: 15`).
- **`employeeSelfApi`** (`client/src/services/api.ts`):
  - Frontend SDK wrapper for employee self-service endpoints (`myAttendance`, `myStats`, `myPayroll`, `myLeaveBalance`).

### Security & Bug Fixes
- **`server/routes/auth.py`**:
  - Removed plain-text password storage (`current_user.plain_password = ...`) on password change.
- **`server/routes/attendance.py`**:
  - Replaced non-standard HTTP 433 status code with `status.HTTP_403_FORBIDDEN` in `today_attendance`.

---

## [Phase 3: Frontend Real-Data Replacement]
### Fixed & Upgraded
- **`client/src/app/employee/dashboard/page.tsx`**:
  - Removed all mock data constants (`EMPLOYEE`, `MY_ATTENDANCE`, `WORKING_HOURS_DATA`, `MY_PAYSLIPS`).
  - Added authentication route guard: redirects unauthenticated users to `/login`.
  - Wired live attendance data with month and year filters.
  - Dynamically calculated stat cards from real attendance, payroll, and leave records.
  - Replaced mock `WorkingHoursChart` with real records from the selected month.
  - Connected `ApplyLeaveForm` to `leaveApi.request()` with form validation and instant leave balance refresh.
  - Connected `MyPayslips` to `payrollApi.payslip(id)` with real PDF blob downloads.
  - Connected sidebar navigation items to functional section navigation and logout.
  - Added real-time WebSocket listener (`/ws/client`) for live punch and leave events.
- **`client/src/components/AdminTopBar.tsx`**:
  - Replaced static `NOTIFICATIONS` array with real-time biometric and leave events seeded from `attendanceApi.live()` and live WebSocket broadcasts.
  - Added functional search bar submitting directly to `/admin/employees?search=...`.
  - Added notification click-through and "Mark all read" action.
- **Admin Pages (`dashboard`, `attendance`, `employees`, `leave`, `payroll`, `reports`, `settings`)**:
  - Removed all hardcoded `userName="Admin User"` and `userRole="Administrator"` prop overrides.
  - Enabled dynamic greeting (`Good morning, {userName}`) powered by authenticated user session in `useAuth()`.

---

## [Phase 4 & 5: Functional UI Polish & Bug Fixes]
### Fixed
- **`client/src/app/admin/leave/page.tsx`**:
  - Fixed rejection toast from `error()` to `success("Leave request rejected.")`.
- **`client/src/app/admin/reports/page.tsx`**:
  - Wired real `window.print()` trigger to Print button instead of placeholder toast.
- **`client/src/app/admin/payroll/page.tsx`**:
  - Connected "All Payslips" bulk export button to `reportsApi.exportPayroll()` generating full PDF statement.
- **`client/src/hooks/useCountUp.ts`**:
  - Removed unused framer-motion imports.
- **`client/src/components/ChartsSection.tsx`**:
  - Fixed TypeScript tooltip label type conversion.
- **`client/src/components/HeroSection.tsx`**:
  - Fixed duplicate `animate` prop on `DataCard`.
  - Added `style` prop support to `MagneticButton`.
- **`client/src/components/Esp32Model.tsx`**:
  - Resolved `dashOffset` material type assignment.
- **`client/src/components/LiveAttendanceFeed.tsx`**:
  - Handled downlevel Set iteration via `Array.from()`.
