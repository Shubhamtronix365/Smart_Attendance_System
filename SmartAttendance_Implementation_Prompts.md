# Smart Employee Attendance & Payroll Management System
## Complete Implementation Prompts — Frontend & Backend

---

# ═══════════════════════════════════════════════
# FRONTEND PROMPT
# ═══════════════════════════════════════════════

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion
- **3D/Canvas:** Three.js (via @react-three/fiber + @react-three/drei)
- **Icons:** Lucide React
- **Charts:** Recharts
- **HTTP Client:** Axios
- **Auth:** JWT stored in httpOnly cookies

---

## HERO SECTION — 3D Immersive Experience

### Visual Concept
Build an immersive 3D hero section that communicates biometric security + futuristic attendance management. Dark glassmorphism aesthetic with deep navy (#0a0f1e) base, neon cyan (#00f5ff) and violet (#7c3aed) accent glows.

### Components to Build

#### `HeroSection.tsx`
```
Layout: Full viewport height (100vh), dark background, subtle particle field.

Left Side (60% width):
- Animated headline with word-by-word staggered entrance:
    "Smart Attendance" → large bold gradient text (cyan → violet)
    "Powered by Biometrics" → subtitle with typewriter effect
- Three value-proposition chips with icon + text, sliding in from left:
    ✓ Fingerprint Authentication  ✓ Real-time Tracking  ✓ Auto Payroll
- Primary CTA button "Get Started" with magnetic hover effect + glow pulse
- Secondary CTA "Watch Demo" with border-only style

Right Side (40% width):
- 3D Canvas: Floating ESP32 device model (use BoxGeometry + wireframe overlay)
- Fingerprint ring that rotates slowly, scales on mount
- Floating data cards orbiting the device:
    Card 1: "Today Present: 124 / 130" (green)
    Card 2: "Payroll: ₹31,500" (violet)
    Card 3: "Overtime: 2.5 hrs" (amber)
- Each card uses Framer Motion: y-oscillation + blur-in entrance
```

#### Framer Motion Animations Required
```tsx
// 1. Staggered container for left-side content
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 }
  }
}

// 2. Individual item slide-in
const itemVariants = {
  hidden: { x: -60, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } }
}

// 3. Floating cards (each has different y offset and duration)
const floatVariants = (delay: number) => ({
  animate: {
    y: [0, -12, 0],
    transition: { duration: 3 + delay, repeat: Infinity, ease: "easeInOut" }
  }
})

// 4. Fingerprint scan ring (scale + rotate on mount)
const scanRingVariants = {
  initial: { scale: 0, rotate: -180, opacity: 0 },
  animate: { scale: 1, rotate: 0, opacity: 1,
    transition: { type: "spring", stiffness: 80, damping: 15 }
  }
}

// 5. Glow pulse on CTA
const glowPulse = {
  animate: {
    boxShadow: [
      "0 0 20px rgba(0,245,255,0.3)",
      "0 0 40px rgba(0,245,255,0.7)",
      "0 0 20px rgba(0,245,255,0.3)"
    ],
    transition: { duration: 2, repeat: Infinity }
  }
}

// 6. Particle field: 80 small dots with random motion using useAnimationFrame
// 7. Scroll-triggered parallax using useScroll + useTransform
```

#### 3D Scene (React Three Fiber)
```
Scene Setup:
  - Camera: perspective, fov 50, position [0, 0, 5]
  - Ambient light: intensity 0.3, color #1a1a2e
  - Point light: cyan #00f5ff at [2, 3, 3], intensity 1.5
  - Point light: violet #7c3aed at [-2, -1, 2], intensity 1.0

Objects:
  1. Central ESP32 Board:
     - BoxGeometry [1.8, 1.2, 0.15] with MeshStandardMaterial
     - Wireframe overlay: same geometry, MeshBasicMaterial, color #00f5ff, opacity 0.3
     - Slow Y-axis rotation: useFrame delta rotation

  2. Fingerprint Ring (torus):
     - TorusGeometry [1.5, 0.04, 16, 100]
     - Animated dash pattern on ShaderMaterial or emissive neon color
     - Rotation on X and Z axes at different speeds

  3. Orbiting Data Nodes (3 spheres):
     - SphereGeometry [0.08, 16, 16] — glowing emissive material
     - Orbit around central device using sin/cos in useFrame

  4. Particle Field:
     - BufferGeometry with 200 vertices randomly distributed in [-5, 5]³
     - PointsMaterial, size 0.03, color #7c3aed

  5. Connecting Lines (Line):
     - LineSegments between ESP32 node → server icon → DB icon
     - Animated dash offset to create "data flowing" effect
```

---

## PAGE STRUCTURE

### 1. Auth Pages

#### `app/(auth)/login/page.tsx`
```
Design:
- Split layout: left = 3D animated logo/branding, right = form
- Form fields: Email, Password
- "Remember Me" checkbox
- Forgot password link
- JWT login via POST /api/auth/login
- On success: decode role (admin/employee) → redirect to respective dashboard
- Show error toast on failure

Animations:
- Form card slides up with spring animation on mount
- Input fields have focus glow (framer layout animation)
- Submit button loading spinner with rotation animation
```

---

### 2. Admin Dashboard — `app/admin/dashboard/page.tsx`

#### Layout
```
Sidebar (fixed left, 240px):
  - Logo + system name
  - Nav items with active indicator (framer layout animation on active pill)
  - Items: Dashboard, Employees, Attendance, Leave, Payroll, Reports, Settings
  - User avatar + name at bottom

Main Content:
  - Top bar: date/time (live), notification bell, user menu
  - Grid layout with animated stat cards
```

#### Stat Cards (6 cards, staggered entrance)
```
1. Total Employees — blue
2. Present Today — green (count up animation)
3. Absent Today — red
4. Late Arrivals — amber
5. Pending Leaves — orange
6. Payroll This Month — violet (₹ formatted)

Each card:
- Glassmorphism style: bg-white/5 backdrop-blur border-white/10
- Icon in colored rounded square
- Number animates from 0 to value on mount (useCountUp hook)
- Hover: scale(1.03), shadow intensifies
- Small trend badge: "+2 from yesterday"
```

#### Live Attendance Feed
```
- Real-time scrolling list of today's check-ins/check-outs
- Each entry: avatar, name, department, time, status badge
- New entries animate in from top with slide + fade
- Color-coded: green=present, red=absent, amber=late
- Auto-refreshes every 30 seconds via polling or WebSocket
```

#### Charts Section
```
1. Weekly Attendance Chart (Recharts AreaChart):
   - X: Mon–Sun, Y: attendance count
   - Gradient fill from cyan → transparent
   - Tooltip with custom styling

2. Department-wise Attendance (Recharts RadarChart):
   - Each spoke = department
   - Shows present % per department

3. Monthly Payroll Trend (Recharts BarChart):
   - Last 6 months salary totals
   - Bars with gradient fill, animated on mount
```

---

### 3. Employee Management — `app/admin/employees/page.tsx`

```
Features:
- Data table with: ID, Name, Email, Department, Designation, Status, Actions
- Search bar: filters by name or ID (debounced 300ms)
- Department filter dropdown
- Status filter: Active / Inactive

Add Employee Modal:
  - Fields: Name, Email, Phone, Department (dropdown), Designation, Basic Salary
  - Fingerprint ID field (manually entered or auto from device)
  - Joining Date
  - Framer Motion: modal slides up from bottom with blur backdrop

Edit Employee:
  - Pre-filled form in side drawer (slides from right)

Delete Employee:
  - Confirmation dialog with animation

Pagination: 10 per page, with page controls
```

---

### 4. Attendance Module — `app/admin/attendance/page.tsx`

```
Date Picker: select any date to view attendance for that day

Attendance Table:
  - Columns: Employee, Check-In, Check-Out, Working Hours, Status, OT Hours
  - Status badges: color-coded (Present/Absent/Late/Half Day/Leave/WFH)
  - Editable override: admin can manually correct an entry

Manual Attendance Entry:
  - If biometric fails, admin can add manual record
  - Fields: Employee (search dropdown), Date, Check-In, Check-Out, Status

Real-Time View Toggle:
  - Switch between "Today Live" and "Historical" mode
  - Live mode shows auto-refreshing feed

Export: Download button → CSV or PDF via API
```

---

### 5. Leave Management — `app/admin/leave/page.tsx`

```
Tabs: Pending | Approved | Rejected | All

Leave Request Card:
  - Employee avatar, name, leave type badge, date range, reason
  - Approve / Reject buttons with animated confirmation
  - Framer Motion: cards animate in with stagger

Leave Calendar:
  - Calendar view showing approved leaves per day
  - Color by leave type: Casual (blue), Sick (red), Paid (green)
```

---

### 6. Payroll Module — `app/admin/payroll/page.tsx`

```
Month Selector: Dropdown for month/year

Generate Payroll Button:
  - Triggers POST /api/payroll/generate/{month}
  - Shows loading animation during processing
  - Success: table populates with payroll data

Payroll Table:
  - Employee, Basic Salary, Present Days, OT Hours, OT Pay, Deductions, Net Salary
  - Each row expandable to show salary breakdown

Bulk Actions:
  - Generate All Payslips (PDF) — zip download
  - Mark as Paid toggle

Individual Payslip Preview:
  - Opens a modal with styled payslip layout
  - Download PDF button → GET /api/payroll/payslip/{id}
```

---

### 7. Reports — `app/admin/reports/page.tsx`

```
Report Types (Tab-based):
  1. Daily Attendance Report
  2. Monthly Attendance Report
  3. Payroll Report

Filters: Date range, Department, Employee

Preview Table: Shows data for selected filters

Export Options:
  - Download PDF
  - Download Excel
  - Print
```

---

### 8. Employee Dashboard — `app/employee/dashboard/page.tsx`

```
Welcome Header: "Good Morning, [Name]" + today's date

Top Stat Cards:
  - This Month Present Days
  - Absent Days
  - Leave Balance
  - Net Salary (current month)

My Attendance Table:
  - Last 30 days: Date, Check-In, Check-Out, Hours, Status

Apply Leave Form:
  - Leave Type, From Date, To Date, Reason
  - Submit → POST /api/leave/request
  - Animated success state

My Payslips Section:
  - List of monthly payslips
  - Download button per payslip

Working Hours Trend:
  - Area chart of daily working hours this month
```

---

## GLOBAL UI ELEMENTS

### Design Tokens
```css
--bg-primary: #0a0f1e;
--bg-secondary: #0f1629;
--bg-card: rgba(255,255,255,0.04);
--border-glass: rgba(255,255,255,0.08);
--accent-cyan: #00f5ff;
--accent-violet: #7c3aed;
--accent-green: #10b981;
--accent-red: #ef4444;
--accent-amber: #f59e0b;
--text-primary: #f1f5f9;
--text-secondary: #94a3b8;
```

### Reusable Components
```
<GlassCard /> — glassmorphism card wrapper with hover effect
<StatusBadge status="present|absent|late|leave|halfday|wfh" />
<AnimatedCounter value={n} /> — count-up animation
<LoadingSkeleton /> — shimmer placeholder while data loads
<ToastProvider /> — top-right toast notifications
<ConfirmDialog /> — animated confirmation modal
<DataTable /> — sortable, filterable table with pagination
<DateRangePicker /> — calendar popup for date selection
```

---

## STATE MANAGEMENT

```
- React Context: AuthContext (user, role, token)
- React Query / SWR: server state (attendance, employees, payroll)
- Zustand (optional): UI state (sidebar collapsed, active filters)
- react-hook-form + zod: all form validation
```

---

## API INTEGRATION

```typescript
// Base config
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL, // http://localhost:8000
  withCredentials: true,
})

// Interceptor: attach JWT Bearer token
api.interceptors.request.use(config => {
  const token = getCookie('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor: 401 → redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) router.push('/login')
    return Promise.reject(err)
  }
)
```

---

# ═══════════════════════════════════════════════
# BACKEND PROMPT
# ═══════════════════════════════════════════════

## Tech Stack
- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy 2.0 (async)
- **Database:** PostgreSQL (NeonDB via asyncpg)
- **Auth:** JWT (python-jose + passlib bcrypt)
- **Reports:** ReportLab (PDF), openpyxl (Excel)
- **ESP32 Communication:** REST endpoint (JSON over HTTP)
- **Migrations:** Alembic
- **Environment:** python-dotenv

---

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app init, CORS, routers
│   ├── config.py                  # Settings (env vars)
│   ├── database.py                # Async engine + session
│   ├── models/
│   │   ├── employee.py
│   │   ├── attendance.py
│   │   ├── leave.py
│   │   └── payroll.py
│   ├── schemas/
│   │   ├── employee.py
│   │   ├── attendance.py
│   │   ├── leave.py
│   │   └── payroll.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── employees.py
│   │   ├── attendance.py
│   │   ├── leave.py
│   │   ├── payroll.py
│   │   ├── reports.py
│   │   └── device.py              # ESP32 endpoint
│   ├── services/
│   │   ├── payroll_service.py     # Salary calculation logic
│   │   ├── attendance_service.py  # Working hours logic
│   │   ├── pdf_service.py         # Payslip PDF generation
│   │   └── excel_service.py       # Report Excel export
│   ├── dependencies/
│   │   └── auth.py                # JWT decode, get_current_user
│   └── utils/
│       └── time_utils.py          # Time calculations
├── alembic/
├── .env
└── requirements.txt
```

---

## Database Models

### `models/employee.py`
```python
class Employee(Base):
    __tablename__ = "employees"

    employee_id = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(100), nullable=False)
    email       = Column(String(150), unique=True, nullable=False)
    phone       = Column(String(20))
    department  = Column(String(100))
    designation = Column(String(100))
    salary      = Column(Numeric(12, 2), nullable=False)
    fingerprint_id = Column(Integer, unique=True)   # ID stored in sensor
    joining_date   = Column(Date, default=date.today)
    is_active      = Column(Boolean, default=True)
    hashed_password = Column(String)                # for web login
    role            = Column(String(20), default="employee")  # "admin" | "employee"
    created_at      = Column(DateTime, default=datetime.utcnow)

    # Relationships
    attendances = relationship("Attendance", back_populates="employee")
    leaves      = relationship("Leave", back_populates="employee")
    payrolls    = relationship("Payroll", back_populates="employee")
