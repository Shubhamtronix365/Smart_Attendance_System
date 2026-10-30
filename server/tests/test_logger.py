import json
import logging
from io import StringIO
import pytest
from server.utils.logger import (
    ProductionLogFormatter,
    sanitize_dict,
    sanitize_value,
    log_info,
    log_warning,
    log_error,
    log_critical,
    log_debug,
    log_event,
    current_request_id,
    get_logger,
)


def test_secret_sanitization():
    # Passwords and secrets must be masked
    assert sanitize_value("password", "supersecret123") == "[REDACTED]"
    assert sanitize_value("plain_password", "myPass") == "[REDACTED]"
    assert sanitize_value("hashed_password", "$2b$12$e7G...") == "[REDACTED]"
    assert sanitize_value("api_key", "secret-token") == "[REDACTED]"
    assert sanitize_value("jwt_secret", "master-key") == "[REDACTED]"
    assert sanitize_value("token", "eyJhbGciOi...") == "[REDACTED]"

    # Non-sensitive values preserved
    assert sanitize_value("employee_id", "EMP001") == "EMP001"
    assert sanitize_value("employee_name", "John Doe") == "John Doe"

    # Deep dictionary sanitization
    sensitive_dict = {
        "employee_id": "EMP1024",
        "name": "Jane",
        "password": "secretPassword",
        "auth": {
            "token": "secretToken",
            "role": "admin"
        }
    }
    cleaned = sanitize_dict(sensitive_dict)
    assert cleaned["password"] == "[REDACTED]"
    assert cleaned["auth"]["token"] == "[REDACTED]"
    assert cleaned["auth"]["role"] == "admin"
    assert cleaned["employee_id"] == "EMP1024"


def test_production_formatter_human_readable():
    formatter = ProductionLogFormatter(use_json=False)
    record = logging.LogRecord(
        name="server.services.attendance_service",
        level=logging.INFO,
        pathname="attendance_service.py",
        lineno=100,
        msg="Employee attendance successfully recorded through the biometric device.",
        args=(),
        exc_info=None
    )
    record.custom_module = "ATTENDANCE"
    record.custom_event = "BIOMETRIC_CHECK_IN"
    record.custom_details = {
        "employee_id": "EMP1024",
        "source": "Biometric Device",
        "action": "Check-in",
        "result": "SUCCESS",
        "duration": "245ms"
    }

    output = formatter.format(record)

    assert "INFO | ATTENDANCE | BIOMETRIC_CHECK_IN" in output
    assert "Employee attendance successfully recorded through the biometric device." in output
    assert "Employee ID: EMP1024" in output
    assert "Source: Biometric Device" in output
    assert "Action: Check-in" in output
    assert "Result: SUCCESS" in output
    assert "Duration: 245ms" in output


def test_production_formatter_json_mode():
    formatter = ProductionLogFormatter(use_json=True)
    record = logging.LogRecord(
        name="server.routes.device",
        level=logging.WARNING,
        pathname="device.py",
        lineno=50,
        msg="Biometric scan received from device, but the fingerprint does not match.",
        args=(),
        exc_info=None
    )
    record.custom_module = "BIOMETRIC"
    record.custom_event = "IDENTITY_NOT_RECOGNIZED"
    record.custom_details = {
        "employee_id": "UNKNOWN",
        "source": "Biometric Device",
        "action": "Verification",
        "result": "REJECTED",
        "reason": "Fingerprint template not found in database"
    }

    output = formatter.format(record)
    parsed = json.loads(output)

    assert parsed["level"] == "WARNING"
    assert parsed["module"] == "BIOMETRIC"
    assert parsed["event"] == "IDENTITY_NOT_RECOGNIZED"
    assert parsed["message"] == "Biometric scan received from device, but the fingerprint does not match."
    assert parsed["details"]["employee_id"] == "UNKNOWN"
    assert parsed["details"]["result"] == "REJECTED"


def test_request_id_correlation():
    token = current_request_id.set("req-test-12345")
    try:
        formatter = ProductionLogFormatter(use_json=False)
        record = logging.LogRecord(
            name="server.main",
            level=logging.INFO,
            pathname="main.py",
            lineno=30,
            msg="API request processed.",
            args=(),
            exc_info=None
        )
        record.custom_module = "API"
        record.custom_event = "REQUEST_PROCESSED"
        record.custom_details = {"method": "GET", "path": "/api/attendance/today"}

        output = formatter.format(record)
        assert "Request ID: req-test-12345" in output
    finally:
        current_request_id.reset(token)


def test_helper_log_functions():
    logger = get_logger()
    assert logger is not None
    # Verify helper functions execute cleanly without exceptions
    log_info("SYSTEM", "TEST_INFO", "Info message test", employee_id="EMP001")
    log_warning("SYSTEM", "TEST_WARNING", "Warning message test", reason="Test reason")
    log_error("SYSTEM", "TEST_ERROR", "Error message test", error="Test error")
    log_critical("SYSTEM", "TEST_CRITICAL", "Critical failure message test")
    log_debug("SYSTEM", "TEST_DEBUG", "Debug trace test")
    log_event(logging.INFO, "SYSTEM", "TEST_EVENT", "Generic event test")
