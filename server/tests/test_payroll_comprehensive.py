import pytest
from datetime import date, time, datetime
from decimal import Decimal
from server.services.payroll_service import (
    calculate_daily_payable_ot,
    compute_authoritative_payroll,
)
from server.services.attendance_service import (
    calculate_hours,
    calculate_late_minutes,
    determine_status,
)
from server.models.attendance import AttendanceStatus
from server.utils.time_utils import get_working_days_in_month

def test_daily_overtime_eligibility_and_flooring():
    """
    Phase 9 & Phase 18:
    Daily overtime eligibility strictly requires > 1 hour excess over shift.
    Payable hours must be floored to whole integer hour.
    """
    # 25 minutes excess -> 0 payable hours
    assert calculate_daily_payable_ot(25) == 0

    # 59 minutes excess -> 0 payable hours
    assert calculate_daily_payable_ot(59) == 0

    # 1 hour (60 minutes) excess -> 0 payable hours (must strictly exceed 1 hour)
    assert calculate_daily_payable_ot(60) == 0

    # 1 hour 15 min (75 minutes) excess -> 1 payable hour
    assert calculate_daily_payable_ot(75) == 1

    # 1 hour 59 min (119 minutes) excess -> 1 payable hour
    assert calculate_daily_payable_ot(119) == 1

    # 2 hours (120 minutes) excess -> 2 payable hours
    assert calculate_daily_payable_ot(120) == 2

    # 2 hours 45 min (165 minutes) excess -> 2 payable hours
    assert calculate_daily_payable_ot(165) == 2

    # 3 hours (180 minutes) excess -> 3 payable hours
    assert calculate_daily_payable_ot(180) == 3

def test_daily_overtime_no_carryover_across_days():
    """
    Phase 9 & Phase 18:
    Overtime does not carry over between days.
    Day 1: 45 min excess -> 0
    Day 2: 50 min excess -> 0
    Total payable overtime = 0 (45 and 50 are not combined into 95 min).
    """
    day1_ot = calculate_daily_payable_ot(45)
    day2_ot = calculate_daily_payable_ot(50)
    total_payable = day1_ot + day2_ot
    assert day1_ot == 0
    assert day2_ot == 0
    assert total_payable == 0

def test_absent_day_deduction():
    """
    Phase 7 & Phase 18:
    Base salary = ₹17,000.
    Absent days = 5.
    Configured absent rate = ₹656.
    Deduction = 5 * 656 = ₹3,280.
    Salary after absence = ₹13,720.
    """
    calc = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=5,
        absent_rate=Decimal("656.00"),
        applicable_late_entries=0,
        late_rate=Decimal("0.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("0.00"),
        advance_balance_outstanding=Decimal("0.00"),
        advance_recovery_mode="none",
        advance_recovery_amount=Decimal("0.00"),
        approved_reimbursements=Decimal("0.00"),
        bonus=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
    )
    assert calc["total_absent_deduction"] == Decimal("3280.00")
    assert calc["salary_after_absent_deduction"] == Decimal("13720.00")
    assert calc["final_payable_salary"] == Decimal("13720.00")

def test_late_mark_deduction():
    """
    Phase 8 & Phase 18:
    Late marks = 5.
    Configured late rate = ₹200.
    Deduction = 5 * 200 = ₹1,000.
    """
    calc = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=0,
        absent_rate=Decimal("0.00"),
        applicable_late_entries=5,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("0.00"),
        advance_balance_outstanding=Decimal("0.00"),
        advance_recovery_mode="none",
        advance_recovery_amount=Decimal("0.00"),
        approved_reimbursements=Decimal("0.00"),
        bonus=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
    )
    assert calc["total_late_deduction"] == Decimal("1000.00")
    assert calc["final_payable_salary"] == Decimal("16000.00")

def test_combined_attendance_and_overtime_calculation():
    """
    Phase 18 Master Test:
    Base Salary = ₹17,000.
    Absent: 5 days @ ₹656 = ₹3,280 deduction.
    Late: 5 entries @ ₹200 = ₹1,000 deduction.
    Overtime: 5 payable hours @ ₹82 = ₹410 addition.
    Salary before advance recovery = 17000 - 3280 - 1000 + 410 = ₹13,130.
    """
    calc = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=5,
        absent_rate=Decimal("656.00"),
        applicable_late_entries=5,
        late_rate=Decimal("200.00"),
        payable_ot_hours=5,
        ot_rate=Decimal("82.00"),
        advance_balance_outstanding=Decimal("0.00"),
        advance_recovery_mode="none",
        advance_recovery_amount=Decimal("0.00"),
        approved_reimbursements=Decimal("0.00"),
        bonus=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
    )
    assert calc["total_absent_deduction"] == Decimal("3280.00")
    assert calc["total_late_deduction"] == Decimal("1000.00")
    assert calc["total_ot_pay"] == Decimal("410.00")
    assert calc["salary_before_advance"] == Decimal("13130.00")
    assert calc["final_payable_salary"] == Decimal("13130.00")

