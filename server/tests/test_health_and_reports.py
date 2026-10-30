import pytest
from datetime import date, datetime
from httpx import AsyncClient, ASGITransport
from server.main import app
from server.services.excel_service import generate_historical_attendance_excel
from server.services.pdf_service import generate_historical_attendance_pdf

@pytest.mark.asyncio
async def test_health_check_get():
    """Verify /health returns 200 and healthy keep-alive status for cron jobs."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] in ("healthy", "degraded")
        assert data["server"] == "online"
        assert data["cron_wakeup"] is True
        assert "timestamp" in data

@pytest.mark.asyncio
async def test_health_check_head():
    """Verify HEAD /health returns 200 for lightweight ping monitors."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.head("/health")
        assert res.status_code == 200

@pytest.mark.asyncio
async def test_ping_endpoint_get():
    """Verify /ping returns 200 with minimal 2-byte 'OK' payload for strict cron monitors."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/ping")
        assert res.status_code == 200
        assert res.text == "OK"
        assert len(res.content) == 2

@pytest.mark.asyncio
async def test_ping_endpoint_head():
    """Verify HEAD /ping returns 200 with empty body."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.head("/ping")
        assert res.status_code == 200
        assert len(res.content) == 0

@pytest.mark.asyncio
async def test_health_text_format():
    """Verify /health?format=text returns minimal 'OK'."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health?format=text")
        assert res.status_code == 200
        assert res.text == "OK"

@pytest.mark.asyncio
async def test_api_health_check_get():
    """Verify /api/health returns 200 and matches health contract."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["cron_wakeup"] is True

def test_historical_attendance_excel_generation():
    """Verify historical attendance Excel generation creates valid openxml bytes."""
    sample_records = [
        {
            "date": date(2026, 10, 1),
            "employee_id": 1,
            "employee_name": "Test User",
            "department": "Engineering",
            "check_in": datetime(2026, 10, 1, 9, 0),
            "check_out": datetime(2026, 10, 1, 18, 0),
            "working_hours": 9.0,
            "late_minutes": 0,
            "overtime_hours": 1.0,
            "status": "present",
            "source": "biometric"
        }
    ]
    excel_bytes = generate_historical_attendance_excel(date(2026, 10, 1), date(2026, 10, 31), sample_records)
    assert excel_bytes is not None
    assert len(excel_bytes) > 100
    assert excel_bytes[:2] == b"PK"  # Zip header for .xlsx

def test_historical_attendance_pdf_generation():
    """Verify historical attendance PDF generation creates valid PDF bytes."""
    sample_records = [
        {
            "date": date(2026, 10, 1),
            "employee_id": 1,
            "employee_name": "Test User",
            "department": "Engineering",
            "check_in": datetime(2026, 10, 1, 9, 0),
            "check_out": datetime(2026, 10, 1, 18, 0),
            "working_hours": 9.0,
            "late_minutes": 15,
            "overtime_hours": 1.0,
            "status": "late",
            "source": "biometric"
        }
    ]
    pdf_bytes = generate_historical_attendance_pdf(date(2026, 10, 1), date(2026, 10, 31), sample_records)
    assert pdf_bytes is not None
    assert len(pdf_bytes) > 100
    assert pdf_bytes[:4] == b"%PDF"  # PDF header

def test_individual_employee_historical_report_generation():
    """Verify single employee detailed report generation with custom title and subtitle."""
    sample_records = [
        {
            "date": date(2026, 10, 1),
            "employee_id": 5,
            "employee_name": "John Doe",
            "department": "Engineering",
            "check_in": datetime(2026, 10, 1, 9, 15),
            "check_out": datetime(2026, 10, 1, 18, 30),
            "working_hours": 9.25,
            "late_minutes": 15,
            "overtime_hours": 0.5,
            "status": "late",
            "source": "biometric"
        }
    ]
    title = "INDIVIDUAL ATTENDANCE REPORT - John Doe (EMP005)"
    subtitle = "Employee: John Doe | ID: EMP005 | Department: Engineering | Period: 01 Oct 2026 to 31 Oct 2026"
    excel_bytes = generate_historical_attendance_excel(date(2026, 10, 1), date(2026, 10, 31), sample_records, title=title, subtitle=subtitle)
    assert excel_bytes is not None
    assert excel_bytes[:2] == b"PK"

    pdf_bytes = generate_historical_attendance_pdf(date(2026, 10, 1), date(2026, 10, 31), sample_records, title=title, subtitle=subtitle)
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"

