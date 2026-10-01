# Smart Attendance & Payroll Management System

An IoT-powered Smart Attendance System using ESP32 biometric fingerprint sensors, real-time tracking, and automated payroll calculations. Built with Next.js 14 (App Router) on the frontend and FastAPI on the backend, utilizing a PostgreSQL database.

---

## Features

- 🔐 **Fingerprint & RFID Authentication** via ESP32 Tronix hardware (R307S sensor + RC522 reader).
- 💾 **Offline-First Flash Queue (Preferences.h):** Punches are stored in internal NVS Flash when Wi-Fi is unavailable and automatically synced when reconnected. Records are deleted from ESP32 Flash **only after cloud acknowledgment (`punch_ack`)**.
- ⏱️ **1-Hour Anti-Bounce Rule:** First punch marks Check-In. Any subsequent punch within 1 hour shows *"Already Marked!"* with warning beeps to prevent false double triggers; punches after 1 hour register Check-Out.
- 🕒 **Autonomous DS3231 RTC Clock & Local Name Display:** Employee roster is permanently cached in ESP32 Flash; scanning an employee displays their Name and accurate RTC time on the 16x2 LCD with **zero dependency on Wi-Fi or server**.
- 📡 **Real-time Attendance Tracking & Shift Rules:** Standard 9:00 AM – 5:00 PM shift schedule. Any login after 9:00 AM is logged as `LATE` and displays exact elapsed late minutes/hours. Shifts automatically deduct a **1-hour free lunch break** from total duration (net 7h standard work day), computing overtime past 7 net hours.
- ⚙️ **Per-Employee Custom Penalty & OT Rates:** Admin can configure individual overtime rates (₹/hr) and late arrival penalties (e.g. ₹300 or ₹500 per day or per hour) for each employee separately in their profile.
- 🧮 **Interactive Manual Payroll Calculator:** Dedicated admin modal allowing live calculation previews (`/preview/{id}`), manual adjustments of working/present/late days, overtime pay, bonuses, late deductions, and custom audit remarks with instant net salary recalculation and permanent saving (`/manual-save`).
- 🗑️ **Full Hardware & Cloud Sync Management:** Add, Edit, Delete specific employee, or **Delete All Employees** (bulk wipe) directly from the Web Admin GUI, propagating immediate sensor deletion commands to hardware.
- 💰 **Auto & Manual Payroll Calculation** based on monthly attendance records, overtime allowances, deductions, and approved leaves.
- 📊 **Dashboard Analytics** with interactive weekly and monthly charts.
- 🌑 **Immersive 3D Hero UI** with glassmorphism, neon accents, and particle fields.
- 🔒 **Secure JWT Authentication** stored in HTTPOnly cookies or Bearer tokens.
- 📥 **Exports and Payslips** including professional PDF payslips generated via ReportLab and Excel sheet logs generated via openpyxl.
- 🔄 **Keep-Alive & Health Check Endpoints (`/health` & `/api/health`):** Dedicated `GET` & `HEAD` keep-alive ping receiver for cron-job websites (e.g. cron-job.org, UptimeRobot, Render pingers) to maintain server uptime, warm up serverless connection pools (`SELECT 1`), and prevent cold-start spin-down delays.
- 📅 **Dual-Mode Attendance Tracking (Today Live vs Historical Month-Wide):**
  - **Today Live Mode:** Dedicated real-time feed showing today's attendance data with WebSocket sync, auto-refresh, live statistics counters, and downloadable daily Excel & PDF exports.
  - **Historical Month Mode:** Automatically loads and displays all attendance data from Day 1 of the chosen month to the end date of that month with check-in, check-out, working hours, status, and full-month downloadable Excel & PDF exports.
- ⏱️ **Detailed Time-by-Time Reports & Logs:** Complete punch-by-punch attendance logs displaying exact check-in and check-out timestamps, hours, late minutes, overtime, and status for each employee, filterable by month or custom date range, and downloadable in Excel (`.xlsx`) and PDF (`.pdf`).

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