```

### `models/attendance.py`
```python
class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id  = Column(Integer, primary_key=True, autoincrement=True)
    employee_id    = Column(Integer, ForeignKey("employees.employee_id"), nullable=False)
    date           = Column(Date, nullable=False)
    check_in       = Column(DateTime)
    check_out      = Column(DateTime)
    working_hours  = Column(Numeric(4, 2))     # computed on check-out
    overtime_hours = Column(Numeric(4, 2), default=0)
    status         = Column(
        Enum("present","absent","late","half_day","leave","wfh",
             name="attendance_status"),
        default="absent"
    )
    source         = Column(String(20), default="biometric")  # "biometric" | "manual"
    created_at     = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="attendances")
```

### `models/leave.py`
```python
class Leave(Base):
    __tablename__ = "leaves"

    leave_id        = Column(Integer, primary_key=True, autoincrement=True)
    employee_id     = Column(Integer, ForeignKey("employees.employee_id"), nullable=False)
    leave_type      = Column(
        Enum("casual","sick","paid","unpaid", name="leave_type_enum"), nullable=False
    )
    start_date      = Column(Date, nullable=False)
    end_date        = Column(Date, nullable=False)
    reason          = Column(Text)
    approval_status = Column(
        Enum("pending","approved","rejected", name="leave_status"),
        default="pending"
    )
    approved_by     = Column(Integer, ForeignKey("employees.employee_id"))
    created_at      = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="leaves")
