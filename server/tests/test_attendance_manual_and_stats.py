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

def test_calculate_multi_session_totals_six_punches():
    """Verify that multiple check-in/check-out sessions in a day sum accurately."""
    from server.services.attendance_service import calculate_multi_session_totals
    
    # Simulate 3 complete sessions (6 total punches):
    # Session 1: 09:00 to 12:00 (3.00 hrs)
    # Session 2: 13:00 to 17:00 (4.00 hrs)
    # Session 3: 18:00 to 22:00 (4.00 hrs)
    sessions = [
        {"session": 1, "in": "2026-10-23T09:00:00", "out": "2026-10-23T12:00:00", "hours": 3.0},
        {"session": 2, "in": "2026-10-23T13:00:00", "out": "2026-10-23T17:00:00", "hours": 4.0},
        {"session": 3, "in": "2026-10-23T18:00:00", "out": "2026-10-23T22:00:00", "hours": 4.0},
    ]
    working, ot, checkouts = calculate_multi_session_totals(sessions, standard_work_hours=8)
    assert checkouts == 3
    assert working == Decimal("11.00")
    # standard_work_hours=8 with net standard 7 -> 11 - 7 = 4.00 hours overtime
    assert ot == Decimal("4.00")

def test_calculate_multi_session_totals_cross_midnight():
    """Verify cross-midnight single long shift (e.g. 9 AM to 3 AM next day = 18 hrs)."""
    from server.services.attendance_service import calculate_multi_session_totals
    
    sessions = [
        {"session": 1, "in": "2026-10-23T09:00:00", "out": "2026-10-24T03:00:00", "hours": 18.0}
    ]
    working, ot, checkouts = calculate_multi_session_totals(sessions, standard_work_hours=8)
    assert checkouts == 1
    # 1 continuous session >= 5h -> 18.0 - 1.0 lunch = 17.00 hrs
    assert working == Decimal("17.00")
    # 17.0 - 7.0 standard = 10.00 hrs overtime
    assert ot == Decimal("10.00")



def test_sunday_overtime_calculation():
    """Verify that any work on Sunday is 100% calculated as overtime."""
    from datetime import date
    # 2026-10-25 is a Sunday
    sunday_dt_in = datetime(2026, 10, 25, 11, 0)
    sunday_dt_out = datetime(2026, 10, 25, 15, 0) # 4 hours
    working, ot = calculate_hours(sunday_dt_in, sunday_dt_out)
    assert working == Decimal("3.00") # 4h - 1h lunch = 3h
    assert ot == Decimal("3.00") # 100% of Sunday work is overtime!

    # Sunday check-in late minutes should be 0
    assert calculate_late_minutes(time(11, 0), date(2026, 10, 25)) == 0

def test_sunday_multi_session_totals():
    """Verify calculate_multi_session_totals treats Sunday work as 100% overtime."""
    from server.services.attendance_service import calculate_multi_session_totals
    sessions = [
        {"session": 1, "in": "2026-10-25 11:00:00", "out": "2026-10-25 14:00:00", "hours": 3.0},
        {"session": 2, "in": "2026-10-25 15:00:00", "out": "2026-10-25 18:00:00", "hours": 3.0},
    ]
    working, ot, checkouts = calculate_multi_session_totals(sessions, standard_work_hours=8, is_sunday=True)
    assert checkouts == 2
    assert working == Decimal("6.00")
    assert ot == Decimal("6.00") # 100% of working hours are OT on Sunday!
