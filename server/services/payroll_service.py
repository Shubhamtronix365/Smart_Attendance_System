import json
import math
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_, extract, func
from sqlalchemy.ext.asyncio import AsyncSession

from server.models import (
    Employee,
    Attendance,
    AttendanceStatus,
    Payroll,
    Leave,
    LeaveStatus,
    Holiday,
    SalaryAdvance,
    AdvanceRecovery,
    AdvanceStatus,
    Reimbursement,
    ReimbursementStatus,
    LateAmendment,
    AmendmentStatus
)
from server.utils.time_utils import get_working_days_in_month


class OvertimeResult(int):
    """
    Subclasses int so it behaves as an integer payable_hours for numeric checks,
    while also unpacking as (actual_minutes, payable_hours) when iterated.
    """
    actual_minutes: int
    payable_hours: int

    def __new__(cls, actual_minutes: int, payable_hours: int):
        obj = super().__new__(cls, payable_hours)
        obj.actual_minutes = int(actual_minutes)
        obj.payable_hours = int(payable_hours)
        return obj

    def __iter__(self):
        return iter((self.actual_minutes, self.payable_hours))


def calculate_daily_payable_ot(actual_ot_hours_or_minutes: Any, is_minutes: Optional[bool] = None) -> OvertimeResult:
    """
    Phase 9 Overtime Calculation:
    - Calculated independently for each eligible working day.
    - Employee becomes eligible for payable overtime only when daily overtime
      is STRICTLY GREATER THAN 1 HOUR (> 60 minutes).
    - If daily overtime <= 1 hour (<= 60 min): payable OT = 0.
    - If daily overtime > 1 hour: payable OT = floor(actual_ot_in_minutes / 60).
    - Do not carry unused overtime minutes from one day to another.

    Returns OvertimeResult which is both integer payable_hours and unpackable (actual_minutes, payable_hours).
    """
    if not actual_ot_hours_or_minutes:
        return OvertimeResult(0, 0)

    if is_minutes is True:
        actual_minutes = int(actual_ot_hours_or_minutes)
    elif is_minutes is False and isinstance(actual_ot_hours_or_minutes, (float, Decimal)):
        actual_minutes = int(round(float(actual_ot_hours_or_minutes) * 60))
    elif isinstance(actual_ot_hours_or_minutes, int) and actual_ot_hours_or_minutes > 24:
        # Integer > 24 is minutes (e.g. 25 min, 59 min, 75 min, 120 min)
        actual_minutes = actual_ot_hours_or_minutes
    elif isinstance(actual_ot_hours_or_minutes, (int, float, Decimal)):
        actual_minutes = int(round(float(actual_ot_hours_or_minutes) * 60))
    else:
        try:
            actual_minutes = int(actual_ot_hours_or_minutes)
        except Exception:
            actual_minutes = 0

    if actual_minutes <= 60:
        return OvertimeResult(actual_minutes, 0)

    payable_hours = math.floor(actual_minutes / 60)
    return OvertimeResult(actual_minutes, payable_hours)


async def get_employee_advance_balance(employee_id: int, db: AsyncSession, exclude_payroll_id: Optional[int] = None) -> Decimal:
    """
    Calculates current outstanding salary advance balance for an employee.
    Outstanding = Total Advances Received - Total Recoveries
    """
    # Total advances received
    adv_stmt = select(func.coalesce(func.sum(SalaryAdvance.amount), Decimal("0.00"))).where(
        SalaryAdvance.employee_id == employee_id
    )
    adv_res = await db.execute(adv_stmt)
    total_advances = Decimal(str(adv_res.scalar() or "0.00"))

    # Total recovered so far
    rec_stmt = select(func.coalesce(func.sum(AdvanceRecovery.amount_recovered), Decimal("0.00"))).where(
        AdvanceRecovery.employee_id == employee_id
    )
    if exclude_payroll_id:
        rec_stmt = rec_stmt.where(AdvanceRecovery.payroll_id != exclude_payroll_id)

    rec_res = await db.execute(rec_stmt)
    total_recovered = Decimal(str(rec_res.scalar() or "0.00"))

    outstanding = max(Decimal("0.00"), total_advances - total_recovered)
    return outstanding


async def get_approved_reimbursements_for_employee(employee_id: int, db: AsyncSession, payroll_id: Optional[int] = None) -> Tuple[Decimal, List[Reimbursement]]:
    """
    Fetches approved reimbursements eligible for payroll inclusion.
    Only approved claims with payroll_id is NULL (or equal to current payroll_id) are included.
    """
    stmt = select(Reimbursement).where(
        and_(
            Reimbursement.employee_id == employee_id,
            Reimbursement.status.in_([ReimbursementStatus.APPROVED, ReimbursementStatus.PAID]),
            (Reimbursement.payroll_id.is_(None) | (Reimbursement.payroll_id == payroll_id) if payroll_id else Reimbursement.payroll_id.is_(None))
        )
    )
    res = await db.execute(stmt)
    claims = res.scalars().all()
    total_amount = sum((c.amount or Decimal("0.00")) for c in claims) if claims else Decimal("0.00")
    return total_amount, claims