```

### `models/payroll.py`
```python
class Payroll(Base):
    __tablename__ = "payroll"

    payroll_id       = Column(Integer, primary_key=True, autoincrement=True)
    employee_id      = Column(Integer, ForeignKey("employees.employee_id"), nullable=False)
    month            = Column(Integer, nullable=False)    # 1–12
    year             = Column(Integer, nullable=False)
    working_days     = Column(Integer)    # total working days in month
    present_days     = Column(Integer, default=0)
    absent_days      = Column(Integer, default=0)
    leave_days       = Column(Integer, default=0)
    overtime_hours   = Column(Numeric(6, 2), default=0)
    basic_salary     = Column(Numeric(12, 2))
    overtime_pay     = Column(Numeric(12, 2), default=0)
    deductions       = Column(Numeric(12, 2), default=0)
    final_salary     = Column(Numeric(12, 2))
    is_paid          = Column(Boolean, default=False)
    generated_at     = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="payrolls")
```

---

## API Endpoints

### Auth — `/api/auth`
```
POST /api/auth/login
  Body: { email: str, password: str }
  Response: { access_token: str, token_type: "bearer", role: str, employee_id: int }

POST /api/auth/logout
  Clears session/token

GET /api/auth/me
  Returns current user info (requires JWT)
```

### Employees — `/api/employees` (Admin only)
```
GET    /api/employees               — list all, supports ?department=&search=&page=&size=
POST   /api/employees               — create employee
GET    /api/employees/{id}          — get single employee details
PUT    /api/employees/{id}          — update employee
DELETE /api/employees/{id}          — soft delete (set is_active=False)
GET    /api/employees/{id}/summary  — attendance + payroll summary
```

### Attendance — `/api/attendance`
```
GET  /api/attendance                — list with filters: ?date=&employee_id=&status=&page=
GET  /api/attendance/today          — today's attendance for all employees
GET  /api/attendance/live           — live feed (last 20 events)
GET  /api/attendance/{employee_id}  — employee's attendance history
POST /api/attendance/manual         — admin manual entry
PUT  /api/attendance/{id}           — admin override (correct wrong entry)
GET  /api/attendance/stats/today    — { total, present, absent, late, leave }
```

### Device Endpoint — `/api/device` (ESP32)
```
POST /api/device/checkin
  Body: { fingerprint_id: int, device_id: str, timestamp: str }
  Logic:
    1. Lookup employee by fingerprint_id
    2. Check if attendance record exists for today
    3. If no record → create with check_in = now, status = "present" (or "late" if > 9:30am)
    4. If record exists and no check_out → update check_out = now, calc working_hours + overtime
    5. Return: { employee_name, status, message }
  Auth: API key header (X-Device-Key) instead of JWT

