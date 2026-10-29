import calendar
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Attendance, AttendanceStatus, Employee
from server.schemas.attendance import (
    AttendanceOut,
    AttendanceManualEntry,
    AttendanceStats,
    AttendanceUpdate,
    UpdateSessionsPayload,
)
import json
from datetime import timedelta
from server.utils.time_utils import get_current_local_date, get_current_local_time
from server.services.excel_service import (
    generate_daily_attendance_excel,
    generate_historical_attendance_excel,
)
from server.services.pdf_service import (
    generate_daily_attendance_pdf,
    generate_historical_attendance_pdf,
)

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/my", response_model=List[AttendanceOut])
async def my_attendance(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's own attendance records for the given month and year."""
    from sqlalchemy import extract
    stmt = (
        select(Attendance)
        .options(joinedload(Attendance.employee))
        .where(
            and_(
                Attendance.employee_id == current_user.employee_id,
                extract("month", Attendance.date) == month,
                extract("year", Attendance.date) == year
            )
        )
        .order_by(Attendance.date.desc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    from server.services.attendance_service import calculate_late_minutes
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            late_minutes=r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else (calculate_late_minutes(r.check_in.time(), r.date) if (r.check_in and r.status == AttendanceStatus.LATE and r.date.weekday() != 6) else 0),
            status=r.status,
            source=r.source,
            checkout_count=getattr(r, "checkout_count", 0) or 0,
            punches=getattr(r, "punches", "[]") or "[]",
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        )
        for r in records
    ]

@router.get("/my-stats")
async def my_attendance_stats(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's monthly attendance statistics for the given month and year."""
    from sqlalchemy import extract
    from server.utils.time_utils import get_working_days_in_month, get_elapsed_working_days, get_current_local_date
    from server.services.attendance_service import calculate_late_minutes

    stmt = (
        select(Attendance)
        .where(
            and_(
                Attendance.employee_id == current_user.employee_id,
                extract("month", Attendance.date) == month,
                extract("year", Attendance.date) == year
            )
        )
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    standard_records = [r for r in records if r.date.weekday() != 6]
    on_time_days = sum(1 for r in standard_records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.WFH))
    late_days = sum(1 for r in standard_records if r.status == AttendanceStatus.LATE)
    half_day_days = sum(1 for r in standard_records if r.status == AttendanceStatus.HALF_DAY)
    leave_days = sum(1 for r in standard_records if r.status == AttendanceStatus.LEAVE)
    
    # Total standard working days attended at work (Sundays are overtime, not regular working days)
    present_days = on_time_days + late_days + half_day_days

    overtime_hours = sum(float(r.overtime_hours or 0) for r in records)
    total_working_hours = sum(float(r.working_hours or 0) for r in records)

    total_late_minutes = sum(
        (r.late_minutes if (hasattr(r, "late_minutes") and r.late_minutes and r.late_minutes > 0)
         else (calculate_late_minutes(r.check_in.time(), r.date) if (r.check_in and r.status == AttendanceStatus.LATE and r.date.weekday() != 6) else 0))
        for r in standard_records
    )
    total_late_hours = round(total_late_minutes / 60.0, 2)

    total_working_days = get_working_days_in_month(year, month)
    today = get_current_local_date()
    working_days_elapsed = get_elapsed_working_days(year, month, as_of_date=today)

    absent_days = max(0, working_days_elapsed - present_days - leave_days)

    return {
        "present_days": present_days,
        "on_time_days": on_time_days,
        "late_days": late_days,
        "half_day_days": half_day_days,
        "absent_days": absent_days,
        "leave_days": leave_days,
        "late_minutes": total_late_minutes,
        "late_hours": total_late_hours,
        "overtime_hours": round(overtime_hours, 2),
        "total_working_hours": round(total_working_hours, 2),
        "working_days_total": total_working_days,
        "working_days_elapsed": working_days_elapsed
    }

@router.get("", response_model=List[AttendanceOut])
async def list_attendance(
    attendance_date: Optional[date] = Query(None, alias="date"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    department: Optional[str] = None,
    employee_id: Optional[int] = None,
    status_filter: Optional[AttendanceStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists attendance records with filters for date, date range (start_date to end_date),
    month/year (from day 1 to end of month), employee_id, department, and status.
    Employees can only view their own history unless they are an admin.
    """
    # Enforce access control
    if current_user.role != "admin":
        employee_id = current_user.employee_id

    stmt = select(Attendance).options(joinedload(Attendance.employee))
    
    # If month and year are specified without explicit dates, calculate full month range
    if month and year and not attendance_date and not start_date:
        start_date = date(year, month, 1)
        _, last_day = calendar.monthrange(year, month)
        end_date = date(year, month, last_day)

    if attendance_date:
        stmt = stmt.where(Attendance.date == attendance_date)
    elif start_date and end_date:
        stmt = stmt.where(and_(Attendance.date >= start_date, Attendance.date <= end_date))
    elif start_date:
        stmt = stmt.where(Attendance.date >= start_date)
    elif end_date:
        stmt = stmt.where(Attendance.date <= end_date)

    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if status_filter:
        stmt = stmt.where(Attendance.status == status_filter)
    if department:
        stmt = stmt.join(Attendance.employee).where(Employee.department == department)
        
    stmt = stmt.order_by(Attendance.date.desc(), Attendance.check_in.desc(), Attendance.employee_id.asc())
    
    # Pagination
    offset = (page - 1) * size
    stmt = stmt.offset(offset).limit(size)
    
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    # Map to schema output (include employee name, dept, and late_minutes)
    out_records = []
    for r in records:
        out_records.append(AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            late_minutes=r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else 0,
            status=r.status,
            source=r.source,
            checkout_count=getattr(r, "checkout_count", 0) or 0,
            punches=getattr(r, "punches", "[]") or "[]",
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        ))
    return out_records


@router.get("/export")
async def export_attendance(
    attendance_date: Optional[date] = Query(None, alias="date"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    department: Optional[str] = None,
    export_format: str = Query("excel", alias="format", pattern="^(excel|pdf)$"),
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Exports daily or historical attendance data (from day 1 to end of month, or date range)
    complete with exact check-in / check-out timestamps and hours into Excel (.xlsx) or PDF (.pdf).
    """
    # Resolve date range
    if month and year and not attendance_date and not start_date:
        start_date = date(year, month, 1)
        _, last_day = calendar.monthrange(year, month)
        end_date = date(year, month, last_day)
    elif attendance_date and not start_date:
        start_date = attendance_date
        end_date = attendance_date
    elif not start_date:
        # Default to current month from day 1 to today
        today = get_current_local_date()
        start_date = date(today.year, today.month, 1)
        end_date = today

    if not end_date:
        end_date = start_date

    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        and_(Attendance.date >= start_date, Attendance.date <= end_date)
    )

    if department:
        stmt = stmt.join(Attendance.employee).where(Employee.department == department)

    stmt = stmt.order_by(Attendance.date.desc(), Attendance.check_in.desc(), Attendance.employee_id.asc())

    res = await db.execute(stmt)
    records = res.scalars().all()

    mapped_records = []
    for r in records:
        mapped_records.append({
            "date": r.date,
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "department": r.employee.department if r.employee else "N/A",
            "check_in": r.check_in,
            "check_out": r.check_out,
            "working_hours": r.working_hours,
            "late_minutes": r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else 0,
            "overtime_hours": r.overtime_hours,
            "status": r.status,
            "source": r.source
        })

    is_single_day = (start_date == end_date)

    if is_single_day:
        date_str = start_date.strftime("%Y-%m-%d")
        if export_format == "excel":
            excel_bytes = generate_daily_attendance_excel(start_date, mapped_records)
            return Response(
                content=excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename=Daily_Attendance_{date_str}.xlsx"}
            )
        else:
            pdf_bytes = generate_daily_attendance_pdf(start_date, mapped_records)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=Daily_Attendance_{date_str}.pdf"}
            )
    else:
        period_str = f"{start_date.strftime('%Y%m%d')}_to_{end_date.strftime('%Y%m%d')}"
        title = f"HISTORICAL ATTENDANCE REPORT ({start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')})"
        if export_format == "excel":
            excel_bytes = generate_historical_attendance_excel(start_date, end_date, mapped_records, title=title)
            return Response(
                content=excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename=Historical_Attendance_{period_str}.xlsx"}
            )
        else:
            pdf_bytes = generate_historical_attendance_pdf(start_date, end_date, mapped_records, title=title)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=Historical_Attendance_{period_str}.pdf"}
            )


@router.get("/today", response_model=List[AttendanceOut])
async def today_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Lists all attendance records for today (Admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privilege required")
        
    today = get_current_local_date()
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(Attendance.date == today)
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    from server.services.attendance_service import calculate_late_minutes
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            late_minutes=r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else (calculate_late_minutes(r.check_in.time(), r.date) if (r.check_in and r.status == AttendanceStatus.LATE and r.date.weekday() != 6) else 0),
            status=r.status,
            source=r.source,
            checkout_count=getattr(r, "checkout_count", 0) or 0,
            punches=getattr(r, "punches", "[]") or "[]",
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        )
        for r in records
    ]

@router.get("/live", response_model=List[AttendanceOut])
async def live_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the last 20 attendance check-ins/check-outs for today."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privilege required")
        
    today = get_current_local_date()
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.date == today
    ).order_by(Attendance.created_at.desc()).limit(20)
    
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    # If no records exist today yet (e.g. before office hours), show recent activity from previous days
    if not records:
        stmt_fb = select(Attendance).options(joinedload(Attendance.employee)).order_by(
            Attendance.created_at.desc()
        ).limit(20)
        res_fb = await db.execute(stmt_fb)
        records = res_fb.scalars().all()
    
    from server.services.attendance_service import calculate_late_minutes
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            late_minutes=r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else (calculate_late_minutes(r.check_in.time()) if (r.check_in and r.status == AttendanceStatus.LATE) else 0),
            status=r.status,
            source=r.source,
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A",
            checkout_count=getattr(r, "checkout_count", 0) or 0,
            punches=getattr(r, "punches", "[]") or "[]")
        for r in records
    ]

