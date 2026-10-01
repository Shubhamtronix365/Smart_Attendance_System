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
