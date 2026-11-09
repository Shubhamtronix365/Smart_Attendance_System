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


def test_holiday_update_schema_and_custom_festival_types():
    """Verify HolidayUpdate handles ISO date strings, slash dates, and custom/festival types without 422 error."""
    from server.schemas.holiday import HolidayUpdate, HolidayCreate
    from datetime import date

    # Test HolidayUpdate with string date
    update_data = HolidayUpdate(
        name="Diwali Festival",
        date="2026-11-08",
        holiday_type="Festival",
        description="Festival of Lights"
    )
    assert update_data.date == date(2026, 11, 8)
    assert update_data.holiday_type == "Festival"

    # Test HolidayUpdate with slash format
    update_slash = HolidayUpdate(date="25/12/2026", holiday_type="Custom")
    assert update_slash.date == date(2026, 12, 25)
    assert update_slash.holiday_type == "Custom"

    # Test HolidayCreate with string date and custom type
    create_data = HolidayCreate(
        name="Local Founder Day",
        date="2026-05-15",
        holiday_type="Custom",
        company_name="Corporate"
    )
    assert create_data.date == date(2026, 5, 15)
    assert create_data.holiday_type == "Custom"


def test_late_amendment_approval_synchronization_and_payroll_adjustment():
    """
    Verify that when late dispute / amendment is approved:
    1. Attendance status transitions from LATE to PRESENT and late_minutes is cleared to 0.
    2. Authoritative payroll recalculates late penalty from 1 late day to 0 late days.
    3. Final payable salary is adjusted upwards accordingly (late deduction eliminated).
    """
    from server.models import Attendance, LateAmendment, AmendmentStatus, Payroll
    from server.services.payroll_service import compute_authoritative_payroll

    # Initial state: 1 late mark with 200 INR penalty
    calc_initial = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=1,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
    )
    assert calc_initial["late_entries"] == 1
    assert calc_initial["late_deduction"] == 200.0
    assert calc_initial["final_salary"] == Decimal("49800.00")

    # Simulate Attendance record and LateAmendment
    att = Attendance(
        attendance_id=999,
        employee_id=1,
        date=date(2026, 11, 4),
        status=AttendanceStatus.LATE,
        late_minutes=45
    )
    amendment = LateAmendment(
        amendment_id=101,
        attendance_id=999,
        employee_id=1,
        original_late_minutes=45,
        reason="Heavy traffic congestion due to metro work",
        status=AmendmentStatus.PENDING
    )
    amendment.attendance = att

    # Admin reviews and approves late amendment
    # 1. Update Attendance
    if amendment.attendance.status == AttendanceStatus.LATE:
        amendment.attendance.status = AttendanceStatus.PRESENT
    amendment.attendance.late_minutes = 0
    amendment.status = AmendmentStatus.APPROVED

    assert att.status == AttendanceStatus.PRESENT
    assert att.late_minutes == 0

    # 2. Recalculate payroll with 0 late entries
    calc_adjusted = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=0,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
    )
    assert calc_adjusted["late_entries"] == 0
    assert calc_adjusted["late_deduction"] == 0.0
    assert calc_adjusted["final_salary"] == Decimal("50000.00")


def test_reimbursement_edit_resets_approval_and_payroll_inclusion():
    """
    Verifies that editing a reimbursement resets its status to PENDING,
    clears any previous approval or payroll link, and is strictly excluded
    from payroll until re-approved by administration.
    """
    from server.models.reimbursement import Reimbursement, ReimbursementStatus

    # 1. Initially submitted claim is PENDING
    claim = Reimbursement(
        reimbursement_id=501,
        employee_id=1,
        amount=Decimal("2500.00"),
        category="Travel & Fuel",
        description="Client site travel expenses",
        receipt_filename="fuel_receipt.pdf",
        receipt_mimetype="application/pdf",
        receipt_storage_path="safe_fuel_receipt.pdf",
        status=ReimbursementStatus.PENDING,
        created_at=datetime.utcnow()
    )

    # In PENDING status, approved reimbursement amount for payroll is 0
    eligible_approved_reimb = claim.amount if claim.status in (ReimbursementStatus.APPROVED, ReimbursementStatus.PAID) else Decimal("0.00")
    assert eligible_approved_reimb == Decimal("0.00")

    payroll_pending = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=0,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
        approved_reimbursements=eligible_approved_reimb,
    )
    assert payroll_pending["reimbursement_amount"] == Decimal("0.00")
    assert payroll_pending["final_salary"] == Decimal("50000.00")

    # 2. Administrator approves the claim
    claim.status = ReimbursementStatus.APPROVED
    claim.reviewed_by = 99
    claim.reviewed_at = datetime.utcnow()
    claim.reviewer_comments = "Approved for business travel."

    eligible_approved_reimb = claim.amount if claim.status in (ReimbursementStatus.APPROVED, ReimbursementStatus.PAID) else Decimal("0.00")
    assert eligible_approved_reimb == Decimal("2500.00")

    payroll_approved = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=0,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
        approved_reimbursements=eligible_approved_reimb,
    )
    assert payroll_approved["reimbursement_amount"] == Decimal("2500.00")
    assert payroll_approved["final_salary"] == Decimal("52500.00")

    # 3. Employee updates / edits the claim (e.g. adjusts amount to 3200 and fixes receipt)
    # Backend update_reimbursement resets status back to PENDING and clears previous approval
    prev_status = claim.status
    claim.amount = Decimal("3200.00")
    claim.description = "Updated with parking charges"
    claim.status = ReimbursementStatus.PENDING
    claim.reviewed_by = None
    claim.reviewed_at = None
    claim.payroll_id = None
    if prev_status == ReimbursementStatus.APPROVED:
        claim.reviewer_comments = "Modified by employee after approval. Requires re-approval before payroll inclusion."

    assert claim.status == ReimbursementStatus.PENDING
    assert claim.reviewed_by is None
    assert claim.payroll_id is None

    # While pending re-approval, claim amount is excluded from payroll
    eligible_approved_reimb = claim.amount if claim.status in (ReimbursementStatus.APPROVED, ReimbursementStatus.PAID) else Decimal("0.00")
    assert eligible_approved_reimb == Decimal("0.00")

    payroll_after_edit = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=0,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
        approved_reimbursements=eligible_approved_reimb,
    )
    assert payroll_after_edit["reimbursement_amount"] == Decimal("0.00")
    assert payroll_after_edit["final_salary"] == Decimal("50000.00")

    # 4. Administrator reviews and approves the updated claim
    claim.status = ReimbursementStatus.APPROVED
    claim.reviewed_by = 99
    claim.reviewed_at = datetime.utcnow()
    claim.reviewer_comments = "Re-approved with updated parking receipts."

    eligible_approved_reimb = claim.amount if claim.status in (ReimbursementStatus.APPROVED, ReimbursementStatus.PAID) else Decimal("0.00")
    assert eligible_approved_reimb == Decimal("3200.00")

    payroll_reapproved = compute_authoritative_payroll(
        base_salary=Decimal("50000.00"),
        absent_days=0,
        absent_rate=Decimal("1500.00"),
        late_entries=0,
        late_rate=Decimal("200.00"),
        payable_ot_hours=0,
        ot_rate=Decimal("100.00"),
        approved_reimbursements=eligible_approved_reimb,
    )
    assert payroll_reapproved["reimbursement_amount"] == Decimal("3200.00")
    assert payroll_reapproved["final_salary"] == Decimal("53200.00")