@router.get("/stats/today", response_model=AttendanceStats)
async def get_today_stats(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns attendance summary statistics for today (total active, present, absent, late, leave, overtime, late hours)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privilege required")
        
    today = get_current_local_date()
    from server.services.attendance_service import calculate_late_minutes
    
    # Total active employees
    tot_stmt = select(func.count(Employee.employee_id)).where(Employee.is_active == True)
    tot_res = await db.execute(tot_stmt)
    total_active = tot_res.scalar() or 0
    
    # Query today's attendance records
    att_stmt = select(Attendance).where(Attendance.date == today)
    att_res = await db.execute(att_stmt)
    records = att_res.scalars().all()
    
    present = sum(1 for r in records if r.status == AttendanceStatus.PRESENT)
    late = sum(1 for r in records if r.status == AttendanceStatus.LATE)
    leave = sum(1 for r in records if r.status == AttendanceStatus.LEAVE)
    # WFH/Half Day are present variants
    wfh_or_half = sum(1 for r in records if r.status in (AttendanceStatus.WFH, AttendanceStatus.HALF_DAY))
    
    present_total = present + late + wfh_or_half
    
    # On Sunday, non-working employees are on Holiday / Weekly Off, NOT Absent
    is_today_sunday = (today.weekday() == 6)
    if is_today_sunday:
        absent = 0
        holiday = max(total_active - present_total - leave, 0)
    else:
        absent = max(total_active - present_total - leave, 0)
        holiday = 0

    # Today's overtime and late hours
    today_overtime_hours = sum(float(r.overtime_hours or 0) for r in records)
    today_late_minutes = sum(
        (r.late_minutes if (hasattr(r, "late_minutes") and r.late_minutes and r.late_minutes > 0)
         else (calculate_late_minutes(r.check_in.time()) if (r.check_in and r.status == AttendanceStatus.LATE) else 0))
        for r in records
    )
    today_late_hours = round(today_late_minutes / 60.0, 2)

    # Current month cumulative stats
    first_of_month = date(today.year, today.month, 1)
    month_stmt = select(Attendance).where(
        and_(
            Attendance.date >= first_of_month,
            Attendance.date <= today
        )
    )
    month_res = await db.execute(month_stmt)
    month_records = month_res.scalars().all()

    month_overtime_hours = sum(float(r.overtime_hours or 0) for r in month_records)
    month_late_minutes = sum(
        (r.late_minutes if (hasattr(r, "late_minutes") and r.late_minutes and r.late_minutes > 0)
         else (calculate_late_minutes(r.check_in.time()) if (r.check_in and r.status == AttendanceStatus.LATE) else 0))
        for r in month_records
    )
    month_late_hours = round(month_late_minutes / 60.0, 2)
    
    return {
        "total": total_active,
        "present": present_total,
        "absent": absent,
        "late": late,
        "leave": leave,
        "holiday": holiday,
        "overtime_hours": round(today_overtime_hours, 2),
        "late_minutes": today_late_minutes,
        "late_hours": today_late_hours,
        "month_overtime_hours": round(month_overtime_hours, 2),
        "month_late_hours": month_late_hours,
        "month_late_minutes": month_late_minutes,
    }

@router.get("/analytics")
async def get_attendance_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns real analytics data for dashboard charts (Weekly, Dept-wise, and Payroll)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privilege required")

    from datetime import timedelta
    from server.models import Payroll
    today = get_current_local_date()

    # 1. Total active employees
    tot_stmt = select(func.count(Employee.employee_id)).where(Employee.is_active == True)
    tot_res = await db.execute(tot_stmt)
    total_active = tot_res.scalar() or 0

    # 2. Weekly Attendance (Last 7 days)
    weekly = []
    day_abbrs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    start_date = today - timedelta(days=6)
    
    att_stmt = select(Attendance).where(Attendance.date >= start_date, Attendance.date <= today)
    att_res = await db.execute(att_stmt)
    week_records = att_res.scalars().all()

    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_records = [r for r in week_records if r.date == d]
        pres_count = sum(1 for r in day_records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH, AttendanceStatus.HALF_DAY))
        weekly.append({
            "day": day_abbrs[d.weekday()],
            "date": d.strftime("%Y-%m-%d"),
            "attendance": pres_count,
            "target": total_active
        })

    # 3. Department-wise Attendance for Today
    emp_stmt = select(Employee).where(Employee.is_active == True)
    emp_res = await db.execute(emp_stmt)
    all_employees = emp_res.scalars().all()

    dept_map = {}
    for emp in all_employees:
        dept = emp.department or "General"
        if dept not in dept_map:
            dept_map[dept] = {"total": 0, "present": 0}
        dept_map[dept]["total"] += 1

    today_att_stmt = select(Attendance).where(Attendance.date == today)
    today_att_res = await db.execute(today_att_stmt)
    today_records = today_att_res.scalars().all()
    present_emp_ids = {r.employee_id for r in today_records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH, AttendanceStatus.HALF_DAY)}

    for emp in all_employees:
        if emp.employee_id in present_emp_ids:
            dept = emp.department or "General"
            dept_map[dept]["present"] += 1

    departments = []
    for dept, data in dept_map.items():
        pct = round((data["present"] / data["total"]) * 100) if data["total"] > 0 else 0
        departments.append({
            "dept": dept,
            "total": data["total"],
            "present": pct
        })

    if not departments:
        departments = [
            {"dept": "Engineering", "total": 0, "present": 0},
            {"dept": "HR", "total": 0, "present": 0},
            {"dept": "Finance", "total": 0, "present": 0},
            {"dept": "Operations", "total": 0, "present": 0}
        ]

    # 4. Monthly Payroll Trend (Last 6 Months)
    payroll_trend = []
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    est_monthly_payroll = sum(float(e.salary or 0) for e in all_employees)

    cur_y, cur_m = today.year, today.month
    months_to_check = []
    for offset in range(5, -1, -1):
        m = cur_m - offset
        y = cur_y
        while m <= 0:
            m += 12
            y -= 1
        months_to_check.append((y, m))

    p_stmt = select(Payroll).where(Payroll.year >= months_to_check[0][0])
    p_res = await db.execute(p_stmt)
    all_payrolls = p_res.scalars().all()

    for y, m in months_to_check:
        month_payrolls = [p for p in all_payrolls if p.year == y and p.month == m]
        if month_payrolls:
            total_pay = sum(float(p.final_salary or 0) for p in month_payrolls)
        else:
            total_pay = est_monthly_payroll if (y == cur_y and m == cur_m) else 0.0

        payroll_trend.append({
            "month": month_names[m],
            "year": y,
            "payroll": round(total_pay, 2)
        })

    return {
        "weekly": weekly,
        "departments": departments,
        "payroll_trend": payroll_trend
    }

