from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Attendance, AttendanceStatus, Employee
from server.schemas.attendance import AttendanceOut, AttendanceManualEntry, AttendanceStats, AttendanceUpdate

router = APIRouter(prefix="/attendance", tags=["Attendance"])

@router.get("", response_model=List[AttendanceOut])
async def list_attendance(
    attendance_date: Optional[date] = Query(None, alias="date"),
    employee_id: Optional[int] = None,
    status_filter: Optional[AttendanceStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists attendance records with filters for date, employee_id, and status.
    Employees can only view their own history unless they are an admin.
    """
    # Enforce access control
    if current_user.role != "admin":
        employee_id = current_user.employee_id

    stmt = select(Attendance).options(joinedload(Attendance.employee))
    
    if attendance_date:
        stmt = stmt.where(Attendance.date == attendance_date)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if status_filter:
        stmt = stmt.where(Attendance.status == status_filter)
        
    stmt = stmt.order_by(Attendance.date.desc(), Attendance.check_in.desc())
    
    # Pagination
    offset = (page - 1) * size
    stmt = stmt.offset(offset).limit(size)
    
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    # Map to schema output (include employee name)
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
            status=r.status,
            source=r.source,
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        ))
    return out_records

@router.get("/today", response_model=List[AttendanceOut])
async def today_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Lists all attendance records for today (Admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=433, detail="Admin privilege required")
        
    today = date.today()
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(Attendance.date == today)
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            status=r.status,
            source=r.source,
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
        
    today = date.today()
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
    
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            status=r.status,
            source=r.source,
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        )
        for r in records
    ]

@router.get("/stats/today", response_model=AttendanceStats)
async def get_today_stats(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns attendance summary statistics for today (total active, present, absent, late, leave)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privilege required")
        
    today = date.today()
    
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
    
    # Absent count is active employees without check-in who aren't on leave
    absent = max(total_active - present_total - leave, 0)
    
    return {
        "total": total_active,
        "present": present_total,
        "absent": absent,
        "late": late,
        "leave": leave
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
    today = date.today()

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
        
    # Calculate hours if check-in and check-out are provided
    working_hours = None
    overtime_hours = 0.0
    if entry.check_in and entry.check_out:
        from server.services.attendance_service import calculate_hours
        working_hours, overtime_hours = calculate_hours(entry.check_in, entry.check_out)
        
    db_attendance = Attendance(
        employee_id=entry.employee_id,
        date=entry.date,
        check_in=entry.check_in,
        check_out=entry.check_out,
        working_hours=working_hours,
        overtime_hours=overtime_hours,
        status=entry.status,
        source="manual",
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
        status=record.status,
        source=record.source,
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
        
    # Recalculate hours if check_in/check_out changed
    if updates.check_in or updates.check_out:
        from server.services.attendance_service import calculate_hours
        working_hours, overtime_hours = calculate_hours(record.check_in, record.check_out)
        record.working_hours = working_hours
        record.overtime_hours = overtime_hours
        
    await db.commit()
    await db.refresh(record)
    
    return AttendanceOut(
        attendance_id=record.attendance_id,
        employee_id=record.employee_id,
        date=record.date,
        check_in=record.check_in,
        check_out=record.check_out,
        working_hours=record.working_hours,
        overtime_hours=record.overtime_hours,
        status=record.status,
        source=record.source,
        created_at=record.created_at,
        employee_name=record.employee.name if record.employee else "Unknown",
        employee_dept=record.employee.department if record.employee else "N/A"
    )

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
    
    return [
        AttendanceOut(
            attendance_id=r.attendance_id,
            employee_id=r.employee_id,
            date=r.date,
            check_in=r.check_in,
            check_out=r.check_out,
            working_hours=r.working_hours,
            overtime_hours=r.overtime_hours,
            status=r.status,
            source=r.source,
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            employee_dept=r.employee.department if r.employee else "N/A"
        )
        for r in records
    ]