### Frontend (NPM)
- `next` (v14.2.35) — React framework with App Router
- `react` & `react-dom` (v18) — Core UI framework
- `framer-motion` (v11.18.2) — Fluid animations and toast transitions
- `three` & `@react-three/fiber` & `@react-three/drei` — 3D interactive hardware canvas
- `lucide-react` — Icon system
- `axios` — HTTP client with interceptors
- `recharts` — Dashboard analytics charts
- `tailwindcss` — Utility-first styling

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
- `GET /api/attendance` — Get history with multi-filter support (`date`, `start_date`, `end_date`, `month`, `year`, `department`, `employee_id`, `status`, `size` up to 1000).
- `GET /api/attendance/export` — Export attendance (single day or full month from day 1 to end date) into Excel (.xlsx) or PDF (.pdf) format with complete check-in / check-out timestamps.
- `GET /api/attendance/today` — Active check-ins logged for the current date.
- `GET /api/attendance/live` — Feed of the last 20 check-in/out events.
- `POST /api/attendance/manual` — Manually insert attendance log (Admin only).
- `PUT /api/attendance/{id}` — Override existing check-in/out entry (Admin only).
- `GET /api/attendance/stats/today` — Metrics summary counts for today's logs (Admin only).

### Health & Keep-Alive Wake-Up (Cron Jobs)
- `GET, HEAD /health` — Keep-alive wake-up ping for cron jobs (e.g. cron-job.org, UptimeRobot, Render pinger). Executes a database ping (`SELECT 1`), keeps PostgreSQL connection pool active, and returns server uptime status and timestamp.
- `GET, HEAD /api/health` — Canonical API health check endpoint matching the same wake-up contract.

### Biometric & RFID ESP32 Tronix Device (WebSocket + REST)
- `ws://<HOST>:8000/ws/device` — Persistent outbound WebSocket connection for ESP32 hardware client. Enables real-time bidirectional messaging from ANY Wi-Fi network, mobile hotspot, or remote office.
- `ws://<HOST>:8000/ws/client` — Real-time WebSocket feed for web browser clients (live LCD mirror, sensor step animations, online status).
- `POST /api/device/checkin` — Dual punch receiver via `fingerprint_id` (1–127) OR `rfid_uid` (X-Device-Key required).
- `POST /api/device/enroll/start` — Initiate interactive hardware enrollment session and reserve next free fingerprint slot.
- `GET /api/device/enroll/poll` — Polled periodically by ESP32 over local Wi-Fi to receive pending enrollment tasks (REST mode).
- `POST /api/device/enroll/step` — State event reporter invoked by ESP32 (scan 1, lift finger, scan 2, store template, scan RFID).
- `GET /api/device/enroll/status` — Live status poll endpoint for the web frontend to render virtual 16x2 LCD and telemetry.
- `POST /api/device/enroll/finalize` — Finalize employee creation with synced hardware fields and custom company details.
- `POST /api/device/enroll/cancel` — Abort active enrollment session and reset device.

### ESP32 Firmware Options & Remote Network Setup
- **Firmware Files:**
  - `firmware/attendace_device_tronix_ws.ino` — **WebSocket Version (Recommended)**: Works across different Wi-Fi networks, mobile hotspots, and remote branch locations with zero-latency full duplex streaming.
  - `firmware/attendace_device_tronix_wifi.ino` — **HTTP REST Version**: Operates via local LAN HTTP polling.
- **Hardware Pinouts:**
  - R307S Fingerprint: `HardwareSerial(2)` on GPIO 16 (RX), GPIO 17 (TX), 57600 baud.
  - RC522 RFID: SPI on SCK 18, MISO 19, MOSI 23, SS 5, RST 4.
  - 16x2 I2C LCD: Address `0x27` on SDA 21, SCL 22.
  - DS3231 RTC: I2C on SDA 21, SCL 22.
  - Buzzer: GPIO 27.
- **How It Works Across Different Wi-Fi Networks:**
  - **Local LAN Mode:** Set `WS_HOST = "172.20.176.83"`, `WS_PORT = 8000`, `USE_SSL = false`.
  - **Remote WAN / Anywhere in the World Mode:**
    1. Start a free public tunnel on your PC:
       ```bash
       # Using ngrok:
       ngrok http 8000
       # Or using Cloudflare Tunnel:
       cloudflared tunnel --url http://localhost:8000
       ```
    2. In `attendace_device_tronix_ws.ino`, set:
       ```cpp
       const char* WS_HOST = "your-subdomain.ngrok-free.app"; // public domain
       const int   WS_PORT = 443;
       const bool  USE_SSL = true;
       ```
    3. The ESP32 can now be connected to mobile hotspot, mobile 4G dongle, or a friend's Wi-Fi miles away, and it will stay connected and push real-time biometric enrollment and punches to your dashboard!