@router.post("", response_model=AttendanceOut)
@router.post("/manual", response_model=AttendanceOut)
async def manual_entry(
    entry: AttendanceManualEntry,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Allows admin to manually insert a new attendance log."""
    # Check if employee exists
    emp_stmt = select(Employee).where(Employee.employee_id == entry.employee_id).where(Employee.is_active == True)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    # Check if attendance already exists for that date
    att_stmt = select(Attendance).where(
        and_(
            Attendance.employee_id == entry.employee_id,
            Attendance.date == entry.date
        )
    )
    att_res = await db.execute(att_stmt)
    existing = att_res.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance record already exists for this date")
        
    # Calculate hours and late minutes if check-in and check-out are provided
    is_sunday = (entry.date.weekday() == 6)
    working_hours = None
    overtime_hours = 0.0
    late_minutes = 0
    if entry.check_in and entry.check_out:
        from server.services.attendance_service import calculate_hours
        working_hours, overtime_hours = calculate_hours(entry.check_in, entry.check_out)

    if entry.check_in and not is_sunday:
        from server.services.attendance_service import calculate_late_minutes
        late_minutes = calculate_late_minutes(entry.check_in.time(), entry.date)
        
    status_to_save = entry.status
    if is_sunday:
        status_to_save = AttendanceStatus.PRESENT
        late_minutes = 0
        overtime_hours = working_hours or 0.0
    elif entry.status == AttendanceStatus.PRESENT and late_minutes > 0:
        status_to_save = AttendanceStatus.LATE

    manual_punches = []
    checkout_cnt = 0
    if entry.check_in:
        manual_punches.append({
            "session": 1,
            "in": entry.check_in.strftime("%Y-%m-%d %H:%M:%S"),
            "out": entry.check_out.strftime("%Y-%m-%d %H:%M:%S") if entry.check_out else None,
            "hours": float(working_hours) if working_hours else 0.0
        })
        if entry.check_out:
            checkout_cnt = 1

    db_attendance = Attendance(
        employee_id=entry.employee_id,
        date=entry.date,
        check_in=entry.check_in,
        check_out=entry.check_out,
        working_hours=working_hours,
        overtime_hours=overtime_hours,
        late_minutes=late_minutes,
        status=status_to_save,
        source="manual",
        punches=json.dumps(manual_punches),
        checkout_count=checkout_cnt,
        created_at=datetime.utcnow()
    )
    
    db.add(db_attendance)
    await db.commit()
    
    # Reload with joined employee
    stmt_reload = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.attendance_id == db_attendance.attendance_id
    )
    res_reload = await db.execute(stmt_reload)
    record = res_reload.scalar_one()
    
    return AttendanceOut(
        attendance_id=record.attendance_id,
        employee_id=record.employee_id,
        date=record.date,
        check_in=record.check_in,
        check_out=record.check_out,
        working_hours=record.working_hours,
        overtime_hours=record.overtime_hours,
        late_minutes=record.late_minutes if hasattr(record, "late_minutes") and record.late_minutes else late_minutes,
        status=record.status,
        source=record.source,
        checkout_count=record.checkout_count or 0,
        punches=record.punches or "[]",
        created_at=record.created_at,
        employee_name=record.employee.name if record.employee else "Unknown",
        employee_dept=record.employee.department if record.employee else "N/A"
    )

@router.put("/{attendance_id}", response_model=AttendanceOut)
async def update_attendance(
    attendance_id: int,
    updates: AttendanceUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Allows admin to modify details of an attendance record."""
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.attendance_id == attendance_id
    )
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
        
    # Apply updates
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
        
    # Recalculate hours and late minutes if check_in/check_out changed
    if updates.check_in or updates.check_out or updates.date:
        from server.services.attendance_service import calculate_hours, calculate_late_minutes
        is_rec_sunday = (record.date.weekday() == 6)
        if record.check_in and record.check_out:
            working_hours, overtime_hours = calculate_hours(record.check_in, record.check_out)
            record.working_hours = working_hours
            if is_rec_sunday:
                record.overtime_hours = working_hours
                record.late_minutes = 0
                record.status = AttendanceStatus.PRESENT
            else:
                record.overtime_hours = overtime_hours
                record.late_minutes = calculate_late_minutes(record.check_in.time(), record.date)
        elif is_rec_sunday:
            record.late_minutes = 0
        
    await db.commit()
    await db.refresh(record)
    
    from server.services.attendance_service import calculate_late_minutes
    return AttendanceOut(
        attendance_id=record.attendance_id,
        employee_id=record.employee_id,
        date=record.date,
        check_in=record.check_in,
        check_out=record.check_out,
        working_hours=record.working_hours,
        overtime_hours=record.overtime_hours,
        late_minutes=record.late_minutes if hasattr(record, "late_minutes") and record.late_minutes else (calculate_late_minutes(record.check_in.time(), record.date) if (record.check_in and record.status == AttendanceStatus.LATE and record.date.weekday() != 6) else 0),
        status=record.status,
        source=record.source,
        checkout_count=record.checkout_count or 0,
        punches=record.punches or "[]",
        created_at=record.created_at,
        employee_name=record.employee.name if record.employee else "Unknown",
        employee_dept=record.employee.department if record.employee else "N/A"
    )

