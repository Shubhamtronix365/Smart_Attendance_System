# Smart Attendance & Payroll Management System

An IoT-powered Smart Attendance System using ESP32 biometric fingerprint sensors, real-time tracking, and automated payroll calculations. Built with Next.js 14 (App Router) on the frontend and FastAPI on the backend, utilizing a PostgreSQL database.

---

## Features

- 🔐 **Fingerprint Authentication** via ESP32 + biometric sensor.
- 📡 **Real-time Attendance Tracking** with automated check-in status (present, late) and checkout overtime calculations.
- 💰 **Auto Payroll Calculation** based on monthly attendance records, overtime allowances, deductions, and approved leaves.
- 📊 **Dashboard Analytics** with interactive weekly and monthly charts.
- 🌑 **Immersive 3D Hero UI** with glassmorphism, neon accents, and particle fields.
- 🔒 **Secure JWT Authentication** stored in HTTPOnly cookies or Bearer tokens.
- 📥 **Exports and Payslips** including professional PDF payslips generated via ReportLab and Excel sheet logs generated via openpyxl.

---

## Tech Stack

| Layer     | Technology                                                      |
|-----------|------------------------------------------------------------------|
| Frontend  | Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Animation | Framer Motion, Three.js (@react-three/fiber + @react-three/drei) |
| Charts    | Recharts                                                         |
| HTTP      | Axios                                                            |
| Backend   | FastAPI, Python 3.11+                                            |
| Database  | PostgreSQL (accessed using pgAdmin / SQLAlchemy asyncpg)          |
| Migration | Alembic async migrations                                         |
| Reports   | ReportLab (PDF), openpyxl (Excel)                                |

---

## Folder Structure

```
Smart_Attendance_System/
├── client/                  # Next.js 14 Frontend
│   └── src/
│       ├── app/             # App Router pages
│       ├── components/      # Reusable UI components
│       ├── services/        # Axios API services
│       ├── hooks/           # Custom React hooks
│       └── assets/          # Images, fonts
├── server/                  # FastAPI Backend
│   ├── main.py              # FastAPI app initialization, CORS, exception handlers
│   ├── config.py            # Pydantic Settings class
│   ├── database/
│   │   └── connection.py    # Async db engine, sessionmaker, Base class, get_db
│   ├── models/              # SQLAlchemy models (Employee, Attendance, Leave, Payroll)
│   ├── schemas/             # Pydantic request/response validation schemas
│   ├── routes/              # FastAPI router modules (auth, employees, attendance, leave, payroll, reports, device)
│   ├── services/            # Core services (attendance_service, payroll_service, pdf_service, excel_service)
│   ├── dependencies/        # Route dependencies (auth, role guard, device key guard)
│   ├── utils/               # Helper utilities (time calculations)
│   └── migrations/          # Alembic async migration environment
├── myenv/                   # Python virtual environment (NOT committed)
├── requirements.txt         # Backend libraries
├── alembic.ini              # Alembic config file
├── .gitignore
└── README.md
```

---

## Setup Instructions

### Prerequisites
- Node.js >= 18
- Python >= 3.11
- PostgreSQL Server & pgAdmin

### Backend Setup

1. **Activate Virtual Environment:**
   ```powershell
   # Windows (Powershell)
   .\myenv\Scripts\activate
   
   # Linux/Mac
   source myenv/bin/activate
   ```

2. **Install Python Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `server/.env` file in the `server` directory:
   ```env
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/smart_attendance
   JWT_SECRET=your_jwt_secret_key_here
   JWT_ALGORITHM=HS256
   DEVICE_API_KEY=esp32_device_secret_key
   STANDARD_WORK_HOURS=8
   LATE_THRESHOLD_MINUTES=30
   OT_MULTIPLIER=1.5
   FRONTEND_URL=http://localhost:3000
   ```
   *(Update `DATABASE_URL` with your actual pgAdmin PostgreSQL username, password, host, and port)*

4. **Create the Database:**
   Open pgAdmin, connect to your PostgreSQL instance, and create a database named `smart_attendance`.

5. **Run Migrations:**
   With the virtual environment activated, run:
   ```bash
   alembic upgrade head
   ```

6. **Start the FastAPI Server:**
   ```bash
   cd server
   uvicorn main:app --reload
   ```
   API is accessible at `http://127.0.0.1:8000`. Swagger docs are at `http://127.0.0.1:8000/docs`.

### Frontend Setup
1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Install Node packages:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   Frontend is accessible at `http://localhost:3000`.

---

## Run Commands