def test_advance_salary_recovery_options():
    """
    Phase 10 & Phase 18:
    Salary before advance = ₹13,130 (or base ₹17,000).
    Outstanding advance = ₹10,000.
    1. Full Recovery: Deduction = ₹10,000, Net = ₹3,130, Remaining = ₹0.
    2. Partial Recovery (₹5,000): Deduction = ₹5,000, Net = ₹8,130, Remaining = ₹5,000.
    3. No Recovery: Deduction = ₹0, Net = ₹13,130, Remaining = ₹10,000.
    """
    # 1. Full Recovery
    calc_full = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=5,
        absent_rate=Decimal("656.00"),
        applicable_late_entries=5,
        late_rate=Decimal("200.00"),
        payable_ot_hours=5,
        ot_rate=Decimal("82.00"),
        advance_balance_outstanding=Decimal("10000.00"),
        advance_recovery_mode="full",
        advance_recovery_amount=Decimal("10000.00"),
    )
    assert calc_full["advance_recovery"] == Decimal("10000.00")
    assert calc_full["remaining_advance_balance"] == Decimal("0.00")
    assert calc_full["final_payable_salary"] == Decimal("3130.00")

    # 2. Partial Recovery of ₹5,000
    calc_partial = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=5,
        absent_rate=Decimal("656.00"),
        applicable_late_entries=5,
        late_rate=Decimal("200.00"),
        payable_ot_hours=5,
        ot_rate=Decimal("82.00"),
        advance_balance_outstanding=Decimal("10000.00"),
        advance_recovery_mode="partial",
        advance_recovery_amount=Decimal("5000.00"),
    )
    assert calc_partial["advance_recovery"] == Decimal("5000.00")
    assert calc_partial["remaining_advance_balance"] == Decimal("5000.00")
    assert calc_partial["final_payable_salary"] == Decimal("8130.00")

    # 3. No Recovery
    calc_none = compute_authoritative_payroll(
        base_salary=Decimal("17000.00"),
        absent_days=5,
        absent_rate=Decimal("656.00"),
        applicable_late_entries=5,
        late_rate=Decimal("200.00"),
        payable_ot_hours=5,
        ot_rate=Decimal("82.00"),
        advance_balance_outstanding=Decimal("10000.00"),
        advance_recovery_mode="none",
        advance_recovery_amount=Decimal("0.00"),
    )
    assert calc_none["advance_recovery"] == Decimal("0.00")
    assert calc_none["remaining_advance_balance"] == Decimal("10000.00")
    assert calc_none["final_payable_salary"] == Decimal("13130.00")

def test_sunday_record_only_behavior():
    """
    Phase 3: Sunday Attendance: Record Only.
    Sunday work must be recorded for historical records, but have ZERO impact on payroll.
    No late marks, no overtime pay, status = WEEKLY_OFF.
    """
    sunday_date = date(2026, 10, 25) # Sunday
    c_in = datetime(2026, 10, 25, 9, 30) # 30 min past 9
    c_out = datetime(2026, 10, 25, 18, 0) # 8.5 hours

    # Status must be WEEKLY_OFF
    status = determine_status(time(9, 30), sunday_date)
    assert status == AttendanceStatus.WEEKLY_OFF

    # Late minutes must be 0
    late_min = calculate_late_minutes(time(9, 30), sunday_date)
    assert late_min == 0

    # Overtime must be 0
    working_hours, ot_hours = calculate_hours(c_in, c_out)
    assert ot_hours == Decimal("0.00")

def test_company_holiday_working_days_exclusion():
    """
    Phase 2: Company Holiday Calendar.
    Holidays must be excluded from applicable working days count and must not become employee absences.
    """
    # October 2026 has 31 days.
    # Sundays in Oct 2026: 4, 11, 18, 25 -> 4 Sundays -> 27 working days without holidays.
    days_no_holiday = get_working_days_in_month(2026, 10, holiday_dates=[])
    assert days_no_holiday == 27

    # Suppose Oct 2 (Gandhi Jayanti) and Oct 20 are company holidays (both are weekdays)
    holidays = [date(2026, 10, 2), date(2026, 10, 20)]
    days_with_holidays = get_working_days_in_month(2026, 10, holiday_dates=holidays)
    assert days_with_holidays == 25 # 27 - 2 = 25 working days

def test_sunday_as_fixed_holiday_in_calendar():
    """
    Sunday as a Fixed Holiday in Holiday Calendar:
    Verifies that Sunday is recognized as a fixed holiday, model exposes is_fixed property,
    and schema serializes Sunday as a fixed weekly off.
    """
    from server.models.holiday import Holiday
    from server.schemas.holiday import HolidayOut
    from datetime import datetime

    # Sunday date
    sun_date = date(2026, 10, 4) # Sunday
    assert sun_date.weekday() == 6

    h_sun = Holiday(
        holiday_id=101,
        name="Sunday (Weekly Off)",
        date=sun_date,
        holiday_type="Weekly Off",
        company_name="Default",
        created_at=datetime.utcnow()
    )
    assert h_sun.is_fixed is True

    out = HolidayOut.model_validate(h_sun)
    assert out.is_fixed is True
    assert out.name == "Sunday (Weekly Off)"
    assert out.holiday_type == "Weekly Off"

    # Weekday custom holiday
    weekday_date = date(2026, 10, 2) # Friday
    h_custom = Holiday(
        holiday_id=102,
        name="Gandhi Jayanti",
        date=weekday_date,
        holiday_type="National",
        company_name="Default",
        created_at=datetime.utcnow()
    )
    assert h_custom.is_fixed is False