POST /api/device/register_fingerprint
  Body: { employee_id: int, fingerprint_id: int, device_id: str }
  Registers fingerprint mapping (admin action, initiated from device)
```

### Leave — `/api/leave`
```
GET  /api/leave                          — list leaves (admin: all; employee: own)
POST /api/leave/request                  — employee submits leave request
GET  /api/leave/{id}                     — get single leave request
PUT  /api/leave/{id}/approve             — admin approves (sets approved_by)
PUT  /api/leave/{id}/reject              — admin rejects
GET  /api/leave/balance/{employee_id}    — remaining leave days by type
```

### Payroll — `/api/payroll`
```
POST /api/payroll/generate/{year}/{month}
  Logic (payroll_service.py):
    For each active employee:
      - Count present_days, absent_days, leave_days from attendance table
      - Sum overtime_hours
      - daily_rate = salary / working_days_in_month
      - overtime_pay = overtime_hours * (daily_rate / 8) * 1.5
      - deductions = absent_days * daily_rate
      - final_salary = salary + overtime_pay - deductions
      - Upsert into payroll table

GET  /api/payroll                        — list with ?month=&year=&employee_id=
GET  /api/payroll/{employee_id}/{year}/{month}  — single employee payroll
PUT  /api/payroll/{id}/mark_paid         — mark as paid
GET  /api/payroll/payslip/{payroll_id}   — download PDF payslip (binary response)
```

### Reports — `/api/reports`
```
GET /api/reports/attendance/daily?date=YYYY-MM-DD&department=
  Response: JSON + optional ?format=pdf|excel download

