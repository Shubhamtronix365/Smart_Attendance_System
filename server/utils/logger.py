"""
Smart Attendance System - Centralized Production Logging Architecture
Provides structured, human-readable, context-correlated, and developer-friendly logging.
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone
from contextvars import ContextVar
from typing import Optional, Any, Dict

# Context variable to hold the correlation request ID per asyncio task
current_request_id: ContextVar[Optional[str]] = ContextVar("current_request_id", default=None)

# Sensitive keys that must be redacted from logs
SENSITIVE_KEYS = {
    "password", "passwd", "token", "access_token", "refresh_token",
    "secret", "secret_key", "jwt_secret", "authorization", "cookie",
    "api_key", "device_api_key", "x_device_key", "biometric_template",
    "private_key", "credential", "credentials"
}

def sanitize_value(key: str, val: Any) -> Any:
    """Masks sensitive values such as passwords, tokens, and secrets."""
    if not isinstance(key, str):
        return val
    k_lower = key.lower().replace("-", "_")
    for s in SENSITIVE_KEYS:
        if s in k_lower:
            return "[REDACTED]"
    return val

def sanitize_dict(d: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively sanitizes dictionary items to ensure zero secret leakage."""
    sanitized = {}
    for k, v in d.items():
        if isinstance(v, dict):
            sanitized[k] = sanitize_dict(v)
        elif isinstance(v, list):
            sanitized[k] = [sanitize_dict(item) if isinstance(item, dict) else sanitize_value(k, item) for item in v]
        else:
            sanitized[k] = sanitize_value(k, v)
    return sanitized


class ProductionLogFormatter(logging.Formatter):
    """
    Structured, executive-grade log formatter.
    Formats logs into clear, human-readable, and searchable blocks:

    [2026-10-30 23:28:42 IST] [INFO] [ATTENDANCE] [BIOMETRIC_CHECK_IN]

    Employee EMP1024 identified successfully.
    Biometric verification passed.
    Attendance check-in recorded at 09:15 AM.

    Employee ID: EMP1024
    Source: BIO_DEVICE_01
    Action: Automatic check-in
    Result: SUCCESS
    """
    def __init__(self, use_json: bool = False):
        super().__init__()
        self.use_json = use_json

    def format(self, record: logging.LogRecord) -> str:
        # Resolve timestamp with IST / UTC notation
        now = datetime.now()
        timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S")

        # Resolve module and event
        custom_mod = getattr(record, "custom_module", None)
        module_name = custom_mod if custom_mod else (record.name.replace("server.", "").upper() if record.name else "SYSTEM")

        custom_evt = getattr(record, "custom_event", None)
        event_name = custom_evt if custom_evt else (record.funcName.upper() if getattr(record, "funcName", None) else "GENERAL_EVENT")
        details: Dict[str, Any] = getattr(record, "custom_details", {})

        # Include Request ID if active
        req_id = current_request_id.get()
        if req_id and "request_id" not in details:
            details["request_id"] = req_id

        # Sanitize metadata details
        clean_details = sanitize_dict(details) if details else {}

        if self.use_json:
            payload = {
                "timestamp": timestamp_str,
                "level": record.levelname,
                "module": module_name,
                "event": event_name,
                "message": record.getMessage(),
                "details": clean_details,
            }
            if record.exc_info:
                payload["exception"] = self.formatException(record.exc_info)
            return json.dumps(payload)

        # Human-Readable Structured Block Format (matches universal prompt format)
        header = f"[{timestamp_str}] {record.levelname} | {module_name} | {event_name}"
        message_body = record.getMessage()

        lines = [header, "", message_body]

        if clean_details:
            lines.append("")
            for k, v in clean_details.items():
                # Format key to Title Case (e.g. employee_id -> Employee ID)
                pretty_key = k.replace("_", " ").title()
                if pretty_key == "Employee Id":
                    pretty_key = "Employee ID"
                elif pretty_key == "Rfid Uid":
                    pretty_key = "RFID UID"
                elif pretty_key == "Fingerprint Id":
                    pretty_key = "Fingerprint ID"
                elif pretty_key == "Request Id":
                    pretty_key = "Request ID"
                lines.append(f"{pretty_key}: {v}")

        if record.exc_info:
            lines.append("")
            lines.append("Stack Trace:")
            lines.append(self.formatException(record.exc_info))

        return "\n".join(lines)


# Configure root smart_attendance logger
_logger = logging.getLogger("smart_attendance")
_logger.setLevel(logging.INFO)

# Avoid duplicate handlers on reload
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setLevel(logging.INFO)
    _handler.setFormatter(ProductionLogFormatter(use_json=os.getenv("LOG_FORMAT", "text").lower() == "json"))
    _logger.addHandler(_handler)
    _logger.propagate = False

def get_logger() -> logging.Logger:
    """Returns the core smart attendance logger."""
    return _logger


def log_event(
    level: int,
    module: str,
    event: str,
    message: str,
    *,
    exc_info: Optional[Any] = None,
    **details: Any
):
    """
    Emits a structured, contextual log event explaining:
    - WHAT happened (event, module)
    - WHY it happened (message)
    - WHAT ACTION WAS TAKEN (action in details)
    - WHAT THE RESULT WAS (result in details)
    """
    clean_details = sanitize_dict(details) if details else {}
    _logger.log(
        level,
        message,
        exc_info=exc_info,
        extra={
            "custom_module": module.upper(),
            "custom_event": event.upper(),
            "custom_details": clean_details,
        }
    )

def log_info(module: str, event: str, message: str, **details: Any):
    """Logs an informational application event."""
    log_event(logging.INFO, module, event, message, **details)

def log_warning(module: str, event: str, message: str, **details: Any):
    """Logs an unexpected condition or rejected attempt that does not halt the application."""
    log_event(logging.WARNING, module, event, message, **details)

def log_error(module: str, event: str, message: str, exc_info: Optional[Any] = None, **details: Any):
    """Logs an operation failure that requires investigation."""
    log_event(logging.ERROR, module, event, message, exc_info=exc_info, **details)

def log_critical(module: str, event: str, message: str, exc_info: Optional[Any] = None, **details: Any):
    """Logs a critical failure affecting application availability or integrity."""
    log_event(logging.CRITICAL, module, event, message, exc_info=exc_info, **details)

def log_debug(module: str, event: str, message: str, **details: Any):
    """Logs fine-grained debugging details useful during development."""
    log_event(logging.DEBUG, module, event, message, **details)
