#!/usr/bin/env bash
# ==============================================================================
# SMART ATTENDANCE SYSTEM - 25 STRUCTURED GIT COMMITS
# Copy and paste into terminal (Bash, PowerShell, or Git Bash)
# ==============================================================================

# Commit 1
git add client/package.json client/package-lock.json
git commit -m "build(deps): pin framer-motion to v11.18.2 to resolve webpack runtime chunk conflicts" \
  -m "- Pin framer-motion to 11.18.2 for Next.js 14 compatibility" \
  -m "- Resolve webpack runtime chunk loading exceptions in development mode" \
  -m "- Update package-lock.json with resolved dependency tree"

# Commit 2
git add client/next.config.mjs
git commit -m "chore(next): configure transpilePackages for Framer Motion in next.config.mjs" \
  -m "- Enable transpilePackages for framer-motion to ensure ESM bundle integrity" \
  -m "- Prevent build-time bundle parsing failures on Next.js 14 App Router"

# Commit 3
git add client/src/components/HeroSection.tsx
git commit -m "fix(landing): connect interactive launcher buttons and router paths in HeroSection" \
  -m "- Connect primary CTA buttons directly to Next.js useRouter transitions" \
  -m "- Fix routing on feature cards, admin quick-launchers, and login links" \
  -m "- Ensure smooth page navigation without manual URL entry"

# Commit 4
git add server/models/employee.py
git commit -m "feat(models): add employee_code and unique rfid_uid columns to Employee model" \
  -m "- Add employee_code (VARCHAR 50) for hardware device employee synchronization" \
  -m "- Add rfid_uid (VARCHAR 50, UNIQUE) for contactless smart card authentication" \
  -m "- Establish database constraints preventing duplicate RFID assignments"

# Commit 5
git add server/schemas/employee.py
git commit -m "feat(schemas): update EmployeeBase, EmployeeCreate, and EmployeeUpdate with hardware credentials" \
  -m "- Extend EmployeeBase schema with optional employee_code and rfid_uid" \
  -m "- Support hardware credentials in EmployeeCreate and EmployeeUpdate schemas" \
  -m "- Add input sanitization and uppercase normalization for RFID identifiers"

# Commit 6
git add server/migrations/versions/e7b1a2c3d4e5_add_employee_code_and_rfid_uid.py
git commit -m "feat(db): add alembic migration for employee_code and rfid_uid schema additions" \
  -m "- Create revision e7b1a2c3d4e5 migrating employee schema" \
  -m "- Add index on employee_code and unique constraint on rfid_uid" \
  -m "- Implement reversible downgrade steps for schema rollback"

# Commit 7
git add server/routes/employees.py
git commit -m "feat(employees): persist employee_code and rfid_uid in CRUD database operations" \
  -m "- Update create_employee endpoint to accept and persist hardware identifiers" \
  -m "- Update update_employee endpoint to allow editing biometric and card credentials" \
  -m "- Validate uniqueness of RFID cards across organization profiles"

# Commit 8
git add server/database/connection.py
git commit -m "feat(database): configure Neon DB serverless connection pooling and asyncpg SSL normalization" \
  -m "- Add automatic scheme conversion from postgres:// to postgresql+asyncpg://" \
  -m "- Normalize sslmode query parameters into connect_args for asyncpg driver" \
  -m "- Enable pool_pre_ping=True for resilient Neon DB serverless auto-resume"

# Commit 9
git add server/routes/device.py
git commit -m "feat(device): implement in-memory EnrollmentState and free slot allocator" \
  -m "- Build thread-safe EnrollmentState tracking active interactive hardware sessions" \
  -m "- Add get_next_free_fingerprint_id searching 1-127 slots in PostgreSQL" \
  -m "- Provide atomic session reset and status serialization helpers"

# Commit 10
git add server/routes/websocket.py
git commit -m "feat(websocket): build WebSocket ConnectionManager for web clients and hardware devices" \
  -m "- Implement ConnectionManager maintaining active browser and ESP32 sockets" \
  -m "- Add /ws/client endpoint streaming virtual LCD frames and sensor events" \
  -m "- Add /ws/device endpoint handling persistent hardware connection and punches" \
  -m "- Support direct async database check-in processing inside WebSocket loop"

# Commit 11
git add server/main.py
git commit -m "feat(server): mount websocket router and configure Cloudflare Pages CORS regex pattern" \
  -m "- Mount websocket_router on root path for /ws/client and /ws/device" \
  -m "- Add allow_origin_regex pattern matching https://*.pages.dev" \
  -m "- Enable smooth cross-origin communication between Cloudflare and Render"

# Commit 12
git add server/tests/test_device.py
git commit -m "test(device): create unit test suite for device checkin and enrollment endpoints" \
  -m "- Add pytest tests verifying /api/device/enroll/status response schema" \
  -m "- Test session cancellation endpoint returning cancelled status" \
  -m "- Verify 403 Forbidden enforcement on check-in requests lacking X-Device-Key"

# Commit 13
git add server/tests/test_websocket.py
git commit -m "test(websocket): implement unit tests for WebSocket connection manager and event routing" \
  -m "- Add test suite verifying ConnectionManager initial state" \
  -m "- Verify safe disconnection handling for unmapped devices" \
  -m "- Validate message delivery mechanics across client pools"