GET /api/reports/attendance/monthly?month=&year=&employee_id=
  Returns: present_days, absent_days, leave_days, overtime per employee

GET /api/reports/payroll?month=&year=
  Returns: payroll summary per employee

All report endpoints support ?format=json|pdf|excel query param.
For PDF/Excel, set appropriate Content-Type and Content-Disposition headers.
```

---

## Business Logic

### `services/attendance_service.py`
```python
STANDARD_START = time(9, 0)     # 9:00 AM
LATE_THRESHOLD  = time(9, 30)   # Late if after 9:30 AM
STANDARD_HOURS  = Decimal("8.0")

def determine_status(check_in_time: time) -> str:
    if check_in_time <= STANDARD_START:
        return "present"
    elif check_in_time <= LATE_THRESHOLD:
        return "present"
    else:
        return "late"

def calculate_hours(check_in: datetime, check_out: datetime) -> tuple[Decimal, Decimal]:
    delta = check_out - check_in
    total_hours = Decimal(str(round(delta.seconds / 3600, 2)))
    working = total_hours - Decimal("1.0")  # subtract 1hr lunch
    working = max(working, Decimal("0"))
    overtime = max(working - STANDARD_HOURS, Decimal("0"))
    return working, overtime

def get_working_days_in_month(year: int, month: int) -> int:
    # Returns count of Mon–Sat (excludes Sundays)
    ...