### Leaves
- `GET /api/leave` — List leaves.
- `POST /api/leave/request` — Submit leave request.
- `GET /api/leave/{id}` — Get single leave request details.
- `PUT /api/leave/{id}/approve` — Approve pending request (Admin only).
- `PUT /api/leave/{id}/reject` — Reject pending request (Admin only).
- `DELETE /api/leave/{id}` — Cancel/withdraw leave request (employees withdraw own pending; admins delete any and cleanup attendance).
- `GET /api/leave/my-balance` — Current employee's remaining leave balances for the calendar year.
- `GET /api/leave/balance/{employee_id}` — Remaining balances for leave categories.

### Employee Self-Service
- `GET /api/attendance/my` — Logged-in employee's monthly attendance records.
- `GET /api/attendance/my-stats` — Logged-in employee's monthly present/absent/late/leave statistics.
- `GET /api/payroll/my` — Logged-in employee's payroll and payslip history.
- `GET /api/leave/my-balance` — Logged-in employee's quota balance.

### Payroll
- `POST /api/payroll/generate/{year}/{month}` — Generate payroll for all active employees (Admin only).
- `GET /api/payroll` — List payroll summary lines.
- `GET /api/payroll/my` — List current employee's payslips.
- `GET /api/payroll/preview/{employee_id}` — Preview individual employee's dynamic calculation breakdown (working days, present/late days, overtime pay, custom late deductions) for a specific year and month.
- `POST /api/payroll/manual-save` — Save or override an individual employee's customized payroll line item with bonus, remarks, and net salary.
- `PUT /api/payroll/{id}/mark_paid` — Mark payroll line item status as paid/unpaid (Admin only).
- `GET /api/payroll/payslip/{payroll_id}` — Binary PDF payslip download.

### Reports (Admin only)
- `GET /api/reports/attendance/detailed-logs` — Detailed time-by-time attendance records for each punch across any month or date range, including exact Check-In & Check-Out timestamps, working hours, late minutes, overtime, and status. (Supports JSON, Excel `.xlsx`, and PDF `.pdf` downloads).
- `GET /api/reports/attendance/daily` — Daily attendance report (JSON, Excel, or PDF format).
- `GET /api/reports/attendance/monthly` — Monthly attendance report summary (JSON, Excel, or PDF format).
- `GET /api/reports/payroll` — Monthly payroll summary report (JSON, Excel, or PDF format).


### System Settings (Admin only)
- `GET /api/settings` — Retrieve standard shift window hours, late grace threshold, overtime pay multiplier, and ESP32 authorization key.
- `PUT /api/settings` — Dynamically update active settings in-memory and write changes to the `.env` configuration file.

### Database Vault & Explorer (Admin only)
- `POST /api/database/verify-access` — Re-authenticates administrator with account password to unlock the elevated database vault.
- `GET /api/database/overview` — Live NeonDB serverless database health, PostgreSQL engine version, total storage size, and table row counts.
- `GET /api/database/tables/{table_name}/schema` — Column specifications, SQL data types, primary keys, and nullability.
- `GET /api/database/tables/{table_name}/data` — Paginated and searchable raw table records with column sorting and password hash masking.
- `POST /api/database/query` — Safe, read-only SQL query runner (`SELECT` and `WITH` statements only with query execution metrics).
- `GET /api/database/tables/{table_name}/export` — Direct CSV table export download.

---

## Production Cloud Deployment (Cloudflare + Render + Neon DB)

