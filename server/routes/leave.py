from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_, extract, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Leave, LeaveStatus, LeaveType, Employee, Attendance, AttendanceStatus
from server.schemas.leave import LeaveOut, LeaveCreate, LeaveRejection, LeaveBalance
from server.routes.websocket import ws_manager
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/leave", tags=["Leaves"])

# Standard Annual Quotas
CASUAL_LEAVE_QUOTA = 12
SICK_LEAVE_QUOTA = 10
PAID_LEAVE_QUOTA = 15

@router.get("", response_model=List[LeaveOut])
async def list_leaves(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists leave requests.
    Admin gets to see all requests; employees can only view their own requests.
    """
    stmt = select(Leave).options(
        joinedload(Leave.employee),
        joinedload(Leave.approver)
    )
    
    if current_user.role != "admin":
        stmt = stmt.where(Leave.employee_id == current_user.employee_id)
        
    stmt = stmt.order_by(Leave.created_at.desc())
    
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    return [
        LeaveOut(
            leave_id=r.leave_id,
            employee_id=r.employee_id,
            leave_type=r.leave_type,
            start_date=r.start_date,
            end_date=r.end_date,
            reason=r.reason,
            approval_status=r.approval_status,
            approved_by=r.approved_by,
            rejection_reason=r.rejection_reason,
            user_notified=bool(r.user_notified),
            created_at=r.created_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            approver_name=r.approver.name if r.approver else None,
            employee_dept=r.employee.department if r.employee else "General"
        )
        for r in records
    ]

@router.post("/request", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def submit_leave_request(
    request_data: LeaveCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Submits a new leave request (Employee action). Cross-verifies against Holidays and Sundays."""
    if request_data.start_date > request_data.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after end date"
        )

    from server.models.holiday import Holiday
    from datetime import timedelta

    # 1. Cross-verify against Company Holidays and Sundays
    hol_stmt = select(Holiday).where(
        and_(
            Holiday.date >= request_data.start_date,
            Holiday.date <= request_data.end_date
        )
    )
    hol_res = await db.execute(hol_stmt)
    overlapping_holidays = hol_res.scalars().all()
    hol_dict = {h.date: h.name for h in overlapping_holidays}

    total_days = (request_data.end_date - request_data.start_date).days + 1
    working_days = 0
    holiday_days = 0
    sunday_days = 0

    curr = request_data.start_date
    while curr <= request_data.end_date:
        if curr.weekday() == 6:
            sunday_days += 1
        elif curr in hol_dict:
            holiday_days += 1
        else:
            working_days += 1
        curr += timedelta(days=1)

    # If single day requested:
    if request_data.start_date == request_data.end_date:
        if request_data.start_date.weekday() == 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{request_data.start_date.strftime('%d/%m/%Y')} is a Sunday (Fixed Weekly Off). You do not need to apply for leave on this day."
            )
        if request_data.start_date in hol_dict:
            h_name = hol_dict[request_data.start_date]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{request_data.start_date.strftime('%d/%m/%Y')} is already an official Company Holiday ('{h_name}'). You do not need to apply for leave on this day."
            )

    # If multi-day requested and there are ZERO working days:
    if working_days == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"All selected dates ({request_data.start_date.strftime('%d/%m/%Y')} to {request_data.end_date.strftime('%d/%m/%Y')}) are already Company Holidays or Sundays. Leave application is not required."
        )

    # If some days overlap with holidays/Sundays, append transparent notice to reason
    final_reason = request_data.reason or ""
    if holiday_days > 0 or sunday_days > 0:
        notes = []
        if holiday_days > 0:
            notes.append(f"{holiday_days} holiday(s)")
        if sunday_days > 0:
            notes.append(f"{sunday_days} Sunday(s)")
        final_reason += f" [Note: {', '.join(notes)} excluded from consumed leave duration]"

    db_leave = Leave(
        employee_id=current_user.employee_id,
        leave_type=request_data.leave_type,
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        reason=final_reason.strip(),
        approval_status=LeaveStatus.PENDING,
        created_at=datetime.utcnow()
    )
    
    db.add(db_leave)
    await db.commit()
    
    # Reload to join employee name
    stmt = select(Leave).options(joinedload(Leave.employee)).where(Leave.leave_id == db_leave.leave_id)
    res = await db.execute(stmt)
    r = res.scalar_one()

    log_info(
        "LEAVE",
        "LEAVE_REQUESTED",
        f"Leave application #{r.leave_id} submitted by {r.employee.name if r.employee else current_user.name}.\nType: {r.leave_type}, Period: {r.start_date} to {r.end_date}, Reason: {r.reason or 'None'}.",
        leave_id=r.leave_id,
        employee_id=current_user.employee_code or str(current_user.employee_id),
        employee_name=r.employee.name if r.employee else current_user.name,
        leave_type=r.leave_type,
        start_date=str(r.start_date),
        end_date=str(r.end_date),
        source="EMPLOYEE_PORTAL",
        action="Submit Leave Request",
        result="PENDING"
    )

    # Broadcast real-time websocket event
    try:
        await ws_manager.broadcast_to_clients({
            "event": "leave_created",
            "leave_id": r.leave_id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "leave_type": r.leave_type,
            "start_date": str(r.start_date),
            "end_date": str(r.end_date),
            "status": "pending"
        })
    except Exception:
        pass
    
    return LeaveOut(
        leave_id=r.leave_id,
        employee_id=r.employee_id,
        leave_type=r.leave_type,
        start_date=r.start_date,
        end_date=r.end_date,
        reason=r.reason,
        approval_status=r.approval_status,
        approved_by=r.approved_by,
        rejection_reason=r.rejection_reason,
        user_notified=bool(r.user_notified),
        created_at=r.created_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        approver_name=None,
        employee_dept=r.employee.department if r.employee else "General"
    )