```

### `services/payroll_service.py`
```python
async def generate_payroll(year: int, month: int, db: AsyncSession):
    employees = await db.execute(select(Employee).where(Employee.is_active == True))
    working_days = get_working_days_in_month(year, month)

    for emp in employees.scalars():
        records = await get_attendance_for_month(emp.employee_id, year, month, db)

        present  = sum(1 for r in records if r.status in ("present", "late", "half_day"))
        absent   = working_days - present
        leaves   = sum(1 for r in records if r.status == "leave")
        ot_hours = sum(r.overtime_hours or 0 for r in records)

        daily_rate   = emp.salary / working_days
        overtime_pay = Decimal(str(ot_hours)) * (daily_rate / 8) * Decimal("1.5")
        deductions   = Decimal(str(absent)) * daily_rate
        final_salary = emp.salary + overtime_pay - deductions

        # Upsert payroll record
        ...
```

### `services/pdf_service.py`
```python
# Uses ReportLab to generate styled payslip PDF
# Payslip layout:
#   Header: Company logo + name
#   Employee info table
#   Salary breakdown table:
#     | Basic Salary      | ₹30,000 |
#     | Overtime Pay (+)  | ₹2,000  |
#     | Deductions (-)    | ₹500    |
#     | Net Salary        | ₹31,500 |
#   Footer: Generated date + HR signature line

def generate_payslip_pdf(payroll: Payroll, employee: Employee) -> bytes:
    buffer = BytesIO()
    # ... ReportLab code ...
    return buffer.getvalue()
```

---

## Authentication & Authorization

### JWT Flow
```python
# dependencies/auth.py

SECRET_KEY = settings.JWT_SECRET
ALGORITHM  = "HS256"
EXPIRE_MIN = 60 * 8  # 8 hours

def create_access_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(minutes=EXPIRE_MIN)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Employee:
    ...decode + fetch employee...

def require_admin(user: Employee = Depends(get_current_user)) -> Employee:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user
```

### Route Protection Example
```python
@router.post("/generate/{year}/{month}")
async def generate_payroll(
    year: int, month: int,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)   # admin-only
):
    ...
```

---

## ESP32 Device Key Auth
```python
DEVICE_API_KEY = settings.DEVICE_API_KEY  # env var

def verify_device_key(x_device_key: str = Header(...)):
    if x_device_key != DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device key")
```

---

## CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Environment Variables (`.env`)
```
DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname
JWT_SECRET=your_super_secret_key_here
JWT_ALGORITHM=HS256
DEVICE_API_KEY=esp32_device_secret_key
STANDARD_WORK_HOURS=8
LATE_THRESHOLD_MINUTES=30
OT_MULTIPLIER=1.5
FRONTEND_URL=http://localhost:3000
```

---

## ESP32 Arduino Code Snippet (reference for device endpoint)
```cpp
// ESP32 sends this JSON to backend on fingerprint scan
void sendAttendance(int fingerprintId) {
  HTTPClient http;
  http.begin("http://YOUR_SERVER/api/device/checkin");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  String body = "{\"fingerprint_id\":" + String(fingerprintId) +
                ",\"device_id\":\"esp32-01\"}";

  int code = http.POST(body);
  String response = http.getString();
  // Parse response, show name on OLED, beep buzzer
  http.end();
}
```

---

## Requirements
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
alembic==1.13.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
python-dotenv==1.0.1
reportlab==4.1.0
openpyxl==3.1.2
pydantic==2.7.1
pydantic-settings==2.2.1
httpx==0.27.0
```

---

*Generated from: Smart_Employee_Attendance___Payroll_Management_System.docx*
