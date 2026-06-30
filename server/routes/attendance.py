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
    # For simplicity, we can do: active - present_total - leave
    absent = max(total_active - present_total - leave, 0)
    
    return {
        "total": total_active,
        "present": present_total,
        "absent": absent,
        "late": late,
        "leave": leave
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
