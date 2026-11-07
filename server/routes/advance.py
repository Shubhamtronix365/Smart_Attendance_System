from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import SalaryAdvance, AdvanceRecovery, AdvanceStatus, Employee
from server.schemas.advance import AdvanceCreate, AdvanceOut, AdvanceSummary, AdvanceRecoveryOut
from server.services.payroll_service import get_employee_advance_balance
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/advances", tags=["Salary Advances"])


@router.post("", response_model=AdvanceOut, status_code=status.HTTP_201_CREATED)
async def create_advance(
    payload: AdvanceCreate,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Records a salary advance disbursement for an employee (Admin only).
    """
    if payload.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Advance amount must be greater than zero.")

    # Check that employee exists
    emp_stmt = select(Employee).where(Employee.employee_id == payload.employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    advance = SalaryAdvance(
        employee_id=payload.employee_id,
        amount=payload.amount,
        advance_date=payload.advance_date,
        payment_method=payload.payment_method,
        reference_no=payload.reference_no,
        description=payload.description,
        status=AdvanceStatus.OPEN
    )
    db.add(advance)
    await db.commit()
    await db.refresh(advance)

    log_info(
        "ADVANCE",
        "ADVANCE_DISBURSED",
        f"Salary advance of Rs. {float(payload.amount):,.2f} recorded for {employee.name} by {admin.name}.\nMethod: {payload.payment_method}, Ref: {payload.reference_no or 'N/A'}.",
        advance_id=advance.advance_id,
        employee_id=employee.employee_code or str(employee.employee_id),
        amount=str(payload.amount),
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return AdvanceOut(
        advance_id=advance.advance_id,
        employee_id=advance.employee_id,
        employee_name=employee.name,
        employee_code=employee.employee_code,
        amount=advance.amount,
        advance_date=advance.advance_date,
        disbursement_date=advance.advance_date,
        payment_method=advance.payment_method,
        reference_no=advance.reference_no,
        description=advance.description,
        reason=advance.description,
        status=advance.status,
        created_at=advance.created_at,
        recovered_amount=Decimal("0.00"),
        remaining_balance=advance.amount,
        recoveries=[]
    )


@router.get("", response_model=List[AdvanceOut])
async def list_advances(
    employee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists salary advances.
    Admin can view all or filter by employee/status; employees can only view their own.
    """
    stmt = (
        select(SalaryAdvance)
        .options(
            joinedload(SalaryAdvance.employee),
            joinedload(SalaryAdvance.recoveries)
        )
        .order_by(SalaryAdvance.advance_date.desc(), SalaryAdvance.created_at.desc())
    )

    if current_user.role != "admin":
        stmt = stmt.where(SalaryAdvance.employee_id == current_user.employee_id)
    elif employee_id:
        stmt = stmt.where(SalaryAdvance.employee_id == employee_id)

    if status:
        stmt = stmt.where(SalaryAdvance.status == status)

    res = await db.execute(stmt)
    advances = res.unique().scalars().all()

    result = []
    for a in advances:
        recovered = sum((r.amount_recovered or Decimal("0.00")) for r in a.recoveries)
        remaining = max(Decimal("0.00"), a.amount - recovered)
        result.append(
            AdvanceOut(
                advance_id=a.advance_id,
                employee_id=a.employee_id,
                employee_name=a.employee.name if a.employee else "Unknown",
                employee_code=a.employee.employee_code if a.employee else f"EMP{a.employee_id:03d}",
                amount=a.amount,
                advance_date=a.advance_date,
                disbursement_date=a.advance_date,
                payment_method=a.payment_method,
                reference_no=a.reference_no,
                description=a.description,
                reason=a.description,
                status=a.status,
                created_at=a.created_at,
                recovered_amount=recovered,
                remaining_balance=remaining,
                recoveries=[
                    AdvanceRecoveryOut(
                        recovery_id=r.recovery_id,
                        payroll_id=r.payroll_id,
                        amount_recovered=r.amount_recovered,
                        recovery_date=r.recovery_date,
                        created_at=r.created_at
                    )
                    for r in a.recoveries
                ]
            )
        )
    return result


@router.get("/employee/{employee_id}", response_model=AdvanceSummary)
@router.get("/employee/{employee_id}/balance", response_model=AdvanceSummary)
async def get_employee_advance_summary(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Returns complete advance history, recoveries, and outstanding balance for an employee.
    Admin can view any employee; employee can only view their own.
    """
    if current_user.role != "admin" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Access denied")

    emp_stmt = select(Employee).where(Employee.employee_id == employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Fetch advances
    adv_stmt = (
        select(SalaryAdvance)
        .options(joinedload(SalaryAdvance.recoveries))
        .where(SalaryAdvance.employee_id == employee_id)
        .order_by(SalaryAdvance.advance_date.desc(), SalaryAdvance.created_at.desc())
    )
    adv_res = await db.execute(adv_stmt)
    advances = adv_res.unique().scalars().all()

    # Fetch all recoveries
    rec_stmt = (
        select(AdvanceRecovery)
        .where(AdvanceRecovery.employee_id == employee_id)
        .order_by(AdvanceRecovery.recovery_date.desc(), AdvanceRecovery.created_at.desc())
    )
    rec_res = await db.execute(rec_stmt)
    recoveries = rec_res.scalars().all()

    total_advances = sum((a.amount or Decimal("0.00")) for a in advances) if advances else Decimal("0.00")
    total_recovered = sum((r.amount_recovered or Decimal("0.00")) for r in recoveries) if recoveries else Decimal("0.00")
    outstanding = max(Decimal("0.00"), total_advances - total_recovered)

    mapped_advances = [
        AdvanceOut(
            advance_id=a.advance_id,
            employee_id=a.employee_id,
            employee_name=employee.name,
            amount=a.amount,
            advance_date=a.advance_date,
            payment_method=a.payment_method,
            reference_no=a.reference_no,
            description=a.description,
            status=a.status,
            created_at=a.created_at,
            recoveries=[
                AdvanceRecoveryOut(
                    recovery_id=r.recovery_id,
                    payroll_id=r.payroll_id,
                    amount_recovered=r.amount_recovered,
                    recovery_date=r.recovery_date,
                    created_at=r.created_at
                )
                for r in a.recoveries
            ]
        )
        for a in advances
    ]

    mapped_recoveries = [
        AdvanceRecoveryOut(
            recovery_id=r.recovery_id,
            payroll_id=r.payroll_id,
            amount_recovered=r.amount_recovered,
            recovery_date=r.recovery_date,
            created_at=r.created_at
        )
        for r in recoveries
    ]

    return AdvanceSummary(
        employee_id=employee_id,
        employee_name=employee.name,
        total_advances=total_advances,
        total_recovered=total_recovered,
        outstanding_balance=outstanding,
        advances=mapped_advances,
        recoveries=mapped_recoveries
    )


@router.get("/my", response_model=AdvanceSummary)
@router.get("/my/balance", response_model=AdvanceSummary)
async def my_advance_summary(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's advance summary and outstanding balance."""
    return await get_employee_advance_summary(current_user.employee_id, db, current_user)
