from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import LateAmendment, LeaveAmendment, AmendmentStatus, Attendance, Leave, Employee
from server.schemas.amendment import (
    LateAmendmentCreate,
    LateAmendmentReview,
    LateAmendmentOut,
    LeaveAmendmentCreate,
    LeaveAmendmentReview,
    LeaveAmendmentOut
)
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/amendments", tags=["Amendments"])


# ─── Late Mark Amendments ──────────────────────────────────────────────────────
@router.post("/late", response_model=LateAmendmentOut, status_code=status.HTTP_201_CREATED)
async def submit_late_amendment(
    payload: LateAmendmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Employee submits an explanation/dispute for a late mark.
    """
    att_stmt = select(Attendance).where(Attendance.attendance_id == payload.attendance_id)
    att_res = await db.execute(att_stmt)
    attendance = att_res.scalar_one_or_none()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    if attendance.employee_id != current_user.employee_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot dispute another employee's attendance record")

    # Check for existing pending amendment
    dup_stmt = select(LateAmendment).where(
        and_(
            LateAmendment.attendance_id == payload.attendance_id,
            LateAmendment.status == AmendmentStatus.PENDING
        )
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A pending amendment for this late mark already exists.")

    amendment = LateAmendment(
        employee_id=current_user.employee_id,
        attendance_id=payload.attendance_id,
        original_late_minutes=attendance.late_minutes or 0,
        reason=payload.reason,
        status=AmendmentStatus.PENDING,
        created_at=datetime.utcnow()
    )
    db.add(amendment)
    await db.commit()
    await db.refresh(amendment)

    log_info(
        "AMENDMENT",
        "LATE_AMENDMENT_SUBMITTED",
        f"Late mark amendment submitted by {current_user.name} for attendance #{attendance.attendance_id} ({attendance.date}).\nReason: {payload.reason}.",
        amendment_id=amendment.amendment_id,
        employee_id=current_user.employee_code or str(current_user.employee_id)
    )

    return LateAmendmentOut(
        amendment_id=amendment.amendment_id,
        employee_id=amendment.employee_id,
        employee_name=current_user.name,
        attendance_id=amendment.attendance_id,
        attendance_date=str(attendance.date),
        original_late_minutes=amendment.original_late_minutes,
        reason=amendment.reason,
        status=amendment.status,
        created_at=amendment.created_at
    )


@router.get("/late", response_model=List[LateAmendmentOut])
async def list_late_amendments(
    status_filter: Optional[str] = Query(None, alias="status"),
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists late mark amendment requests. Admin views all; employee views their own.
    """
    stmt = (
        select(LateAmendment)
        .options(
            joinedload(LateAmendment.employee),
            joinedload(LateAmendment.attendance),
            joinedload(LateAmendment.reviewer)
        )
    )
    if current_user.role != "admin":
        stmt = stmt.where(LateAmendment.employee_id == current_user.employee_id)
    elif employee_id:
        stmt = stmt.where(LateAmendment.employee_id == employee_id)

    if status_filter:
        stmt = stmt.where(LateAmendment.status == status_filter)

    stmt = stmt.order_by(LateAmendment.created_at.desc())
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        LateAmendmentOut(
            amendment_id=r.amendment_id,
            employee_id=r.employee_id,
            employee_name=r.employee.name if r.employee else "Unknown",
            attendance_id=r.attendance_id,
            attendance_date=str(r.attendance.date) if r.attendance else None,
            original_late_minutes=r.original_late_minutes,
            reason=r.reason,
            attachment_path=r.attachment_path,
            status=r.status,
            reviewer_comments=r.reviewer_comments,
            reviewed_by_name=r.reviewer.name if r.reviewer else None,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at
        )
        for r in records
    ]