def test_daily_attendance_reports():
    """Verify daily attendance report generation for all employees and single employee."""
    from server.services.excel_service import generate_daily_attendance_excel
    from server.services.pdf_service import generate_daily_attendance_pdf

    sample_daily = [
        {
            "employee_id": 1,
            "employee_name": "Alice Smith",
            "department": "HR",
            "check_in": datetime(2026, 10, 12, 9, 0),
            "check_out": datetime(2026, 10, 12, 18, 0),
            "working_hours": 9.0,
            "overtime_hours": 0.0,
            "status": "present",
            "source": "biometric"
        }
    ]
    excel_bytes = generate_daily_attendance_excel(date(2026, 10, 12), sample_daily, title="DAILY ATTENDANCE REPORT - Alice Smith (EMP001)")
    assert excel_bytes is not None
    assert excel_bytes[:2] == b"PK"

    pdf_bytes = generate_daily_attendance_pdf(date(2026, 10, 12), sample_daily, title="DAILY ATTENDANCE REPORT - Alice Smith (EMP001)")
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"

def test_monthly_attendance_reports():
    """Verify monthly attendance report generation."""
    from server.services.excel_service import generate_monthly_attendance_excel
    from server.services.pdf_service import generate_monthly_attendance_pdf

    sample_monthly = [
        {
            "employee_id": 1,
            "employee_name": "Alice Smith",
            "department": "HR",
            "designation": "Manager",
            "present_days": 22.0,
            "absent_days": 1.0,
            "leave_days": 1.0,
            "overtime_hours": 4.5
        }
    ]
    excel_bytes = generate_monthly_attendance_excel(2026, 10, sample_monthly, title="MONTHLY ATTENDANCE SUMMARY - Alice Smith (EMP001)")
    assert excel_bytes is not None
    assert excel_bytes[:2] == b"PK"

    pdf_bytes = generate_monthly_attendance_pdf(2026, 10, sample_monthly, title="MONTHLY ATTENDANCE SUMMARY - Alice Smith (EMP001)")
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_multi_session_and_enum_status():
    """Verify PDF multi-session timing and enum status normalization."""
    from server.services.pdf_service import (
        format_punch_sessions_pdf,
        _normalize_status,
        _format_status_badge,
        generate_historical_attendance_pdf
    )
    from server.models import AttendanceStatus

    # 1. Verify Enum status normalizes correctly
    assert _normalize_status(AttendanceStatus.PRESENT) == "present"
    assert _normalize_status(AttendanceStatus.LATE) == "late"
    assert _normalize_status("AttendanceStatus.PRESENT") == "present"

    badge_pres = _format_status_badge(AttendanceStatus.PRESENT)
    assert "PRESENT" in badge_pres
    assert "#059669" in badge_pres

    badge_late = _format_status_badge(AttendanceStatus.LATE)
    assert "LATE" in badge_late

    # 2. Verify multi-session breakdown format
    punches = [
        {"session": 1, "in": "2026-10-28 11:27:10", "out": "2026-10-28 12:41:24", "hours": 1.24},
        {"session": 2, "in": "2026-10-28 12:42:03", "out": "2026-10-28 20:42:03", "hours": 7.0}
    ]
    cin_disp, cout_disp = format_punch_sessions_pdf("11:27:10", "20:42:03", punches, 2)
    assert "Session 1:" in cin_disp
    assert "11:27 AM" in cin_disp
    assert "Session 2:" in cin_disp
    assert "12:42 PM" in cin_disp
    assert "Session 1:" in cout_disp
    assert "12:41 PM" in cout_disp
    assert "1.24h" in cout_disp
    assert "Session 2:" in cout_disp
    assert "08:42 PM" in cout_disp
    assert "7.00h" in cout_disp

    # 3. Verify PDF generation with multi-session records
    sample_records = [
        {
            "date": date(2026, 10, 28),
            "employee_id": 16,
            "employee_code": "EMP001",
            "employee_name": "Tejas Daund",
            "department": "Engineering",
            "check_in": "2026-10-28 11:27:10",
            "check_out": "2026-10-28 20:42:03",
            "working_hours": 8.24,
            "late_minutes": 147,
            "overtime_hours": 0.24,
            "status": AttendanceStatus.LATE,
            "checkout_count": 2,
            "punches": punches
        }
    ]
    pdf_bytes = generate_historical_attendance_pdf(date(2026, 10, 1), date(2026, 10, 31), sample_records)
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"
