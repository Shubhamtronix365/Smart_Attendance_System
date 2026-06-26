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
    half_days_count = sum(1 for r in records if r.status == AttendanceStatus.HALF_DAY)
    leave_days_count = sum(1 for r in records if r.status == AttendanceStatus.LEAVE)
    
    # Overtime hours
    ot_hours = sum(r.overtime_hours or Decimal("0.00") for r in records)
    
    # Financial math:
    # 1. Base present days (half day counts as 0.5 present, 0.5 absent)
    present_days = Decimal(str(present_days_count)) + Decimal("0.5") * Decimal(str(half_days_count))
    leave_days = Decimal(str(leave_days_count))
    
    # 2. Absent days = working_days - present_days - leave_days (capped at 0)
    absent_days = Decimal(str(working_days)) - present_days - leave_days
    absent_days = max(absent_days, Decimal("0.00"))
    
    # 3. Rates and pay
    daily_rate = employee.salary / Decimal(str(working_days))
    
    # OT Pay = OT Hours * (Hourly Rate) * OT_MULTIPLIER
    # Hourly Rate = Daily Rate / 8
    hourly_rate = daily_rate / Decimal("8.0")
    ot_multiplier = Decimal(str(settings.OT_MULTIPLIER))
    overtime_pay = ot_hours * hourly_rate * ot_multiplier
    
    # Deductions = Absent Days * Daily Rate
    deductions = absent_days * daily_rate
    
    # Final Salary = Basic Salary + Overtime Pay - Deductions
    final_salary = employee.salary + overtime_pay - deductions
    # Prevent negative salary in extreme deduction cases
    final_salary = max(final_salary, Decimal("0.00"))
    
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
        db_payroll.leave_days = int(leave_days_count)
        db_payroll.overtime_hours = ot_hours
        db_payroll.basic_salary = employee.salary
        db_payroll.overtime_pay = overtime_pay
        db_payroll.deductions = deductions
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
            leave_days=int(leave_days_count),
            overtime_hours=ot_hours,
            basic_salary=employee.salary,
            overtime_pay=overtime_pay,
            deductions=deductions,
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