@router.put("/late/{amendment_id}/review", response_model=LateAmendmentOut)
async def review_late_amendment(
    amendment_id: int,
    payload: LateAmendmentReview,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Admin reviews, approves, or rejects a late mark amendment.
    Approving waives the late mark penalty in subsequent payroll calculations.
    """
    stmt = (
        select(LateAmendment)
        .options(joinedload(LateAmendment.employee), joinedload(LateAmendment.attendance))
        .where(LateAmendment.amendment_id == amendment_id)
    )
    res = await db.execute(stmt)
    amendment = res.scalar_one_or_none()
    if not amendment:
        raise HTTPException(status_code=404, detail="Amendment not found")

    amendment.status = payload.status
    amendment.reviewer_comments = payload.reviewer_comments
    amendment.reviewed_by = admin.employee_id
    amendment.reviewed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(amendment)

    log_info(
        "AMENDMENT",
        "LATE_AMENDMENT_REVIEWED",
        f"Late amendment #{amendment.amendment_id} for {amendment.employee.name if amendment.employee else amendment.employee_id} reviewed: {payload.status.upper()} by {admin.name}.",
        amendment_id=amendment.amendment_id,
        status=payload.status,
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return LateAmendmentOut(
        amendment_id=amendment.amendment_id,
        employee_id=amendment.employee_id,
        employee_name=amendment.employee.name if amendment.employee else "Unknown",
        attendance_id=amendment.attendance_id,
        attendance_date=str(amendment.attendance.date) if amendment.attendance else None,
        original_late_minutes=amendment.original_late_minutes,
        reason=amendment.reason,
        status=amendment.status,
        reviewer_comments=amendment.reviewer_comments,
        reviewed_by_name=admin.name,
        created_at=amendment.created_at,
        reviewed_at=amendment.reviewed_at
    )


# ─── Leave Amendments ─────────────────────────────────────────────────────────
@router.post("/leave", response_model=LeaveAmendmentOut, status_code=status.HTTP_201_CREATED)
async def submit_leave_amendment(
    payload: LeaveAmendmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Employee submits an amendment/explanation for a leave request.
    """
    l_stmt = select(Leave).where(Leave.leave_id == payload.leave_id)
    l_res = await db.execute(l_stmt)
    leave = l_res.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave record not found")

    if leave.employee_id != current_user.employee_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot submit amendment for another employee's leave")

    amendment = LeaveAmendment(
        employee_id=current_user.employee_id,
        leave_id=payload.leave_id,
        reason=payload.reason,
        status=AmendmentStatus.PENDING,
        created_at=datetime.utcnow()
    )
    db.add(amendment)
    await db.commit()
    await db.refresh(amendment)

    return LeaveAmendmentOut(
        amendment_id=amendment.amendment_id,
        employee_id=amendment.employee_id,
        employee_name=current_user.name,
        leave_id=amendment.leave_id,
        reason=amendment.reason,
        status=amendment.status,
        created_at=amendment.created_at
    )


@router.get("/leave", response_model=List[LeaveAmendmentOut])
async def list_leave_amendments(
    status_filter: Optional[str] = Query(None, alias="status"),
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Lists leave amendments. Admin views all; employee views their own."""
    stmt = (
        select(LeaveAmendment)
        .options(joinedload(LeaveAmendment.employee), joinedload(LeaveAmendment.reviewer))
    )
    if current_user.role != "admin":
        stmt = stmt.where(LeaveAmendment.employee_id == current_user.employee_id)
    elif employee_id:
        stmt = stmt.where(LeaveAmendment.employee_id == employee_id)

    if status_filter:
        stmt = stmt.where(LeaveAmendment.status == status_filter)

    stmt = stmt.order_by(LeaveAmendment.created_at.desc())
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        LeaveAmendmentOut(
            amendment_id=r.amendment_id,
            employee_id=r.employee_id,
            employee_name=r.employee.name if r.employee else "Unknown",
            leave_id=r.leave_id,
            reason=r.reason,
            status=r.status,
            reviewer_comments=r.reviewer_comments,
            reviewed_by_name=r.reviewer.name if r.reviewer else None,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at
        )
        for r in records
    ]


@router.put("/leave/{amendment_id}/review", response_model=LeaveAmendmentOut)
async def review_leave_amendment(
    amendment_id: int,
    payload: LeaveAmendmentReview,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Admin reviews, approves, or rejects a leave amendment."""
    stmt = select(LeaveAmendment).where(LeaveAmendment.amendment_id == amendment_id)
    res = await db.execute(stmt)
    amendment = res.scalar_one_or_none()
    if not amendment:
        raise HTTPException(status_code=404, detail="Leave amendment not found")

    amendment.status = payload.status
    amendment.reviewer_comments = payload.reviewer_comments
    amendment.reviewed_by = admin.employee_id
    amendment.reviewed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(amendment)

    return LeaveAmendmentOut(
        amendment_id=amendment.amendment_id,
        employee_id=amendment.employee_id,
        leave_id=amendment.leave_id,
        reason=amendment.reason,
        status=amendment.status,
        reviewer_comments=amendment.reviewer_comments,
        reviewed_by_name=admin.name,
        created_at=amendment.created_at,
        reviewed_at=amendment.reviewed_at
    )