- **Run Backend:** `uvicorn main:app --reload` (inside `server/`)
- **Run Frontend:** `npm run dev` (inside `client/`)
- **Run Migrations:** `alembic upgrade head` (from project root)
- **Run Tests:** `python -m pytest server/tests/` (from project root with active virtual env)


---

## Installed Libraries

### Backend (Python)
- `fastapi` & `uvicorn` — Web server & API routing
- `sqlalchemy` & `asyncpg` — Async PostgreSQL ORM and database driver
- `alembic` — Database migrations
- `python-jose` & `passlib` — JWT token generation & bcrypt password hashing
- `pydantic` & `pydantic-settings` — Data validation and configuration management
- `reportlab` — PDF generation (payslips)
- `openpyxl` — Excel spreadsheet creation (reports)
- `httpx` — Asynchronous HTTP clients

---

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (asyncpg driver format).
- `JWT_SECRET`: Random hash key used to sign session cookies and headers.
- `JWT_ALGORITHM`: Cryptographic signature format (e.g., HS256).
- `DEVICE_API_KEY`: API key header string verified by the ESP32 hardware client.
- `STANDARD_WORK_HOURS`: Daily standard shift duration (default 8).
- `LATE_THRESHOLD_MINUTES`: Grace period minutes before check-in is considered late.
- `OT_MULTIPLIER`: Work overtime rate factor (default 1.5).
- `FRONTEND_URL`: CORS origin allowed for the Next.js app.

---

## API Details

### Authentication
- `POST /api/auth/login` — Log in employee and set HTTPOnly token cookie.
- `POST /api/auth/logout` — Clear session token.
- `GET /api/auth/me` — Return current logged-in employee profile (JWT required).

### Employees (Admin only)
- `GET /api/employees` — List all active employees (supports pagination, search, and department filters).
- `POST /api/employees` — Create new employee profile.
- `GET /api/employees/{id}` — Get employee details.
- `PUT /api/employees/{id}` — Update employee details.
- `DELETE /api/employees/{id}` — Soft delete (sets `is_active=False`).
- `GET /api/employees/{id}/summary` — Overview of attendance logs and payroll.

### Attendance
- `GET /api/attendance` — Get history (employees get own, admins get all; supports filters).
- `GET /api/attendance/today` — Active check-ins logged for the current date.
- `GET /api/attendance/live` — Feed of the last 20 check-in/out events.
- `POST /api/attendance/manual` — Manually insert attendance log (Admin only).
- `PUT /api/attendance/{id}` — Override existing check-in/out entry (Admin only).
- `GET /api/attendance/stats/today` — Metrics summary counts for today's logs (Admin only).

### Biometric ESP32 Device
- `POST /api/device/checkin` — biometrics scanner check-in/checkout event receiver (Device key required).
- `POST /api/device/register_fingerprint` — Map fingerprint scanner slots to employee IDs.

### Leaves
- `GET /api/leave` — List leaves.
- `POST /api/leave/request` — Submit leave request.
- `GET /api/leave/{id}` — Get single leave request details.
- `PUT /api/leave/{id}/approve` — Approve pending request (Admin only).
- `PUT /api/leave/{id}/reject` — Reject pending request (Admin only).
- `GET /api/leave/balance/{employee_id}` — Remaining balances for leave categories.

### Payroll
- `POST /api/payroll/generate/{year}/{month}` — Generate payroll for all active employees (Admin only).
- `GET /api/payroll` — List payroll summary lines.
- `PUT /api/payroll/{id}/mark_paid` — Mark payroll line item status as paid/unpaid (Admin only).
- `GET /api/payroll/payslip/{payroll_id}` — Binary PDF payslip download.

### Reports (Admin only)
- `GET /api/reports/attendance/daily` — Daily attendance report (JSON, Excel, or PDF format).
- `GET /api/reports/attendance/monthly` — Monthly attendance report (JSON, Excel, or PDF format).
- `GET /api/reports/payroll` — Monthly payroll summary report (JSON, Excel, or PDF format).

### System Settings (Admin only)
- `GET /api/settings` — Retrieve standard shift window hours, late grace threshold, overtime pay multiplier, and ESP32 authorization key.
- `PUT /api/settings` — Dynamically update active settings in-memory and write changes to the `.env` configuration file.

---

## Future Scope

- **Mobile App Companion:** React Native client for mobile requests and notifications.
- **Biometric Face Recognition:** Secondary validation layer to prevent proxy check-ins.
- **AI Anomaly Engine:** Auto flagging of inconsistent biometric check-ins.
- **Multi-Branch Centralization:** Support tracking across distinct geographic centers.