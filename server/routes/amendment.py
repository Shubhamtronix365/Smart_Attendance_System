from datetime import datetime
import json
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import LateAmendment, LeaveAmendment, AmendmentStatus, Attendance, Leave, Employee, AttendanceStatus, Payroll
from server.services.payroll_service import get_employee_monthly_metrics, compute_authoritative_payroll
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

    target_emp_id = attendance.employee_id
    is_admin = str(getattr(current_user, "role", "") or "").strip().lower() == "admin"

    amendment = LateAmendment(
        employee_id=target_emp_id,
        attendance_id=payload.attendance_id,
        original_late_minutes=attendance.late_minutes or 0,
        reason=payload.reason,
        status=AmendmentStatus.APPROVED if (is_admin and payload.auto_approve) else AmendmentStatus.PENDING,
        created_at=datetime.utcnow()
    )

    if is_admin and payload.auto_approve:
        amendment.reviewed_by = current_user.employee_id
        amendment.reviewed_at = datetime.utcnow()
        amendment.reviewer_comments = payload.reviewer_comments or "Created and approved by Administrator"
        
        # Waive attendance record immediately
        if attendance.status == AttendanceStatus.LATE:
            attendance.status = AttendanceStatus.PRESENT
        attendance.late_minutes = 0

        # Adjust payroll if unpaid payroll exists
        if attendance.date:
            p_year = attendance.date.year
            p_month = attendance.date.month
            pay_stmt = select(Payroll).where(
                and_(
                    Payroll.employee_id == target_emp_id,
                    Payroll.year == p_year,
                    Payroll.month == p_month
                )
            )
            pay_res = await db.execute(pay_stmt)
            existing_payroll = pay_res.scalar_one_or_none()
            if existing_payroll and not existing_payroll.is_paid:
                emp_obj = await db.get(Employee, target_emp_id)
                if emp_obj:
                    try:
                        metrics = await get_employee_monthly_metrics(
                            emp_obj, p_year, p_month, db, existing_payroll_id=existing_payroll.payroll_id
                        )
                        calc = compute_authoritative_payroll(
                            base_salary=metrics["base_salary"],
                            absent_days=metrics["absent_days"],
                            absent_rate=existing_payroll.absent_rate or Decimal("0.00"),
                            late_entries=metrics["applicable_late_entries"],
                            late_rate=existing_payroll.late_rate or Decimal("0.00"),
                            payable_ot_hours=metrics["payable_ot_hours"],
                            ot_rate=existing_payroll.ot_rate or Decimal("0.00"),
                            reimbursement_amount=metrics["reimbursement_amount"],
                            outstanding_advance=metrics["outstanding_advance"],
                            advance_recovery_choice="none",
                            advance_recovery_amount=existing_payroll.advance_recovered or Decimal("0.00"),
                            bonus=existing_payroll.bonus or Decimal("0.00"),
                            other_deductions=Decimal("0.00")
                        )
                        existing_payroll.working_days = metrics["working_days"]
                        existing_payroll.present_days = int(round(metrics["present_days"]))
                        existing_payroll.absent_days = metrics["absent_days"]
                        existing_payroll.late_days = metrics["applicable_late_entries"]
                        existing_payroll.late_deduction = Decimal(str(calc["late_deduction"]))
                        existing_payroll.deductions = Decimal(str(calc["total_deductions"]))
                        existing_payroll.final_salary = Decimal(str(calc["final_payable_salary"]))
                        if existing_payroll.calculation_snapshot:
                            try:
                                snap = json.loads(existing_payroll.calculation_snapshot)
                                snap.update(metrics)
                                snap.update(calc)
                                snap["updated_due_to_amendment"] = True
                                existing_payroll.calculation_snapshot = json.dumps(snap, default=str)
                            except Exception:
                                pass
                    except Exception as ex:
                        log_warning("AMENDMENT", f"Failed auto-recalculating payroll: {ex}")

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

    emp_record = await db.get(Employee, target_emp_id)
    return LateAmendmentOut(
        amendment_id=amendment.amendment_id,
        employee_id=amendment.employee_id,
        employee_name=emp_record.name if emp_record else "Unknown",
        attendance_id=amendment.attendance_id,
        attendance_date=str(attendance.date),
        original_late_minutes=amendment.original_late_minutes,
        reason=amendment.reason,
        status=amendment.status,
        reviewer_comments=amendment.reviewer_comments,
        reviewed_by_name=current_user.name if (is_admin and payload.auto_approve) else None,
        created_at=amendment.created_at,
        reviewed_at=amendment.reviewed_at
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


@router.get("/late/my", response_model=List[LateAmendmentOut])
async def my_late_amendments(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Returns only the logged-in employee's late mark amendment history.
    """
    stmt = (
        select(LateAmendment)
        .options(
            joinedload(LateAmendment.employee),
            joinedload(LateAmendment.attendance),
            joinedload(LateAmendment.reviewer)
        )
        .where(LateAmendment.employee_id == current_user.employee_id)
        .order_by(LateAmendment.created_at.desc())
    )
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

    # 1. Synchronize Attendance record directly
    is_approved = str(payload.status).lower() in ("approved", AmendmentStatus.APPROVED.value.lower())
    is_rejected = str(payload.status).lower() in ("rejected", AmendmentStatus.REJECTED.value.lower())

    if is_approved and amendment.attendance:
        # Waive late mark: convert status to PRESENT and zero out late_minutes
        if amendment.attendance.status == AttendanceStatus.LATE:
            amendment.attendance.status = AttendanceStatus.PRESENT
        amendment.attendance.late_minutes = 0
    elif is_rejected and amendment.attendance:
        # Revert back to late if previously modified
        if amendment.original_late_minutes and amendment.original_late_minutes > 0:
            amendment.attendance.status = AttendanceStatus.LATE
            amendment.attendance.late_minutes = amendment.original_late_minutes

    # 2. Recalculate existing unpaid payroll for this employee in that month
    if amendment.attendance and amendment.attendance.date:
        p_year = amendment.attendance.date.year
        p_month = amendment.attendance.date.month
        pay_stmt = select(Payroll).where(
            and_(
                Payroll.employee_id == amendment.employee_id,
                Payroll.year == p_year,
                Payroll.month == p_month
            )
        )
        pay_res = await db.execute(pay_stmt)
        existing_payroll = pay_res.scalar_one_or_none()
        if existing_payroll and not existing_payroll.is_paid:
            emp_obj = amendment.employee or await db.get(Employee, amendment.employee_id)
            if emp_obj:
                try:
                    metrics = await get_employee_monthly_metrics(
                        emp_obj, p_year, p_month, db, existing_payroll_id=existing_payroll.payroll_id
                    )
                    calc = compute_authoritative_payroll(
                        base_salary=metrics["base_salary"],
                        absent_days=metrics["absent_days"],
                        absent_rate=existing_payroll.absent_rate or Decimal("0.00"),
                        late_entries=metrics["applicable_late_entries"],
                        late_rate=existing_payroll.late_rate or Decimal("0.00"),
                        payable_ot_hours=metrics["payable_ot_hours"],
                        ot_rate=existing_payroll.ot_rate or Decimal("0.00"),
                        reimbursement_amount=metrics["reimbursement_amount"],
                        outstanding_advance=metrics["outstanding_advance"],
                        advance_recovery_choice="none",
                        advance_recovery_amount=existing_payroll.advance_recovered or Decimal("0.00"),
                        bonus=existing_payroll.bonus or Decimal("0.00"),
                        other_deductions=Decimal("0.00")
                    )
                    existing_payroll.working_days = metrics["working_days"]
                    existing_payroll.present_days = int(round(metrics["present_days"]))
                    existing_payroll.absent_days = metrics["absent_days"]
                    existing_payroll.late_days = metrics["applicable_late_entries"]
                    existing_payroll.late_deduction = Decimal(str(calc["late_deduction"]))
                    existing_payroll.deductions = Decimal(str(calc["total_deductions"]))
                    existing_payroll.final_salary = Decimal(str(calc["final_payable_salary"]))
                    if existing_payroll.calculation_snapshot:
                        try:
                            snap = json.loads(existing_payroll.calculation_snapshot)
                            snap.update(metrics)
                            snap.update(calc)
                            snap["updated_due_to_amendment_id"] = amendment.amendment_id
                            existing_payroll.calculation_snapshot = json.dumps(snap, default=str)
                        except Exception:
                            pass
                except Exception as ex:
                    log_warning("AMENDMENT", f"Failed auto-recalculating payroll for emp #{amendment.employee_id}: {ex}")

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


@router.get("/leave/my", response_model=List[LeaveAmendmentOut])
async def my_leave_amendments(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Returns only the logged-in employee's leave amendment history.
    """
    stmt = (
        select(LeaveAmendment)
        .options(
            joinedload(LeaveAmendment.employee),
            joinedload(LeaveAmendment.reviewer)
        )
        .where(LeaveAmendment.employee_id == current_user.employee_id)
        .order_by(LeaveAmendment.created_at.desc())
    )
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
