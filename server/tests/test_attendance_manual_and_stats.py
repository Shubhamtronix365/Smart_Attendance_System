import pytest
from datetime import time, datetime
from decimal import Decimal
from server.services.attendance_service import calculate_late_minutes, calculate_hours
from server.schemas.attendance import AttendanceStats, AttendanceManualEntry, AttendanceUpdate

def test_calculate_late_minutes():
    """Verify late minutes are correctly computed relative to 9:00 AM standard start."""
    # On time: 08:50 AM
    assert calculate_late_minutes(time(8, 50)) == 0
    # Exactly 09:00 AM
    assert calculate_late_minutes(time(9, 0)) == 0
    # 09:15 AM -> 15 minutes
    assert calculate_late_minutes(time(9, 15)) == 15
    # 10:30 AM -> 90 minutes
    assert calculate_late_minutes(time(10, 30)) == 90

def test_calculate_hours_and_overtime():
    """Verify working hours and overtime calculation with lunch deduction."""
    # 09:00 AM to 17:00 PM (8 hrs total, 1 hr lunch -> 7.0 hrs net, 0 OT)
    c_in = datetime(2026, 10, 1, 9, 0)
    c_out = datetime(2026, 10, 1, 17, 0)
    working, ot = calculate_hours(c_in, c_out)
    assert working == Decimal("7.00")
    assert ot == Decimal("0.00")

    # 09:00 AM to 19:00 PM (10 hrs total, 1 hr lunch -> 9.0 hrs net, 2.0 hrs OT)
    c_out_late = datetime(2026, 10, 1, 19, 0)
    working, ot = calculate_hours(c_in, c_out_late)
    assert working == Decimal("9.00")
    assert ot == Decimal("2.00")

def test_attendance_stats_schema():
    """Verify AttendanceStats schema serializes overtime and late fields."""
    stats = AttendanceStats(
        total=10,
        present=8,
        absent=2,
        late=3,
        leave=0,
        overtime_hours=Decimal("4.50"),
        late_minutes=75,
        late_hours=Decimal("1.25"),
        month_overtime_hours=Decimal("22.00"),
        month_late_hours=Decimal("6.50"),
        month_late_minutes=390
    )
    dumped = stats.model_dump()
    assert dumped["overtime_hours"] == Decimal("4.50")
    assert dumped["late_minutes"] == 75
    assert dumped["late_hours"] == Decimal("1.25")
    assert dumped["month_overtime_hours"] == Decimal("22.00")
