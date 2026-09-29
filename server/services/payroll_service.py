from decimal import Decimal
from datetime import date, datetime
from sqlalchemy import select, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession
from server.models import Employee, Attendance, AttendanceStatus, Payroll, Leave, LeaveStatus
from server.utils.time_utils import get_working_days_in_month
from server.config import settings

async def calculate_employee_payroll(employee: Employee, year: int, month: int, db: AsyncSession) -> Payroll:
    """
    Calculates monthly payroll for a single employee and upserts the record.
    """
    working_days = get_working_days_in_month(year, month)
    
    # Fetch attendance records for this month
    att_stmt = select(Attendance).where(
        and_(
            Attendance.employee_id == employee.employee_id,
            extract("year", Attendance.date) == year,
            extract("month", Attendance.date) == month
        )
    )
    att_result = await db.execute(att_stmt)
    records = att_result.scalars().all()
    
    # Group attendance by status
    present_days_count = sum(1 for r in records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH))
    late_days_count = sum(1 for r in records if r.status == AttendanceStatus.LATE)
    half_days_count = sum(1 for r in records if r.status == AttendanceStatus.HALF_DAY)
    leave_days_count = sum(1 for r in records if r.status == AttendanceStatus.LEAVE)
    
    # Overtime hours & late hours
    ot_hours = sum(r.overtime_hours or Decimal("0.00") for r in records)
    late_minutes_total = sum(r.late_minutes or 0 for r in records)
    late_hours = Decimal(str(late_minutes_total)) / Decimal("60.0")
    
    # Financial math:
    # 1. Base present days (half day counts as 0.5 present, 0.5 absent)
    present_days = Decimal(str(present_days_count)) + Decimal("0.5") * Decimal(str(half_days_count))
    leave_days = Decimal(str(leave_days_count))
    
    # 2. Absent days = working_days - present_days - leave_days (capped at 0)
    absent_days = Decimal(str(working_days)) - present_days - leave_days
    absent_days = max(absent_days, Decimal("0.00"))
    
    # 3. Base rates
    daily_rate = employee.salary / Decimal(str(working_days)) if working_days > 0 else Decimal("0.00")
    hourly_rate = daily_rate / Decimal("8.0")
    
    # 4. Overtime Calculation (Uses employee's custom overtime_rate if set > 0, else 1.5x hourly formula)
    if employee.overtime_rate and employee.overtime_rate > Decimal("0.00"):
        overtime_pay = ot_hours * employee.overtime_rate
    else:
        ot_multiplier = Decimal(str(settings.OT_MULTIPLIER))
        overtime_pay = ot_hours * hourly_rate * ot_multiplier
    overtime_pay = round(overtime_pay, 2)

    # 5. Absent deduction
    absent_deduction = round(absent_days * daily_rate, 2)

    # 6. Late deduction (Uses employee's custom late_deduction_rate if set > 0)
    if employee.late_deduction_rate and employee.late_deduction_rate > Decimal("0.00"):
        if getattr(employee, "late_deduction_type", "per_day") == "per_hour":
            late_deduction = round(late_hours * employee.late_deduction_rate, 2)
        else:
            late_deduction = round(Decimal(str(late_days_count)) * employee.late_deduction_rate, 2)
    else:
        late_deduction = Decimal("0.00")

    # Total deductions = Absent deduction + Late deduction
    total_deductions = absent_deduction + late_deduction
    
    # Final Salary = Basic Salary + Overtime Pay - Total Deductions
    final_salary = employee.salary + overtime_pay - total_deductions
    final_salary = max(final_salary, Decimal("0.00"))
    final_salary = round(final_salary, 2)
    
    # Check if payroll record already exists for this month/year
    pay_stmt = select(Payroll).where(
        and_(
            Payroll.employee_id == employee.employee_id,
            Payroll.month == month,
            Payroll.year == year
        )
    )
    pay_result = await db.execute(pay_stmt)
    db_payroll = pay_result.scalar_one_or_none()
    
    if db_payroll:
        # Update existing
        db_payroll.working_days = working_days
        db_payroll.present_days = int(present_days_count)
        db_payroll.absent_days = int(absent_days)
        db_payroll.late_days = int(late_days_count)
        db_payroll.leave_days = int(leave_days_count)
        db_payroll.overtime_hours = ot_hours
        db_payroll.basic_salary = employee.salary
        db_payroll.overtime_pay = overtime_pay
        db_payroll.late_deduction = late_deduction
        db_payroll.deductions = total_deductions
        db_payroll.final_salary = final_salary
        db_payroll.generated_at = datetime.utcnow()
    else:
        # Create new
        db_payroll = Payroll(
            employee_id=employee.employee_id,
            month=month,
            year=year,
            working_days=working_days,
            present_days=int(present_days_count),
            absent_days=int(absent_days),
            late_days=int(late_days_count),
            leave_days=int(leave_days_count),
            overtime_hours=ot_hours,
            basic_salary=employee.salary,
            overtime_pay=overtime_pay,
            late_deduction=late_deduction,
            deductions=total_deductions,
            final_salary=final_salary,
            is_paid=False,
            generated_at=datetime.utcnow()
        )
        db.add(db_payroll)
        
    await db.commit()
    return db_payroll

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