This application is built for high-performance production hosting across:
- **Database:** [Neon DB](https://neon.tech) (Serverless PostgreSQL with auto-scaling & pooling)
- **Backend:** [Render](https://render.com) (FastAPI web service with native WebSocket support)
- **Frontend:** [Cloudflare Pages](https://pages.cloudflare.com) (Global edge CDN for Next.js 14)
- **IoT Device:** ESP32 Tronix connecting over secure `wss://` from any location

```
+--------------------------+       WSS (Port 443)      +---------------------------------+
|   ESP32 Tronix Device    | ------------------------> |         Render Backend          |
| (Mobile Hotspot/Any WiFi)|                           |     (FastAPI + WebSockets)      |
+--------------------------+                           +---------------------------------+
                                                                  |                ^
                                                   SSL Connection |                | HTTPS & WSS
                                                                  v                |
                                                      +----------------+   +----------------------+
                                                      |    Neon DB     |   |   Cloudflare Pages   |
                                                      | (PostgreSQL)   |   |   (Next.js Frontend) |
                                                      +----------------+   +----------------------+
```

### 1. Database Setup on Neon DB
1. Create a free account at [neon.tech](https://neon.tech) and create a new project.
2. Under **Connection Details**, copy your connection string (e.g., `postgresql://username:password@ep-xyz-pooler.region.neon.tech/neondb?sslmode=require`).
3. *(The backend automatically converts `postgresql://` to `postgresql+asyncpg://` and handles SSL arguments with connection pre-pinging).*

### 2. Backend Deployment on Render
1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** $\rightarrow$ **Blueprint** (or **Web Service**).
   - If using **Blueprint**, select `render.yaml` in this repository for 1-click provisioning!
   - If setting up manually:
     - **Environment:** Python 3
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `sh -c "alembic upgrade head && uvicorn server.main:app --host 0.0.0.0 --port $PORT"`
3. Add the following **Environment Variables** in Render:
   - `DATABASE_URL`: *(Your Neon DB connection string)*
   - `JWT_SECRET`: *(A random 64-character secret string)*
   - `DEVICE_API_KEY`: `esp32_device_secret_key`
   - `FRONTEND_URL`: `https://your-project.pages.dev` *(Your Cloudflare Pages domain)*
4. Once deployed, Render will provide your public URL: `https://your-backend.onrender.com`.

> [!TIP]
> **24/7 Keepalive:** Render's free tier usually spins down after 15 minutes of inactivity. However, because the ESP32 maintains an open WebSocket connection with a 25-second keepalive ping, **your Render instance stays awake 24/7 automatically!**

### 3. Frontend Deployment on Cloudflare Pages / Workers
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) $\rightarrow$ **Compute (Workers & Pages)** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git** (or deploy via Wrangler).
2. Configure build settings:
   - **Option A: Root Directory (Repository Root `/`)**
     - **Build command:** `npm run build` (which runs `npm --prefix client install && npm --prefix client run build`)
     - **Build output directory:** `client/out`
   - **Option B: Subdirectory (`client`)**
     - **Root directory:** `client`
     - **Build command:** `npm run build`
     - **Build output directory:** `out`
3. Under **Environment variables**, add:
   - `NEXT_PUBLIC_API_URL`: `https://smart-attendance-backend-tzp4.onrender.com`
   - `NEXT_PUBLIC_WS_URL`: `wss://smart-attendance-backend-tzp4.onrender.com/ws/client`
4. Deploy! Your web application will be live across Cloudflare's global edge network.

### 4. ESP32 Tronix Firmware Configuration
Open [`firmware/attendace_device_tronix_ws.ino`](file:///c:/Users/Hi/Desktop/Smart_Attendance_System/firmware/attendace_device_tronix_ws.ino) in Arduino IDE:
1. Set your Wi-Fi credentials (can be home Wi-Fi, office Wi-Fi, or mobile 4G hotspot):
   ```cpp
   const char* WIFI_SSID     = "Your_WiFi_Name";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";
   ```
2. Set the Render host under Option 2:
   ```cpp
   const char* WS_HOST       = "your-backend.onrender.com"; // Your Render domain (no https://)
   const int   WS_PORT       = 443;                         // Render SSL port
   const char* WS_PATH       = "/ws/device?device_id=ESP32_TRONIX_01&api_key=esp32_device_secret_key";
   const bool  USE_SSL       = true;                        // Enables wss:// secure encryption
   ```
3. Flash the code to your ESP32 board. The device will connect to your Render cloud server from any location in the world!

---

## Future Scope

- **Mobile App Companion:** React Native client for mobile requests and notifications.
- **Biometric Face Recognition:** Secondary validation layer to prevent proxy check-ins.
- **AI Anomaly Engine:** Auto flagging of inconsistent biometric check-ins.
- **Multi-Branch Centralization:** Support tracking across distinct geographic centers.