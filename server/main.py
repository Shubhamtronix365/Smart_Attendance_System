"""
Smart Attendance System - FastAPI Backend
Main application entry point.
"""
import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import engine
from server.routes.auth import router as auth_router
from server.routes.employees import router as employees_router
from server.routes.attendance import router as attendance_router
from server.routes.device import router as device_router
from server.routes.leave import router as leave_router
from server.routes.payroll import router as payroll_router
from server.routes.reports import router as reports_router
from server.routes.settings import router as settings_router
from server.routes.database import router as database_router
from server.routes.websocket import router as websocket_router

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart_attendance")

app = FastAPI(
    title="Smart Attendance System API",
    description="IoT-powered biometric attendance & payroll management system",
    version="1.0.0",
)

# CORS Configuration
origins = [
    settings.FRONTEND_URL,
    "https://smart-attendance-system.shubham-tronix365.workers.dev",
    "http://localhost:3000",  # Next.js dev server default
    "http://127.0.0.1:3000",
    "http://172.20.176.83:3000",
    "http://172.20.176.83:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https:\/\/.*(\.pages\.dev|\.workers\.dev)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handlers
from sqlalchemy.exc import IntegrityError

@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    logger.error(f"Database IntegrityError caught: {str(exc)}", exc_info=True)
    resp = JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "A database constraint violation occurred (e.g. duplicate email, RFID card, or fingerprint slot)."}
    )
    origin = request.headers.get("origin")
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Methods"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global error handler caught: {str(exc)}", exc_info=True)
    resp = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred on the server. Please try again later."}
    )
    origin = request.headers.get("origin")
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Methods"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp

# Lifespan events
@app.on_event("startup")
async def startup_event():
    logger.info("Starting up Smart Attendance System API...")
    # Verify database connection
    try:
        from sqlalchemy import text, update
        from server.database.connection import async_session_maker
        from server.models import Employee
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
            # Auto-clean slots held by soft-deleted records from previous sessions
            await session.execute(
                update(Employee)
                .where(Employee.is_active == False)
                .values(fingerprint_id=None, rfid_uid=None)
            )
            # Auto-ensure new columns exist in PostgreSQL
            column_updates = [
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(10,2) DEFAULT 0;",
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS late_deduction_rate NUMERIC(10,2) DEFAULT 0;",
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS late_deduction_type VARCHAR(30) DEFAULT 'per_day';",
                "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;",
                "ALTER TABLE payroll ADD COLUMN IF NOT EXISTS late_days INTEGER DEFAULT 0;",
                "ALTER TABLE payroll ADD COLUMN IF NOT EXISTS late_deduction NUMERIC(12,2) DEFAULT 0;",
                "ALTER TABLE payroll ADD COLUMN IF NOT EXISTS bonus NUMERIC(12,2) DEFAULT 0;",
                "ALTER TABLE payroll ADD COLUMN IF NOT EXISTS remarks VARCHAR(255);",
            ]
            for col_sql in column_updates:
                try:
                    await session.execute(text(col_sql))
                except Exception:
                    pass
            await session.commit()
        logger.info("Successfully connected to database, verified columns, and released inactive sensor slots.")
    except Exception as e:
        logger.critical(f"Database connection failed during startup: {str(e)}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down API. Disposing engine...")
    await engine.dispose()
    logger.info("Engine disposed.")

# Mount Routers under /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(employees_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(device_router, prefix="/api")
app.include_router(leave_router, prefix="/api")
app.include_router(payroll_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(database_router, prefix="/api")
app.include_router(websocket_router)

@app.get("/")
async def root():
    return {
        "message": "Smart Attendance System API is running",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }

@app.api_route("/health", methods=["GET", "HEAD"])
@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check():
    """
    Health check & keep-alive wake-up endpoint.
    Designed for periodic cron jobs (e.g. cron-job.org, UptimeRobot, Render pinger)
    to keep the backend server and PostgreSQL connection pool alive.
    """
    from datetime import datetime, timezone
    from sqlalchemy import text
    from server.database.connection import async_session_maker

    db_status = "connected"
    db_latency_ms = None
    try:
        start_t = datetime.now(timezone.utc)
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        db_latency_ms = round((datetime.now(timezone.utc) - start_t).total_seconds() * 1000, 2)
    except Exception as e:
        logger.warning(f"Health check DB ping warning: {str(e)}")
        db_status = f"unreachable: {str(e)}"

    return {
        "status": "healthy" if "unreachable" not in db_status else "degraded",
        "server": "online",
        "database": db_status,
        "db_latency_ms": db_latency_ms,
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_message": "Smart Attendance System is awake and operational",
        "cron_wakeup": True
    }

