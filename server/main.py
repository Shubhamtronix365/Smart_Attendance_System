"""
Smart Attendance System - FastAPI Backend
Main application entry point.
"""
import time
import uuid
import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import engine
from server.utils.logger import (
    log_info,
    log_warning,
    log_error,
    log_critical,
    log_debug,
    current_request_id,
    get_logger,
)
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
logger = get_logger()

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
    allow_origin_regex=r"^https:\/\/.*(\.pages\.dev|\.workers\.dev|\.vercel\.app|\.onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Observability & Request Correlation Middleware
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    # Extract or generate Request Correlation ID
    req_id = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex[:12]}"
    token = current_request_id.set(req_id)

    start_time = time.perf_counter()
    path = request.url.path
    method = request.method
    client_ip = request.client.host if request.client else "unknown"

    is_health_or_ping = path in ("/ping", "/api/ping", "/health", "/api/health")

    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = req_id

        # High-frequency keep-alive ping monitors logged at DEBUG level to avoid flooding logs
        if is_health_or_ping:
            log_debug("API", "HEALTH_PING", f"Keep-alive ping to {path} handled in {duration_ms}ms.", path=path, status=response.status_code, duration_ms=duration_ms)
        else:
            status_code = response.status_code
            if status_code >= 500:
                log_error("API", "HTTP_SERVER_ERROR", f"HTTP {method} {path} returned server error {status_code} ({duration_ms}ms).", path=path, method=method, status=status_code, duration_ms=duration_ms, client_ip=client_ip, result="SERVER_ERROR")
            elif status_code >= 400:
                log_warning("API", "HTTP_CLIENT_ERROR", f"HTTP {method} {path} returned client error/warning {status_code} ({duration_ms}ms).", path=path, method=method, status=status_code, duration_ms=duration_ms, client_ip=client_ip, result="CLIENT_ERROR")
            else:
                log_info("API", "HTTP_REQUEST_COMPLETED", f"HTTP {method} {path} processed successfully in {duration_ms}ms.", path=path, method=method, status=status_code, duration_ms=duration_ms, client_ip=client_ip, result="SUCCESS")
        return response
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        log_error("API", "HTTP_REQUEST_FAILED", f"Unhandled exception occurred while processing {method} {path}: {str(exc)}", exc_info=exc, path=path, method=method, duration_ms=duration_ms, client_ip=client_ip, result="FAILED")
        raise
    finally:
        current_request_id.reset(token)

# Global Exception Handlers
from sqlalchemy.exc import IntegrityError

@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    log_error(
        "DATABASE",
        "INTEGRITY_VIOLATION",
        f"Database constraint violation caught during request to {request.method} {request.url.path}: {str(exc)}",
        exc_info=exc,
        path=request.url.path,
        method=request.method,
        action="Transaction rolled back",
        result="FAILED"
    )
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
    log_error(
        "SYSTEM",
        "UNEXPECTED_ERROR",
        f"An unexpected error occurred while processing an attendance or API operation: {str(exc)}",
        exc_info=exc,
        path=request.url.path,
        method=request.method,
        error_type=type(exc).__name__,
        reason=str(exc),
        action="Operation failed. Investigation required.",
        result="FAILED"
    )
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
    log_info(
        "SYSTEM",
        "APPLICATION_STARTING",
        "Smart Attendance System backend is starting up and initializing runtime dependencies...",
        action="Initializing system",
        result="IN_PROGRESS"
    )
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
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_type VARCHAR(30) DEFAULT 'per_hour';",
            ]
            for col_sql in column_updates:
                try:
                    await session.execute(text(col_sql))
                except Exception:
                    pass

            # Backfill late_minutes for any existing records where check_in was after 09:00:00 but late_minutes is 0 or null
            try:
                await session.execute(text("""
                    UPDATE attendance 
                    SET late_minutes = EXTRACT(EPOCH FROM (check_in::time - '09:00:00'::time)) / 60
                    WHERE check_in IS NOT NULL 
                      AND check_in::time > '09:00:00'::time 
                      AND (late_minutes IS NULL OR late_minutes = 0);
                """))
            except Exception:
                pass

            await session.commit()
        log_info(
            "SYSTEM",
            "APPLICATION_STARTED",
            "The Smart Attendance System has started successfully.\n\nDatabase: CONNECTED\nBiometric Service: INITIALIZED\nBackground Tasks: RUNNING",
            database="CONNECTED",
            biometric_service="INITIALIZED",
            background_tasks="RUNNING",
            action="Application initialization completed.",
            result="READY"
        )
    except Exception as e:
        log_critical(
            "SYSTEM",
            "STARTUP_FAILED",
            f"Database connection failed during application startup: {str(e)}",
            exc_info=e,
            action="Application startup failed or running in degraded state",
            result="DATABASE_UNREACHABLE",
            next_step="Check Neon PostgreSQL credentials, network reachability, and DATABASE_URL"
        )

@app.on_event("shutdown")
async def shutdown_event():
    log_info(
        "SYSTEM",
        "APPLICATION_SHUTDOWN",
        "Smart Attendance System backend is shutting down gracefully. Disposing database engine and releasing background connections.",
        action="Disposing engine",
        result="SHUTDOWN_COMPLETED"
    )
    await engine.dispose()

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

@app.api_route("/", methods=["GET", "HEAD"])
async def root(request: Request):
    if request.method == "HEAD":
        return Response(status_code=status.HTTP_200_OK)
    return {
        "message": "Smart Attendance System API is running",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }

@app.api_route("/ping", methods=["GET", "HEAD"])
@app.api_route("/api/ping", methods=["GET", "HEAD"])
async def ping(request: Request):
    """
    Ultra-lightweight ping endpoint returning a 2-byte plain text response ('OK').
    Ideal for keep-alive services like cron-job.org, UptimeRobot, or ping monitors
    that enforce strict response size limits.
    """
    if request.method == "HEAD":
        return Response(status_code=status.HTTP_200_OK)
    return PlainTextResponse("OK", status_code=status.HTTP_200_OK)

@app.api_route("/health", methods=["GET", "HEAD"])
@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check(request: Request, format: str = None):
    """
    Health check & keep-alive wake-up endpoint.
    Designed for periodic cron jobs (e.g. cron-job.org, UptimeRobot, Render pinger)
    to keep the backend server and PostgreSQL connection pool alive.
    """
    if request.method == "HEAD":
        return Response(status_code=status.HTTP_200_OK)

    if format in ("text", "plain", "raw"):
        return PlainTextResponse("OK", status_code=status.HTTP_200_OK)

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