async def preview_individual_payroll(employee: Employee, year: int, month: int, db: AsyncSession) -> dict:
    """
    Returns dynamic calculation preview for an individual employee without persisting to DB.
    Allows Admin to review, inspect, and manually adjust in the UI.
    """
    working_days = get_working_days_in_month(year, month)
    att_stmt = select(Attendance).where(
        and_(
            Attendance.employee_id == employee.employee_id,
            extract("year", Attendance.date) == year,
            extract("month", Attendance.date) == month
        )
    )
    att_result = await db.execute(att_stmt)
    records = att_result.scalars().all()
    
    present_days_count = sum(1 for r in records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH))
    late_days_count = sum(1 for r in records if r.status == AttendanceStatus.LATE)
    half_days_count = sum(1 for r in records if r.status == AttendanceStatus.HALF_DAY)
    leave_days_count = sum(1 for r in records if r.status == AttendanceStatus.LEAVE)
    
    ot_hours = sum(r.overtime_hours or Decimal("0.00") for r in records)
    late_minutes_total = sum(r.late_minutes or 0 for r in records)
    late_hours = Decimal(str(late_minutes_total)) / Decimal("60.0")
    
    present_days = Decimal(str(present_days_count)) + Decimal("0.5") * Decimal(str(half_days_count))
    leave_days = Decimal(str(leave_days_count))
    absent_days = max(Decimal(str(working_days)) - present_days - leave_days, Decimal("0.00"))
    
    daily_rate = employee.salary / Decimal(str(working_days)) if working_days > 0 else Decimal("0.00")
    hourly_rate = daily_rate / Decimal("8.0")
    
    if employee.overtime_rate and employee.overtime_rate > Decimal("0.00"):
        overtime_pay = round(ot_hours * employee.overtime_rate, 2)
        ot_rate_used = float(employee.overtime_rate)
    else:
        ot_multiplier = Decimal(str(settings.OT_MULTIPLIER))
        overtime_pay = round(ot_hours * hourly_rate * ot_multiplier, 2)
        ot_rate_used = float(round(hourly_rate * ot_multiplier, 2))
        
    absent_deduction = round(absent_days * daily_rate, 2)
    
    late_rate_used = float(employee.late_deduction_rate or 0)
    late_type_used = getattr(employee, "late_deduction_type", "per_day") or "per_day"
    if employee.late_deduction_rate and employee.late_deduction_rate > Decimal("0.00"):
        if late_type_used == "per_hour":
            late_deduction = round(late_hours * employee.late_deduction_rate, 2)
        else:
            late_deduction = round(Decimal(str(late_days_count)) * employee.late_deduction_rate, 2)
    else:
        late_deduction = Decimal("0.00")
        
    total_deductions = absent_deduction + late_deduction
    final_salary = max(Decimal("0.00"), employee.salary + overtime_pay - total_deductions)
    
    # Check if an existing saved payroll record exists
    pay_stmt = select(Payroll).where(
        and_(
            Payroll.employee_id == employee.employee_id,
            Payroll.month == month,
            Payroll.year == year
        )
    )
    pay_res = await db.execute(pay_stmt)
    existing = pay_res.scalar_one_or_none()
    
    return {
        "employee_id": employee.employee_id,
        "employee_name": employee.name,
        "employee_code": employee.employee_code,
        "department": employee.department,
        "designation": employee.designation,
        "month": month,
        "year": year,
        "working_days": working_days,
        "present_days": int(present_days_count),
        "half_days": int(half_days_count),
        "absent_days": int(absent_days),
        "late_days": int(late_days_count),
        "late_minutes_total": late_minutes_total,
        "leave_days": int(leave_days_count),
        "overtime_hours": float(ot_hours),
        "basic_salary": float(employee.salary),
        "daily_rate": float(round(daily_rate, 2)),
        "hourly_rate": float(round(hourly_rate, 2)),
        "overtime_rate": ot_rate_used,
        "overtime_pay": float(overtime_pay),
        "late_deduction_rate": late_rate_used,
        "late_deduction_type": late_type_used,
        "late_deduction": float(late_deduction),
        "absent_deduction": float(absent_deduction),
        "total_deductions": float(total_deductions),
        "final_salary": float(final_salary),
        "is_saved": existing is not None,
        "is_paid": existing.is_paid if existing else False,
        "payroll_id": existing.payroll_id if existing else None,
        "remarks": getattr(existing, "remarks", "") if existing else "",
        "bonus": float(existing.bonus or 0) if existing else 0.0
    }