async def get_employee_monthly_metrics(
    employee: Employee,
    year: int,
    month: int,
    db: AsyncSession,
    existing_payroll_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Gathers raw database metrics for a specific employee and month:
    - Company Holidays
    - Working days excluding Sundays & Holidays
    - Actual attendance records
    - Present, absent, half-day, and leave counts
    - Applicable late marks (excluding approved late amendments, Sundays, and holidays)
    - Daily overtime breakdown (strictly > 1 hour per day)
    - Approved reimbursements
    - Outstanding advance balance
    """
    # 1. Fetch Company Holidays for this month
    hol_stmt = select(Holiday).where(
        and_(
            extract("year", Holiday.date) == year,
            extract("month", Holiday.date) == month
        )
    )
    hol_res = await db.execute(hol_stmt)
    holidays = hol_res.scalars().all()
    holiday_dates = set(h.date for h in holidays)

    # 2. Total calendar days (T), Week Offs / Sundays (WO), and Non-Sunday Holidays (H)
    import calendar
    _, total_month_days = calendar.monthrange(year, month)
    week_offs = sum(1 for d in range(1, total_month_days + 1) if date(year, month, d).weekday() == 6)
    holidays_count = len([h for h in holidays if h.date.weekday() != 6])

    # Expected working days [(EWD) = (T - WO - H)]
    expected_working_days = max(1, total_month_days - week_offs - holidays_count)
    working_days = expected_working_days

    # Base monthly salary (S)
    base_salary = Decimal(str(employee.salary or "0.00"))

    # Salary Per Day [(SPD) = (S / EWD)]
    spd = round(base_salary / Decimal(str(expected_working_days)), 2) if expected_working_days > 0 else Decimal("0.00")

    # Salary Per Hour [(SPH) = (SPD / 8)]
    sph = round(spd / Decimal("8.0"), 2) if spd > Decimal("0.00") else Decimal("0.00")

    # 3. Fetch attendance records
    att_stmt = select(Attendance).where(
        and_(
            Attendance.employee_id == employee.employee_id,
            extract("year", Attendance.date) == year,
            extract("month", Attendance.date) == month
        )
    ).order_by(Attendance.date.asc())
    att_res = await db.execute(att_stmt)
    all_records = att_res.scalars().all()

    # Separate standard workdays (Mon-Sat, not holiday) from Sundays and Holidays
    standard_records = [r for r in all_records if r.date.weekday() != 6 and r.date not in holiday_dates]
    sunday_records = [r for r in all_records if r.date.weekday() == 6]

    # 4. Fetch approved late amendments for this employee
    late_amend_stmt = select(LateAmendment.attendance_id).where(
        and_(
            LateAmendment.employee_id == employee.employee_id,
            LateAmendment.status == AmendmentStatus.APPROVED
        )
    )
    late_amend_res = await db.execute(late_amend_stmt)
    exempted_attendance_ids = set(r[0] for r in late_amend_res.all())

    # Count Present & Leaves on standard working days
    present_days_count = sum(1 for r in standard_records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH))
    half_days_count = sum(1 for r in standard_records if r.status == AttendanceStatus.HALF_DAY)
    leave_days_count = sum(1 for r in standard_records if r.status == AttendanceStatus.LEAVE)

    effective_present = Decimal(str(present_days_count)) + Decimal("0.5") * Decimal(str(half_days_count))

    # Absent days = working_days - effective_present - leave_days (capped at 0)
    # Excludes Sundays and company holidays automatically
    absent_days = max(Decimal("0.00"), Decimal(str(working_days)) - effective_present - Decimal(str(leave_days_count)))

    # Actual Working Days [(WD) = (T - WO - H - A)]
    actual_working_days = max(Decimal("0.00"), Decimal(str(expected_working_days)) - absent_days)

    # Late Entry records (LE), Approved Amendments (ALE), Final Late Entry [(L) = (LE - ALE)]
    raw_late_records = [r for r in standard_records if r.status == AttendanceStatus.LATE]
    late_entries_total = len(raw_late_records)
    late_amendments_count = len([r for r in raw_late_records if r.attendance_id in exempted_attendance_ids])
    final_late_entries = max(0, late_entries_total - late_amendments_count)
    applicable_late_entries = final_late_entries

    # 5. Daily Overtime Calculation (Phase 9)
    # Strictly calculated per day. Sundays produce 0 payable overtime!
    daily_ot_breakdown = []
    total_payable_ot_hours = 0
    total_actual_ot_minutes = 0

    for r in standard_records:
        ot_h = r.overtime_hours or Decimal("0.00")
        actual_mins, payable_h = calculate_daily_payable_ot(ot_h)
        total_actual_ot_minutes += actual_mins
        total_payable_ot_hours += payable_h
        if actual_mins > 0:
            daily_ot_breakdown.append({
                "date": str(r.date),
                "is_sunday": False,
                "actual_hours": float(r.working_hours or 0.0),
                "excess_minutes": actual_mins,
                "actual_ot_minutes": actual_mins,
                "actual_ot_formatted": f"{actual_mins // 60}h {actual_mins % 60}m" if actual_mins >= 60 else f"{actual_mins}m",
                "payable_ot_hours": payable_h
            })

    for sr in sunday_records:
        if (sr.working_hours or Decimal("0.00")) > Decimal("0.00"):
            daily_ot_breakdown.append({
                "date": str(sr.date),
                "is_sunday": True,
                "actual_hours": float(sr.working_hours or 0.0),
                "excess_minutes": 0,
                "actual_ot_minutes": 0,
                "actual_ot_formatted": "0m (Sunday record-only)",
                "payable_ot_hours": 0
            })

    # Payout For Working Days [(PWD) = (WD * SPD)]
    payout_working_days = round(actual_working_days * spd, 2)

    # Payout For Extra Working Hours [(PEWH) = (EWH * SPH)]
    payout_extra_hours = round(Decimal(str(total_payable_ot_hours)) * sph, 2)

    # 6. Reimbursements
    reimbursement_amount, approved_claims = await get_approved_reimbursements_for_employee(
        employee.employee_id, db, payroll_id=existing_payroll_id
    )

    # 7. Advance Salary Balance
    outstanding_advance = await get_employee_advance_balance(
        employee.employee_id, db, exclude_payroll_id=existing_payroll_id
    )

    return {
        "employee_id": employee.employee_id,
        "employee_code": employee.employee_code or f"EMP{employee.employee_id:03d}",
        "name": employee.name,
        "department": employee.department,
        "designation": employee.designation,
        "base_salary": base_salary,
        "basic_salary": base_salary,
        "salary": base_salary,
        "monthly_salary": base_salary,
        "is_billable": getattr(employee, "is_billable", True),
        "month": month,
        "year": year,
        # Formula Sheet Parameters
        "total_working_days": total_month_days,
        "total_month_days": total_month_days,
        "calendar_days": total_month_days,
        "week_off": week_offs,
        "week_offs": week_offs,
        "holiday": holidays_count,
        "holidays_count": holidays_count,
        "expected_working_days": expected_working_days,
        "working_days": expected_working_days,
        "salary_per_day": spd,
        "spd": spd,
        "salary_per_hour": sph,
        "sph": sph,
        "daily_working_hours": 8,
        "leaves_absent": int(absent_days),
        "absent_days": int(absent_days),
        "actual_working_days": float(actual_working_days),
        "present_days": float(effective_present),
        "present_days_full": present_days_count,
        "half_days_count": half_days_count,
        "leave_days": leave_days_count,
        "extra_working_hours": total_payable_ot_hours,
        "payable_ot_hours": total_payable_ot_hours,
        "late_entry": late_entries_total,
        "late_entries": late_entries_total,
        "amendments_for_late_entry": late_amendments_count,
        "amendments_late_entries": late_amendments_count,
        "final_late_entry": final_late_entries,
        "final_late_entries": final_late_entries,
        "applicable_late_entries": final_late_entries,
        "payout_for_working_days": payout_working_days,
        "payout_working_days": payout_working_days,
        "payout_for_extra_working_hours": payout_extra_hours,
        "payout_extra_hours": payout_extra_hours,
        "total_actual_ot_minutes": total_actual_ot_minutes,
        "total_actual_ot_hours": round(total_actual_ot_minutes / 60.0, 2),
        "daily_ot_breakdown": daily_ot_breakdown,
        "daily_overtime_records": daily_ot_breakdown,
        "sunday_records_count": len(sunday_records),
        "reimbursement_amount": reimbursement_amount,
        "approved_reimbursements": reimbursement_amount,
        "total_approved_reimbursements": reimbursement_amount,
        "approved_reimbursements_count": len(approved_claims),
        "outstanding_advance": outstanding_advance,
        "advance_balance_outstanding": outstanding_advance,
        "outstanding_advance_balance": outstanding_advance,
        "default_absent_rate": spd,
        "default_late_rate": Decimal(str(employee.late_deduction_rate or "0.00")),
        "default_ot_rate": sph,
    }


def compute_authoritative_payroll(
    base_salary: Decimal,
    absent_days: int,
    absent_rate: Optional[Decimal] = None,
    late_entries: Optional[int] = None,
    late_rate: Decimal = Decimal("0.00"),
    payable_ot_hours: int = 0,
    ot_rate: Decimal = Decimal("0.00"),
    reimbursement_amount: Optional[Decimal] = None,
    outstanding_advance: Optional[Decimal] = None,
    advance_recovery_choice: Optional[str] = None,
    advance_recovery_amount: Optional[Decimal] = None,
    bonus: Decimal = Decimal("0.00"),
    other_deductions: Decimal = Decimal("0.00"),
    applicable_late_entries: Optional[int] = None,
    approved_reimbursements: Optional[Decimal] = None,
    advance_balance_outstanding: Optional[Decimal] = None,
    advance_recovery_mode: Optional[str] = None,
    # Formula Sheet Parameters
    total_month_days: Optional[int] = None,
    week_offs: Optional[int] = None,
    holidays_count: Optional[int] = None,
    expected_working_days: Optional[int] = None,
    actual_working_days: Optional[Decimal] = None,
    salary_per_day: Optional[Decimal] = None,
    salary_per_hour: Optional[Decimal] = None,
    raw_late_entries: Optional[int] = None,
    amendments_late_entries: Optional[int] = None,
    payout_working_days: Optional[Decimal] = None,
    payout_extra_hours: Optional[Decimal] = None,
    final_salary_override: Optional[Decimal] = None,
) -> Dict[str, Any]:
    """
    Central Authoritative Payroll Calculation Engine (Phases 7, 8, 9, 10, 13 + Formula Sheet).
    Formula Breakdown:
    - Monthly Salary (S)
    - Total Working Days in Month (T)
    - Week Off / Sundays (WO)
    - Company Holidays (H)
    - Expected Working Days: (EWD) = (T - WO - H)
    - Salary Per Day: (SPD) = (S / EWD)
    - Salary Per Hour: (SPH) = (SPD / 8)
    - Leaves / Absent Days (A)
    - Actual Working Days: (WD) = (T - WO - H - A)
    - Extra Working Hours (EWH = payable_ot_hours)
    - Late Entry (LE)
    - Amendments for Late Entry (ALE)
    - Final Late Entry: (L) = (LE - ALE)
    - Payout For Working Days: (PWD) = (WD * SPD)
    - Payout For Extra Working Hours: (PEWH) = (EWH * SPH)
    - Penalty / Debt: (D) = (L * LateRate) + AdvanceRecovery + OtherDeductions
    - Bonus / Credit / Reward: (C) = Bonus + ApprovedReimbursements
    - Final Salary: (FS) = (PWD + PEWH - D + C)
    """
    # Resolve calendar & formula variables
    T = total_month_days or 30
    WO = week_offs or 4
    H = holidays_count or 0
    EWD = expected_working_days if (expected_working_days is not None and expected_working_days > 0) else max(1, T - WO - H)

    # Salary per day (SPD) and Salary per hour (SPH)
    SPD = salary_per_day if (salary_per_day is not None and salary_per_day > Decimal("0.00")) else (
        round(base_salary / Decimal(str(EWD)), 2) if EWD > 0 else Decimal("0.00")
    )
    SPH = salary_per_hour if (salary_per_hour is not None and salary_per_hour > Decimal("0.00")) else (
        round(SPD / Decimal("8.0"), 2) if SPD > Decimal("0.00") else Decimal("0.00")
    )

    # Rates: default absent_rate to SPD and ot_rate to SPH if not explicitly given
    effective_absent_rate = absent_rate if (absent_rate is not None and absent_rate > Decimal("0.00")) else SPD
    effective_ot_rate = ot_rate if (ot_rate is not None and ot_rate > Decimal("0.00")) else SPH

    # Resolve aliases
    actual_late_entries = applicable_late_entries if applicable_late_entries is not None else (late_entries or 0)
    actual_reimbursement = approved_reimbursements if approved_reimbursements is not None else (reimbursement_amount or Decimal("0.00"))
    actual_outstanding = advance_balance_outstanding if advance_balance_outstanding is not None else (outstanding_advance or Decimal("0.00"))
    actual_mode = advance_recovery_mode if advance_recovery_mode is not None else (advance_recovery_choice or "none")

    # Actual Working Days [(WD) = (T - WO - H - A)]
    WD = actual_working_days if actual_working_days is not None else max(Decimal("0.00"), Decimal(str(EWD)) - Decimal(str(absent_days)))

    # 1. Absent deduction
    absent_deduction = round(Decimal(str(absent_days)) * effective_absent_rate, 2)
    salary_after_absence = base_salary - absent_deduction

    # Payout For Working Days [(PWD) = (WD * SPD)]
    if payout_working_days is not None and payout_working_days > Decimal("0.00"):
        PWD = payout_working_days
    elif actual_working_days is not None and salary_per_day is not None:
        PWD = round(WD * SPD, 2)
    else:
        PWD = round(base_salary - absent_deduction, 2)

    # Payout For Extra Working Hours [(PEWH) = (EWH * SPH)]
    if payout_extra_hours is not None and payout_extra_hours > Decimal("0.00"):
        PEWH = payout_extra_hours
    elif payable_ot_hours > 0 and effective_ot_rate > Decimal("0.00"):
        PEWH = round(Decimal(str(payable_ot_hours)) * effective_ot_rate, 2)
    else:
        PEWH = Decimal("0.00")

    # 2. Late deduction
    late_deduction = round(Decimal(str(actual_late_entries)) * late_rate, 2)

    # 3. Overtime addition
    overtime_addition = PEWH

    # Total additions
    total_additions = round(PEWH + actual_reimbursement + bonus, 2)

    # Pre-advance calculated salary
    pre_advance_salary = PWD + PEWH - late_deduction + actual_reimbursement + bonus - other_deductions
    pre_advance_salary = max(Decimal("0.00"), pre_advance_salary)

    # 4. Advance recovery
    chosen_recovery = Decimal("0.00")
    if actual_mode == "full":
        chosen_recovery = min(actual_outstanding, pre_advance_salary)
    elif actual_mode == "partial":
        requested_rec = advance_recovery_amount or Decimal("0.00")
        chosen_recovery = min(requested_rec, actual_outstanding, pre_advance_salary)
        chosen_recovery = max(Decimal("0.00"), chosen_recovery)
    else:  # "none"
        chosen_recovery = Decimal("0.00")

    chosen_recovery = round(chosen_recovery, 2)
    remaining_advance_balance = round(max(Decimal("0.00"), actual_outstanding - chosen_recovery), 2)

    # Penalty / Debt (D) = Late penalty + Advance recovery + Other deductions
    total_debt_d = round(late_deduction + chosen_recovery + other_deductions, 2)

    # Bonus / Credit / Reward (C) = Bonus + Approved reimbursements
    total_credit_c = round(actual_reimbursement + bonus, 2)

    # Total deductions
    total_deductions = round(absent_deduction + late_deduction + chosen_recovery + other_deductions, 2)

    # Final payable salary [(FS) = (PWD + PEWH - D + C)]
    if final_salary_override is not None:
        final_salary = final_salary_override
    else:
        final_salary = PWD + PEWH - total_debt_d + total_credit_c
    final_salary = max(Decimal("0.00"), round(final_salary, 2))

    formula_sheet = {
        "monthly_salary": float(base_salary),
        "total_working_days": int(T),
        "week_off": int(WO),
        "holiday": int(H),
        "expected_working_days": int(EWD),
        "salary_per_day": float(SPD),
        "salary_per_hour": float(SPH),
        "leaves_absent": int(absent_days),
        "actual_working_days": float(WD),
        "extra_working_hours": float(payable_ot_hours),
        "late_entry": int(raw_late_entries if raw_late_entries is not None else actual_late_entries),
        "ammendments_for_late_entry": int(amendments_late_entries or 0),
        "final_late_entry": int(actual_late_entries),
        "payout_for_working_days": float(PWD),
        "payout_for_extra_working_hours": float(PEWH),
        "penalty_debt": float(total_debt_d),
        "bonus_credit_reward": float(total_credit_c),
        "final_salary": float(final_salary),
    }

    return {
        "base_salary": base_salary,
        "basic_salary": base_salary,
        "salary": base_salary,
        "absent_days": absent_days,
        "absent_rate": absent_rate,
        "absent_deduction": float(absent_deduction),
        "total_absent_deduction": absent_deduction,
        "salary_after_absence": float(salary_after_absence),
        "salary_after_absent_deduction": salary_after_absence,
        "late_entries": actual_late_entries,
        "applicable_late_entries": actual_late_entries,
        "late_rate": late_rate,
        "late_deduction": float(late_deduction),
        "total_late_deduction": late_deduction,
        "payable_ot_hours": payable_ot_hours,
        "ot_rate": ot_rate,
        "overtime_addition": float(overtime_addition),
        "total_ot_pay": overtime_addition,
        "reimbursement_amount": actual_reimbursement,
        "approved_reimbursements": actual_reimbursement,
        "total_approved_reimbursements": actual_reimbursement,
        "bonus": bonus,
        "other_deductions": other_deductions,
        "total_additions": total_additions,
        "total_deductions": total_deductions,
        "pre_advance_salary": float(pre_advance_salary),
        "salary_before_advance": pre_advance_salary,
        "outstanding_advance_balance": actual_outstanding,
        "advance_balance_outstanding": actual_outstanding,
        "outstanding_advance": actual_outstanding,
        "advance_recovery_choice": actual_mode,
        "advance_recovery_mode": actual_mode,
        "advance_recovery_amount": float(chosen_recovery),
        "advance_recovery": chosen_recovery,
        "remaining_advance_balance": remaining_advance_balance,
        "final_payable_salary": final_salary,
        "final_salary": final_salary,
        "net_salary": final_salary,
        "formula_sheet": formula_sheet,
        "salary_per_day": SPD,
        "spd": SPD,
        "salary_per_hour": SPH,
        "sph": SPH,
        "expected_working_days": EWD,
        "actual_working_days": WD,
        "payout_for_working_days": PWD,
        "payout_working_days": PWD,
        "payout_for_extra_working_hours": PEWH,
        "payout_extra_hours": PEWH,
    }


async def preview_individual_payroll(
    employee: Employee,
    year: int,
    month: int,
    db: AsyncSession,
    absent_rate: Optional[Decimal] = None,
    late_rate: Optional[Decimal] = None,
    ot_rate: Optional[Decimal] = None,
    advance_recovery_choice: str = "none",
    advance_recovery_amount: Optional[Decimal] = None,
    bonus: Optional[Decimal] = None,
    other_deductions: Optional[Decimal] = None
) -> Dict[str, Any]:
    """
    Returns live preview of payroll with full calculation breakdown.
    Does NOT modify database records.
    """
    # Check if there is an existing finalized payroll record for this period
    existing_stmt = select(Payroll).where(
        and_(
            Payroll.employee_id == employee.employee_id,
            Payroll.month == month,
            Payroll.year == year
        )
    )
    existing_res = await db.execute(existing_stmt)
    existing_payroll = existing_res.scalar_one_or_none()
    existing_id = existing_payroll.payroll_id if existing_payroll else None

    metrics = await get_employee_monthly_metrics(employee, year, month, db, existing_payroll_id=existing_id)

    # Use explicit rates or fallback to existing payroll rates or employee defaults
    eff_absent_rate = absent_rate if absent_rate is not None else (existing_payroll.absent_rate if existing_payroll and existing_payroll.absent_rate else metrics["default_absent_rate"])
    eff_late_rate = late_rate if late_rate is not None else (existing_payroll.late_rate if existing_payroll and existing_payroll.late_rate else metrics["default_late_rate"])
    eff_ot_rate = ot_rate if ot_rate is not None else (existing_payroll.ot_rate if existing_payroll and existing_payroll.ot_rate else metrics["default_ot_rate"])
    eff_bonus = bonus if bonus is not None else (existing_payroll.bonus if existing_payroll and existing_payroll.bonus else Decimal("0.00"))
    eff_other_ded = other_deductions if other_deductions is not None else Decimal("0.00")

    calc = compute_authoritative_payroll(
        base_salary=metrics["base_salary"],
        absent_days=metrics["absent_days"],
        absent_rate=Decimal(str(eff_absent_rate or 0)),
        late_entries=metrics["applicable_late_entries"],
        late_rate=Decimal(str(eff_late_rate or 0)),
        payable_ot_hours=metrics["payable_ot_hours"],
        ot_rate=Decimal(str(eff_ot_rate or 0)),
        reimbursement_amount=metrics["reimbursement_amount"],
        outstanding_advance=metrics["outstanding_advance"],
        advance_recovery_choice=advance_recovery_choice,
        advance_recovery_amount=advance_recovery_amount,
        bonus=eff_bonus,
        other_deductions=eff_other_ded,
        total_month_days=metrics.get("total_month_days"),
        week_offs=metrics.get("week_offs"),
        holidays_count=metrics.get("holidays_count"),
        expected_working_days=metrics.get("expected_working_days"),
        actual_working_days=Decimal(str(metrics.get("actual_working_days", 0))),
        salary_per_day=metrics.get("salary_per_day"),
        salary_per_hour=metrics.get("salary_per_hour"),
        raw_late_entries=metrics.get("late_entries"),
        amendments_late_entries=metrics.get("amendments_late_entries"),
        payout_working_days=metrics.get("payout_working_days"),
        payout_extra_hours=metrics.get("payout_extra_hours"),
    )

    sal = metrics.get("basic_salary") or metrics.get("base_salary") or Decimal(str(employee.salary or "0.00"))
    return {
        **metrics,
        **calc,
        "basic_salary": sal,
        "base_salary": sal,
        "salary": sal,
        "daily_overtime_records": metrics.get("daily_ot_breakdown", []),
        "daily_ot_breakdown": metrics.get("daily_ot_breakdown", []),
        "total_approved_reimbursements": metrics.get("reimbursement_amount", Decimal("0.00")),
        "approved_reimbursements": metrics.get("reimbursement_amount", Decimal("0.00")),
        "reimbursement_amount": metrics.get("reimbursement_amount", Decimal("0.00")),
        "advance_balance_outstanding": metrics.get("outstanding_advance", Decimal("0.00")),
        "outstanding_advance": metrics.get("outstanding_advance", Decimal("0.00")),
        "is_saved": existing_payroll is not None,
        "is_paid": existing_payroll.is_paid if existing_payroll else False,
        "payroll_id": existing_id,
        "remarks": existing_payroll.remarks if existing_payroll else "",
    }


async def save_finalized_payroll(
    employee_id: int,
    year: int,
    month: int,
    absent_rate: Decimal,
    late_rate: Decimal,
    ot_rate: Decimal,
    advance_recovery_choice: str,
    advance_recovery_amount: Decimal,
    bonus: Decimal,
    other_deductions: Decimal,
    remarks: Optional[str],
    is_paid: bool,
    admin: Employee,
    db: AsyncSession,
    working_days: Optional[int] = None,
    present_days: Optional[int] = None,
    absent_days: Optional[int] = None,
    payable_ot_hours: Optional[Decimal] = None,
    salary_per_day: Optional[Decimal] = None,
    salary_per_hour: Optional[Decimal] = None,
    payout_working_days: Optional[Decimal] = None,
    payout_extra_hours: Optional[Decimal] = None,
    final_salary: Optional[Decimal] = None,
) -> Payroll:
    """
    Saves and finalizes payroll calculation with an immutable JSON snapshot.
    Handles advance recoveries and links approved reimbursements atomically.
    Supports manual overrides from formula sheet.
    """
    emp_stmt = select(Employee).where(Employee.employee_id == employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise ValueError(f"Employee #{employee_id} not found")

    # Find existing payroll
    pay_stmt = select(Payroll).where(
        and_(
            Payroll.employee_id == employee_id,
            Payroll.month == month,
            Payroll.year == year
        )
    )
    pay_res = await db.execute(pay_stmt)
    payroll = pay_res.scalar_one_or_none()
    existing_id = payroll.payroll_id if payroll else None

    # Fetch fresh metrics
    metrics = await get_employee_monthly_metrics(employee, year, month, db, existing_payroll_id=existing_id)

    # Authoritative calculation
    calc = compute_authoritative_payroll(
        base_salary=metrics["base_salary"],
        absent_days=absent_days if absent_days is not None else metrics["absent_days"],
        absent_rate=absent_rate,
        late_entries=metrics["applicable_late_entries"],
        late_rate=late_rate,
        payable_ot_hours=int(round(payable_ot_hours)) if payable_ot_hours is not None else metrics["payable_ot_hours"],
        ot_rate=ot_rate,
        reimbursement_amount=metrics["reimbursement_amount"],
        outstanding_advance=metrics["outstanding_advance"],
        advance_recovery_choice=advance_recovery_choice,
        advance_recovery_amount=advance_recovery_amount,
        bonus=bonus,
        other_deductions=other_deductions,
        total_month_days=metrics.get("total_month_days"),
        week_offs=metrics.get("week_offs"),
        holidays_count=metrics.get("holidays_count"),
        expected_working_days=working_days if working_days is not None else metrics.get("expected_working_days"),
        actual_working_days=Decimal(str(present_days)) if present_days is not None else Decimal(str(metrics.get("actual_working_days", 0))),
        salary_per_day=salary_per_day if salary_per_day is not None else metrics.get("salary_per_day"),
        salary_per_hour=salary_per_hour if salary_per_hour is not None else metrics.get("salary_per_hour"),
        raw_late_entries=metrics.get("late_entries"),
        amendments_late_entries=metrics.get("amendments_late_entries"),
        payout_working_days=payout_working_days,
        payout_extra_hours=payout_extra_hours,
        final_salary_override=final_salary
    )

    now = datetime.utcnow()

    # Complete snapshot dictionary
    snapshot_payload = {
        **metrics,
        **calc,
        "rates_configured": {
            "absent_rate": float(absent_rate),
            "late_rate": float(late_rate),
            "ot_rate": float(ot_rate)
        },
        "approver": {
            "admin_id": admin.employee_id,
            "admin_name": admin.name
        },
        "finalized_at": now.isoformat()
    }
    snapshot_json = json.dumps(snapshot_payload, default=str)

    if payroll:
        # Update existing record
        payroll.working_days = metrics["working_days"]
        payroll.present_days = int(round(metrics["present_days"]))
        payroll.absent_days = metrics["absent_days"]
        payroll.late_days = metrics["applicable_late_entries"]
        payroll.leave_days = metrics["leave_days"]
        payroll.overtime_hours = Decimal(str(metrics["total_actual_ot_hours"]))
        payroll.payable_ot_hours = Decimal(str(metrics["payable_ot_hours"]))
        payroll.basic_salary = metrics["base_salary"]
        payroll.absent_rate = absent_rate
        payroll.absent_deduction = Decimal(str(calc["absent_deduction"]))
        payroll.late_rate = late_rate
        payroll.late_deduction = Decimal(str(calc["late_deduction"]))
        payroll.ot_rate = ot_rate
        payroll.overtime_pay = Decimal(str(calc["overtime_addition"]))
        payroll.reimbursement_amount = Decimal(str(calc["reimbursement_amount"]))
        payroll.advance_recovered = Decimal(str(calc["advance_recovery_amount"]))
        payroll.advance_balance_remaining = Decimal(str(calc["remaining_advance_balance"]))
        payroll.deductions = Decimal(str(calc["total_deductions"]))
        payroll.bonus = bonus
        payroll.remarks = remarks
        payroll.final_salary = Decimal(str(calc["final_payable_salary"]))
        payroll.is_paid = is_paid
        payroll.approved_by = admin.employee_id
        payroll.approved_at = now
        payroll.calculation_snapshot = snapshot_json
        payroll.generated_at = now
    else:
        payroll = Payroll(
            employee_id=employee_id,
            month=month,
            year=year,
            working_days=metrics["working_days"],
            present_days=int(round(metrics["present_days"])),
            absent_days=metrics["absent_days"],
            late_days=metrics["applicable_late_entries"],
            leave_days=metrics["leave_days"],
            overtime_hours=Decimal(str(metrics["total_actual_ot_hours"])),
            payable_ot_hours=Decimal(str(metrics["payable_ot_hours"])),
            basic_salary=metrics["base_salary"],
            absent_rate=absent_rate,
            absent_deduction=Decimal(str(calc["absent_deduction"])),
            late_rate=late_rate,
            late_deduction=Decimal(str(calc["late_deduction"])),
            ot_rate=ot_rate,
            overtime_pay=Decimal(str(calc["overtime_addition"])),
            reimbursement_amount=Decimal(str(calc["reimbursement_amount"])),
            advance_recovered=Decimal(str(calc["advance_recovery_amount"])),
            advance_balance_remaining=Decimal(str(calc["remaining_advance_balance"])),
            deductions=Decimal(str(calc["total_deductions"])),
            bonus=bonus,
            remarks=remarks,
            final_salary=Decimal(str(calc["final_payable_salary"])),
            is_paid=is_paid,
            approved_by=admin.employee_id,
            approved_at=now,
            calculation_snapshot=snapshot_json,
            generated_at=now
        )
        db.add(payroll)

    await db.flush()  # Ensures payroll_id is available

    # 8. Record Advance Recovery transaction if recovery was chosen
    rec_amount = Decimal(str(calc["advance_recovery_amount"]))
    # Delete prior recovery transaction for this payroll if re-finalizing
    del_rec_stmt = select(AdvanceRecovery).where(AdvanceRecovery.payroll_id == payroll.payroll_id)
    del_res = await db.execute(del_rec_stmt)
    for prior_rec in del_res.scalars().all():
        await db.delete(prior_rec)

    if rec_amount > Decimal("0.00"):
        new_recovery = AdvanceRecovery(
            employee_id=employee_id,
            payroll_id=payroll.payroll_id,
            amount_recovered=rec_amount,
            recovery_date=date.today(),
            created_at=now
        )
        db.add(new_recovery)

    # 9. Link approved reimbursements to this payroll and mark as PAID
    _, approved_reimbs = await get_approved_reimbursements_for_employee(employee_id, db, payroll_id=payroll.payroll_id)
    for claim in approved_reimbs:
        claim.payroll_id = payroll.payroll_id
        claim.status = ReimbursementStatus.PAID

    await db.commit()
    await db.refresh(payroll)
    return payroll


async def calculate_employee_payroll(employee: Employee, year: int, month: int, db: AsyncSession) -> Payroll:
    """
    Default batch calculation for an employee using employee's default configured rates.
    Called during batch payroll generation.
    """
    preview = await preview_individual_payroll(
        employee, year, month, db,
        absent_rate=None,
        late_rate=Decimal(str(employee.late_deduction_rate or "0.00")),
        ot_rate=None,
        advance_recovery_choice="none"
    )

    # Use System Admin (role admin) or self as fallback approver
    admin_stmt = select(Employee).where(Employee.role == "admin").limit(1)
    admin_res = await db.execute(admin_stmt)
    admin = admin_res.scalar_one_or_none() or employee

    eff_spd = preview.get("salary_per_day") or preview.get("spd") or Decimal("0.00")
    eff_sph = preview.get("salary_per_hour") or preview.get("sph") or Decimal("0.00")

    return await save_finalized_payroll(
        employee_id=employee.employee_id,
        year=year,
        month=month,
        absent_rate=eff_spd,
        late_rate=Decimal(str(employee.late_deduction_rate or "0.00")),
        ot_rate=eff_sph,
        advance_recovery_choice="none",
        advance_recovery_amount=Decimal("0.00"),
        bonus=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
        remarks="Automated batch generation (Formula sheet)",
        is_paid=False,
        admin=admin,
        db=db,
        salary_per_day=eff_spd,
        salary_per_hour=eff_sph
    )


async def generate_payroll_for_all(year: int, month: int, db: AsyncSession) -> list[Payroll]:
    """
    Generates payroll for all active employees for a given month and year.
    """
    stmt = select(Employee).where(Employee.is_active == True)
    result = await db.execute(stmt)
    employees = result.scalars().all()

    payrolls = []
    for emp in employees:
        pay = await calculate_employee_payroll(emp, year, month, db)
        payrolls.append(pay)

    return payrolls