@router.put("/{attendance_id}/sessions", response_model=AttendanceOut)
async def update_attendance_sessions(
    attendance_id: int,
    payload: UpdateSessionsPayload,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Allows admin to edit, delete, or append individual punch sessions / checkpoints.
    Recalculates individual session hours, cumulative working hours, checkout count,
    overtime (including 100% overtime on Sundays), and late status.
    """
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.attendance_id == attendance_id
    )
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    def parse_dt(dt_val: Optional[str], fallback_date: date) -> Optional[datetime]:
        if not dt_val or str(dt_val).strip() in ("", "—", "-", "None", "null"):
            return None
        s = str(dt_val).strip()
        if len(s) <= 8 and ":" in s and "-" not in s and "/" not in s:
            parts = s.split(":")
            hh = int(parts[0])
            mm = int(parts[1])
            ss = int(parts[2]) if len(parts) > 2 else 0
            return datetime(fallback_date.year, fallback_date.month, fallback_date.day, hh, mm, ss)

        try:
            return datetime.fromisoformat(s.replace("Z", ""))
        except Exception:
            pass

        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%d",
            "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
        ):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                pass
        return None

    cleaned_sessions = []
    total_working_hours = 0.0
    completed_checkouts = 0

    for idx, s in enumerate(payload.sessions, start=1):
        in_dt = parse_dt(s.in_time, record.date)
        if not in_dt:
            continue
        out_dt = parse_dt(s.out_time, in_dt.date()) if s.out_time else None

        session_hours = None
        if out_dt:
            if out_dt < in_dt and (in_dt - out_dt).total_seconds() < 86400:
                out_dt = out_dt + timedelta(days=1)
            diff_sec = max(0.0, (out_dt - in_dt).total_seconds())
            duration = round(diff_sec / 3600.0, 2)
            session_hours = duration
            total_working_hours += duration
            completed_checkouts += 1

        cleaned_sessions.append({
            "session": idx,
            "in": in_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "out": out_dt.strftime("%Y-%m-%d %H:%M:%S") if out_dt else None,
            "hours": session_hours
        })

    is_sunday = (record.date.weekday() == 6)

    if not cleaned_sessions:
        record.check_in = None
        record.check_out = None
        record.working_hours = 0.0
        record.overtime_hours = 0.0
        record.late_minutes = 0
        record.checkout_count = 0
        record.punches = "[]"
        record.status = AttendanceStatus.HOLIDAY if is_sunday else AttendanceStatus.ABSENT
    else:
        first_in = parse_dt(cleaned_sessions[0]["in"], record.date)
        record.check_in = first_in

        last_out_str = cleaned_sessions[-1]["out"]
        record.check_out = parse_dt(last_out_str, first_in.date()) if last_out_str else None

        record.working_hours = round(total_working_hours, 2)
        record.checkout_count = completed_checkouts
        record.punches = json.dumps(cleaned_sessions)

        if is_sunday:
            record.status = AttendanceStatus.PRESENT
            record.late_minutes = 0
            record.overtime_hours = round(total_working_hours, 2)
        else:
            from server.services.attendance_service import calculate_late_minutes
            record.late_minutes = calculate_late_minutes(first_in.time(), record.date)

            if total_working_hours > 8.0:
                record.overtime_hours = round(total_working_hours - 8.0, 2)
            else:
                record.overtime_hours = 0.0

            if record.late_minutes > 0:
                record.status = AttendanceStatus.LATE
            elif total_working_hours >= 4.0 or (len(cleaned_sessions) > 0 and record.check_out is None):
                record.status = AttendanceStatus.PRESENT
            elif total_working_hours > 0:
                record.status = AttendanceStatus.HALF_DAY
            else:
                record.status = AttendanceStatus.PRESENT

    await db.commit()
    await db.refresh(record)

    from server.services.attendance_service import calculate_late_minutes
    return AttendanceOut(
        attendance_id=record.attendance_id,
        employee_id=record.employee_id,
        date=record.date,
        check_in=record.check_in,
        check_out=record.check_out,
        working_hours=record.working_hours,
        overtime_hours=record.overtime_hours,
        late_minutes=record.late_minutes if hasattr(record, "late_minutes") and record.late_minutes else (calculate_late_minutes(record.check_in.time(), record.date) if (record.check_in and record.status == AttendanceStatus.LATE and record.date.weekday() != 6) else 0),
        status=record.status,
        source=record.source,
        checkout_count=record.checkout_count or 0,
        punches=record.punches or "[]",
        created_at=record.created_at,
        employee_name=record.employee.name if record.employee else "Unknown",
        employee_dept=record.employee.department if record.employee else "N/A"
    )

@router.delete("/{attendance_id}")
async def delete_attendance(
    attendance_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Allows admin to delete an attendance record."""
    stmt = select(Attendance).where(Attendance.attendance_id == attendance_id)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
        
    await db.delete(record)
    await db.commit()
    return {"message": "Attendance record deleted successfully"}

@router.get("/{employee_id}/history", response_model=List[AttendanceOut])
async def get_history(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Retrieves full attendance history for a single employee."""
    if current_user.role != "admin" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.employee_id == employee_id
    ).order_by(Attendance.date.desc())
    
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    from server.services.attendance_service import calculate_late_minutes
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            late_minutes=r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else (calculate_late_minutes(r.check_in.time()) if (r.check_in and r.status == AttendanceStatus.LATE) else 0),
            status=r.status,
            source=r.source,
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A",
            checkout_count=getattr(r, "checkout_count", 0) or 0,
            punches=getattr(r, "punches", "[]") or "[]")
        for r in records
    ]