# Commit 14
git add server/.env.example
git commit -m "docs(backend): provide .env.example with Neon DB, JWT, and Render configuration templates" \
  -m "- Document DATABASE_URL connection string formatting for Neon DB and local setup" \
  -m "- Specify JWT secret key, device authentication key, and policy settings" \
  -m "- Add FRONTEND_URL placeholder for Cloudflare Pages domains"

# Commit 15
git add client/src/services/api.ts
git commit -m "feat(api): expand client API service with deviceApi enrollment and hardware sync methods" \
  -m "- Add startEnrollment, getEnrollmentStatus, cancelEnrollment, and finalizeEnrollment" \
  -m "- Integrate deviceApi namespace with typed parameters and responses" \
  -m "- Connect Axios client instance with automatic JWT header attachment"

# Commit 16
git add client/src/components/HardwareEnrollmentModal.tsx
git commit -m "feat(modal): build 4-step hardware enrollment wizard with cyber-styled UI" \
  -m "- Create interactive modal featuring high-tech glassmorphism and cyan neon styling" \
  -m "- Design 4-step stepper wizard (Identity, Biometrics, RFID, Company Profile)" \
  -m "- Provide animated fingerprint radar scanner and RFID tap feedback"

# Commit 17
git add client/src/app/admin/employees/page.tsx
git commit -m "feat(employees-ui): display hardware biometric badges and add Smart Enroll launcher button" \
  -m "- Display cyan FP #ID badge and purple RFID UID badge in employee directory table" \
  -m "- Add prominent 'Smart Enroll (ESP32 Tronix)' launcher button in toolbar" \
  -m "- Integrate HardwareEnrollmentModal into employee state management lifecycle"

# Commit 18
git add client/.env.example
git commit -m "docs(frontend): create .env.example for Cloudflare Pages with API and WebSocket endpoints" \
  -m "- Document NEXT_PUBLIC_API_URL configuration pointing to Render backend" \
  -m "- Document NEXT_PUBLIC_WS_URL configuration pointing to Render wss:// endpoint" \
  -m "- Provide local development fallback variable defaults"

# Commit 19
git add firmware/attendace_device_tronix.ino
git commit -m "feat(firmware): add reference Tronix embedded firmware for R307S, RC522, LCD, and RTC" \
  -m "- Provide standalone reference Arduino firmware sketch" \
  -m "- Define hardware pinouts for R307S, RC522, 16x2 LCD, DS3231 RTC, and buzzer" \
  -m "- Include local NVS storage and Serial Monitor interactive enrollment"

# Commit 20
git add firmware/attendace_device_tronix_wifi.ino
git commit -m "feat(firmware): implement Wi-Fi HTTP client firmware for automated polling and attendance punch" \
  -m "- Add WiFi.h and HTTPClient.h communication targeting local backend LAN IP" \
  -m "- Replace Serial enrollment with automated polling of /api/device/enroll/poll" \
  -m "- Stream sensor step events to /api/device/enroll/step and attendance punches"

# Commit 21
git add firmware/attendace_device_tronix_ws.ino
git commit -m "feat(firmware): build production WebSocket client firmware with keepalive and SSL support" \
  -m "- Implement persistent outbound WebSocket client using WebSocketsClient library" \
  -m "- Enable zero-latency communication across different Wi-Fi networks and mobile hotspots" \
  -m "- Support wss:// encryption on port 443 for Render cloud deployment" \
  -m "- Add 25-second keepalive ping keeping Render server instances awake 24/7"

# Commit 22
git add firmware/README.md
git commit -m "docs(firmware): author hardware wiring, GPIO pinout mapping, and sensor documentation" \
  -m "- Create comprehensive wiring matrix for ESP32, R307S, RC522, LCD, and RTC" \
  -m "- Document operating voltage levels, communication protocols, and pin assignments" \
  -m "- List required Arduino library dependencies with installation instructions"

# Commit 23
git add render.yaml
git commit -m "ci(deploy): add Render Blueprint render.yaml for 1-click cloud backend deployment" \
  -m "- Define Render Web Service blueprint specification for Python 3.11" \
  -m "- Automate build pipeline running pip install and alembic upgrade head" \
  -m "- Configure dynamic \$PORT binding and production environment variable hooks"

# Commit 24
git add Dockerfile
git commit -m "ci(docker): create multi-stage production Dockerfile for containerized deployment" \
  -m "- Construct python:3.11-slim container image with build tools and dependencies" \
  -m "- Package backend application code and database migration environment" \
  -m "- Expose container port and configure startup command executing alembic and uvicorn"

# Commit 25
git add README.md firmware/esp32_attendance.ino
git commit -m "docs(readme): author comprehensive documentation including ESP32 hardware and cloud deployment guide" \
  -m "- Document hardware integration and bidirectional WebSocket synchronization architecture" \
  -m "- Author end-to-end production deployment guide for Neon DB, Render, and Cloudflare Pages" \
  -m "- Add step-by-step instructions for remote WAN access, free tunneling, and firmware setup"

# Final push command:
# git push origin main