@router.get("/my-balance")
async def my_leave_balance(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's leave balance for the current calendar year."""
    current_year = date.today().year

    stmt = select(Leave).where(
        and_(
            Leave.employee_id == current_user.employee_id,
            Leave.approval_status == LeaveStatus.APPROVED,
            extract("year", Leave.start_date) == current_year
        )
    )
    res = await db.execute(stmt)
    leaves = res.scalars().all()

    used_casual = 0
    used_sick = 0
    used_paid = 0
    used_unpaid = 0

    # Fetch company holidays for current year to avoid penalizing employees on holidays
    from server.models.holiday import Holiday
    from datetime import timedelta
    hol_stmt = select(Holiday.date).where(extract("year", Holiday.date) == current_year)
    hol_res = await db.execute(hol_stmt)
    holiday_dates = set(r[0] for r in hol_res.all())

    for l in leaves:
        duration = 0
        curr = l.start_date
        while curr <= l.end_date:
            if curr.weekday() != 6 and curr not in holiday_dates:
                duration += 1
            curr += timedelta(days=1)

        if l.leave_type == LeaveType.CASUAL:
            used_casual += duration
        elif l.leave_type == LeaveType.SICK:
            used_sick += duration
        elif l.leave_type == LeaveType.PAID:
            used_paid += duration
        elif l.leave_type == LeaveType.UNPAID:
            used_unpaid += duration

    balance_casual = max(CASUAL_LEAVE_QUOTA - used_casual, 0)
    balance_sick = max(SICK_LEAVE_QUOTA - used_sick, 0)
    balance_paid = max(PAID_LEAVE_QUOTA - used_paid, 0)
    total_remaining = balance_casual + balance_sick + balance_paid

    return {
        "casual": balance_casual,
        "sick": balance_sick,
        "paid": balance_paid,
        "unpaid": used_unpaid,
        "total_remaining": total_remaining
    }

@router.get("/{leave_id}", response_model=LeaveOut)
async def get_leave_request(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Retrieves a single leave request by ID."""
    stmt = select(Leave).options(
        joinedload(Leave.employee),
        joinedload(Leave.approver)
    ).where(Leave.leave_id == leave_id)
    
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    
    if not r:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    if current_user.role != "admin" and r.employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    return LeaveOut(
        leave_id=r.leave_id,
        employee_id=r.employee_id,
        leave_type=r.leave_type,
        start_date=r.start_date,
        end_date=r.end_date,
        reason=r.reason,
        approval_status=r.approval_status,
        approved_by=r.approved_by,
        created_at=r.created_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        approver_name=r.approver.name if r.approver else None
    )

@router.put("/{leave_id}/approve", response_model=LeaveOut)
async def approve_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Approves a pending leave request (Admin only)."""
    stmt = select(Leave).options(joinedload(Leave.employee)).where(Leave.leave_id == leave_id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    
    if not r:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    if r.approval_status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail="Leave request is already processed")
        
    r.approval_status = LeaveStatus.APPROVED
    r.approved_by = admin.employee_id
    
    # Wait, if approved, we should automatically update/create attendance records for the dates of leave!
    # Let's create 'leave' status attendance records for the leave date range so payroll service picks them up.
    # Exclude Sundays and Company Holidays: they are already non-working off-days and must not become LEAVE records.
    from datetime import timedelta
    from server.models.holiday import Holiday

    hol_stmt = select(Holiday.date).where(
        and_(
            Holiday.date >= r.start_date,
            Holiday.date <= r.end_date
        )
    )
    hol_res = await db.execute(hol_stmt)
    holiday_dates = set(res[0] for res in hol_res.all())

    current_date = r.start_date
    while current_date <= r.end_date:
        # Skip Sundays and Company Holidays
        if current_date.weekday() == 6 or current_date in holiday_dates:
            current_date += timedelta(days=1)
            continue

        # Check if attendance record exists for this employee/date
        att_stmt = select(Attendance).where(
            and_(
                Attendance.employee_id == r.employee_id,
                Attendance.date == current_date
            )
        )
        att_res = await db.execute(att_stmt)
        attendance = att_res.scalar_one_or_none()
        
        if attendance:
            # Override existing attendance status with LEAVE
            attendance.status = AttendanceStatus.LEAVE
            attendance.source = "manual"
        else:
            # Create new leave attendance
            attendance = Attendance(
                employee_id=r.employee_id,
                date=current_date,
                status=AttendanceStatus.LEAVE,
                source="manual",
                created_at=datetime.utcnow()
            )
            db.add(attendance)
            
        current_date += timedelta(days=1)
        
    await db.commit()
    await db.refresh(r)
    
    # Fetch approver name
    app_stmt = select(Employee.name).where(Employee.employee_id == admin.employee_id)
    app_res = await db.execute(app_stmt)
    approver_name = app_res.scalar()

    log_info(
        "LEAVE",
        "LEAVE_APPROVED",
        f"Leave request #{r.leave_id} approved by administrator {approver_name or admin.name} for employee {r.employee.name if r.employee else r.employee_id}.\nPeriod: {r.start_date} to {r.end_date} ({r.leave_type}). Attendance records synchronized.",
        leave_id=r.leave_id,
        employee_id=r.employee.employee_code if (r.employee and r.employee.employee_code) else str(r.employee_id),
        employee_name=r.employee.name if r.employee else "Unknown",
        admin_id=admin.employee_code or str(admin.employee_id),
        leave_type=r.leave_type,
        start_date=str(r.start_date),
        end_date=str(r.end_date),
        source="WEB_ADMIN",
        action="Approve Leave",
        result="APPROVED"
    )

    # Broadcast real-time websocket event for instant UI sync
    try:
        await ws_manager.broadcast_to_clients({
            "event": "leave_approved",
            "leave_id": r.leave_id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "approver_name": approver_name,
            "status": "approved",
            "leave_type": r.leave_type,
            "start_date": str(r.start_date),
            "end_date": str(r.end_date)
        })
    except Exception:
        pass
    
    return LeaveOut(
        leave_id=r.leave_id,
        employee_id=r.employee_id,
        leave_type=r.leave_type,
        start_date=r.start_date,
        end_date=r.end_date,
        reason=r.reason,
        approval_status=r.approval_status,
        approved_by=r.approved_by,
        rejection_reason=r.rejection_reason,
        user_notified=bool(r.user_notified),
        created_at=r.created_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        approver_name=approver_name,
        employee_dept=r.employee.department if r.employee else "General"
    )

@router.put("/{leave_id}/reject", response_model=LeaveOut)
async def reject_leave(
    leave_id: int,
    rejection_data: Optional[LeaveRejection] = None,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Rejects a pending leave request with optional reason (Admin only)."""
    stmt = select(Leave).options(joinedload(Leave.employee)).where(Leave.leave_id == leave_id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    
    if not r:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    if r.approval_status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail="Leave request is already processed")
        
    r.approval_status = LeaveStatus.REJECTED
    r.approved_by = admin.employee_id
    if rejection_data and rejection_data.rejection_reason:
        r.rejection_reason = rejection_data.rejection_reason.strip()
    
    await db.commit()
    await db.refresh(r)
    
    app_stmt = select(Employee.name).where(Employee.employee_id == admin.employee_id)
    app_res = await db.execute(app_stmt)
    approver_name = app_res.scalar()

    log_info(
        "LEAVE",
        "LEAVE_REJECTED",
        f"Leave request #{r.leave_id} rejected by administrator {approver_name or admin.name} for employee {r.employee.name if r.employee else r.employee_id}.\nReason: {r.rejection_reason or 'No reason specified'}.",
        leave_id=r.leave_id,
        employee_id=r.employee.employee_code if (r.employee and r.employee.employee_code) else str(r.employee_id),
        employee_name=r.employee.name if r.employee else "Unknown",
        admin_id=admin.employee_code or str(admin.employee_id),
        rejection_reason=r.rejection_reason or "None",
        source="WEB_ADMIN",
        action="Reject Leave",
        result="REJECTED"
    )

    # Broadcast real-time websocket event for instant UI sync
    try:
        await ws_manager.broadcast_to_clients({
            "event": "leave_rejected",
            "leave_id": r.leave_id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "approver_name": approver_name,
            "status": "rejected",
            "rejection_reason": r.rejection_reason,
            "leave_type": r.leave_type,
            "start_date": str(r.start_date),
            "end_date": str(r.end_date)
        })
    except Exception:
        pass
    
    return LeaveOut(
        leave_id=r.leave_id,
        employee_id=r.employee_id,
        leave_type=r.leave_type,
        start_date=r.start_date,
        end_date=r.end_date,
        reason=r.reason,
        approval_status=r.approval_status,
        approved_by=r.approved_by,
        rejection_reason=r.rejection_reason,
        user_notified=bool(r.user_notified),
        created_at=r.created_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        approver_name=approver_name,
        employee_dept=r.employee.department if r.employee else "General"
    )

@router.put("/{leave_id}/acknowledge-alert")
async def acknowledge_leave_alert(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Marks a leave approval alert as acknowledged by the employee.
    Ensures the notification dialog/alert only shows once for this specific approval.
    """
    stmt = select(Leave).where(Leave.leave_id == leave_id)
    res = await db.execute(stmt)
    leave_obj = res.scalar_one_or_none()

    if not leave_obj:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if current_user.role != "admin" and leave_obj.employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail="Access denied")

    leave_obj.user_notified = True
    await db.commit()
    return {"message": "Leave approval acknowledged successfully", "leave_id": leave_id}

@router.get("/balance/{employee_id}", response_model=LeaveBalance)
async def get_leave_balance(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Calculates remaining leave quotas for the employee in the current calendar year."""
    if current_user.role != "admin" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    current_year = date.today().year
    
    # Query approved leaves for current year
    stmt = select(Leave).where(
        and_(
            Leave.employee_id == employee_id,
            Leave.approval_status == LeaveStatus.APPROVED,
            extract("year", Leave.start_date) == current_year
        )
    )
    res = await db.execute(stmt)
    leaves = res.scalars().all()
    
    # Count days consumed by type
    used_casual = 0
    used_sick = 0
    used_paid = 0
    used_unpaid = 0
    
    # Fetch company holidays for current year to avoid penalizing employees on holidays
    from server.models.holiday import Holiday
    from datetime import timedelta
    hol_stmt = select(Holiday.date).where(extract("year", Holiday.date) == current_year)
    hol_res = await db.execute(hol_stmt)
    holiday_dates = set(r[0] for r in hol_res.all())

    for l in leaves:
        duration = 0
        curr = l.start_date
        while curr <= l.end_date:
            if curr.weekday() != 6 and curr not in holiday_dates:
                duration += 1
            curr += timedelta(days=1)

        if l.leave_type == LeaveType.CASUAL:
            used_casual += duration
        elif l.leave_type == LeaveType.SICK:
            used_sick += duration
        elif l.leave_type == LeaveType.PAID:
            used_paid += duration
        elif l.leave_type == LeaveType.UNPAID:
            used_unpaid += duration
            
    # Calculate balances (quota - used)
    balance_casual = max(CASUAL_LEAVE_QUOTA - used_casual, 0)
    balance_sick = max(SICK_LEAVE_QUOTA - used_sick, 0)
    balance_paid = max(PAID_LEAVE_QUOTA - used_paid, 0)
    
    return {
        "employee_id": employee_id,
        "casual": balance_casual,
        "sick": balance_sick,
        "paid": balance_paid,
        "unpaid": used_unpaid  # Unpaid displays days consumed since there is no quota limit
    }

@router.delete("/{leave_id}")
async def cancel_or_delete_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Cancels or deletes a leave request.
    - Employees can withdraw their own leave request if it is still PENDING.
    - Admins can delete any leave request; if approved, the generated attendance records are cleaned up.
    """
    stmt = select(Leave).where(Leave.leave_id == leave_id)
    res = await db.execute(stmt)
    leave_obj = res.scalar_one_or_none()

    if not leave_obj:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if current_user.role != "admin":
        if leave_obj.employee_id != current_user.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if leave_obj.approval_status != LeaveStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail="Only pending leave requests can be withdrawn. Please contact your manager or HR to cancel an approved leave."
            )

    # If it was approved and admin is deleting it, remove generated attendance records
    if leave_obj.approval_status == LeaveStatus.APPROVED:
        from server.models import Attendance, AttendanceStatus
        from sqlalchemy import delete
        await db.execute(
            delete(Attendance).where(
                Attendance.employee_id == leave_obj.employee_id,
                Attendance.date >= leave_obj.start_date,
                Attendance.date <= leave_obj.end_date,
                Attendance.status == AttendanceStatus.LEAVE
            )
        )

    await db.delete(leave_obj)
    await db.commit()
    return {"message": "Leave request cancelled successfully", "leave_id": leave_id}

