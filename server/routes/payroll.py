from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Payroll, Employee
from server.schemas.payroll import (
    PayrollOut,
    PayrollUpdate,
    ManualPayrollSaveRequest,
    PayrollCalculatePreviewRequest
)
from server.services.payroll_service import (
    generate_payroll_for_all,
    calculate_employee_payroll,
    preview_individual_payroll,
    save_finalized_payroll,
    compute_authoritative_payroll,
    get_employee_monthly_metrics
)
from server.services.pdf_service import generate_payslip_pdf
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/payroll", tags=["Payroll"])


def to_payroll_out(r: Payroll) -> PayrollOut:
    return PayrollOut(
        payroll_id=r.payroll_id,
        employee_id=r.employee_id,
        month=r.month,
        year=r.year,
        working_days=r.working_days,
        present_days=r.present_days or 0,
        absent_days=r.absent_days or 0,
        late_days=r.late_days or 0,
        leave_days=r.leave_days or 0,
        overtime_hours=r.overtime_hours or Decimal("0.00"),
        payable_ot_hours=getattr(r, "payable_ot_hours", Decimal("0.00")) or Decimal("0.00"),
        basic_salary=r.basic_salary,
        absent_rate=getattr(r, "absent_rate", Decimal("0.00")) or Decimal("0.00"),
        absent_deduction=getattr(r, "absent_deduction", Decimal("0.00")) or Decimal("0.00"),
        late_rate=getattr(r, "late_rate", Decimal("0.00")) or Decimal("0.00"),
        late_deduction=r.late_deduction or Decimal("0.00"),
        ot_rate=getattr(r, "ot_rate", Decimal("0.00")) or Decimal("0.00"),
        overtime_pay=r.overtime_pay or Decimal("0.00"),
        reimbursement_amount=getattr(r, "reimbursement_amount", Decimal("0.00")) or Decimal("0.00"),
        advance_recovered=getattr(r, "advance_recovered", Decimal("0.00")) or Decimal("0.00"),
        advance_balance_remaining=getattr(r, "advance_balance_remaining", Decimal("0.00")) or Decimal("0.00"),
        deductions=r.deductions or Decimal("0.00"),
        bonus=r.bonus or Decimal("0.00"),
        remarks=r.remarks,
        final_salary=r.final_salary,
        is_paid=r.is_paid or False,
        generated_at=r.generated_at,
        approved_at=getattr(r, "approved_at", None),
        employee_name=r.employee.name if r.employee else "Unknown",
        department=r.employee.department if r.employee else "N/A",
        designation=r.employee.designation if r.employee else "N/A",
        calculation_snapshot=getattr(r, "calculation_snapshot", None)
    )


@router.post("/generate/{year}/{month}", response_model=List[PayrollOut])
async def generate_payroll_endpoint(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Triggers payroll calculation and upserting for all active employees 
    for the specified month and year (Admin only).
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month. Must be between 1 and 12.")

    payrolls = await generate_payroll_for_all(year, month, db)

    # Reload with joined employees to match the output schema
    pay_ids = [p.payroll_id for p in payrolls]
    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        Payroll.payroll_id.in_(pay_ids)
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    total_amount = sum(float(r.final_salary or 0) for r in records)
    log_info(
        "PAYROLL",
        "PAYROLL_GENERATED",
        f"Payroll batch generated successfully for {month}/{year} by administrator {admin.name}.\nProcessed {len(records)} active employee records. Total payroll: Rs. {total_amount:,.2f}.",
        month=month,
        year=year,
        admin_id=admin.employee_code or str(admin.employee_id),
        employee_count=len(records),
        total_payout=f"Rs. {total_amount:,.2f}",
        source="WEB_ADMIN",
        action="Batch Payroll Generation",
        result="SUCCESS"
    )

    return [to_payroll_out(r) for r in records]


@router.get("/my", response_model=List[PayrollOut])
async def my_payroll(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's own payroll records, optionally filtered by year."""
    import datetime as _dt
    effective_year = year or _dt.date.today().year

    stmt = (
        select(Payroll)
        .options(joinedload(Payroll.employee))
        .where(
            and_(
                Payroll.employee_id == current_user.employee_id,
                Payroll.year == effective_year
            )
        )
        .order_by(Payroll.year.desc(), Payroll.month.desc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [to_payroll_out(r) for r in records]


@router.get("", response_model=List[PayrollOut])
async def list_payroll(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists payroll records.
    Employees can only view their own records; Admin can view all.
    """
    if current_user.role != "admin":
        employee_id = current_user.employee_id

    stmt = select(Payroll).options(joinedload(Payroll.employee))

    if month:
        stmt = stmt.where(Payroll.month == month)
    if year:
        stmt = stmt.where(Payroll.year == year)
    if employee_id:
        stmt = stmt.where(Payroll.employee_id == employee_id)

    stmt = stmt.order_by(Payroll.year.desc(), Payroll.month.desc())

    res = await db.execute(stmt)
    records = res.scalars().all()

    return [to_payroll_out(r) for r in records]


@router.get("/{employee_id}/{year}/{month}", response_model=PayrollOut)
async def get_single_payroll(
    employee_id: int,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Gets a single employee's payroll details for a specific month and year."""
    if current_user.role != "admin" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Access denied")

    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        and_(
            Payroll.employee_id == employee_id,
            Payroll.year == year,
            Payroll.month == month
        )
    )
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()

    if not r:
        raise HTTPException(status_code=404, detail="Payroll record not found for this period")

    return to_payroll_out(r)


@router.put("/{payroll_id}/mark_paid", response_model=PayrollOut)
async def mark_payroll_paid(
    payroll_id: int,
    updates: PayrollUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Marks a payroll record as Paid/Unpaid (Admin only)."""
    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        Payroll.payroll_id == payroll_id
    )
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()

    if not r:
        raise HTTPException(status_code=404, detail="Payroll record not found")

    r.is_paid = updates.is_paid
    await db.commit()
    await db.refresh(r)

    return to_payroll_out(r)


@router.get("/payslip/{payroll_id}")
async def download_payslip(
    payroll_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Generates and downloads an itemized PDF payslip for the payroll record."""
    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        Payroll.payroll_id == payroll_id
    )
    res = await db.execute(stmt)
    payroll = res.scalar_one_or_none()

    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll record not found")

    # Enforce access control
    if current_user.role != "admin" and current_user.employee_id != payroll.employee_id:
        raise HTTPException(status_code=403, detail="Access denied")

    employee = payroll.employee
    if not employee:
        raise HTTPException(status_code=404, detail="Associated employee details not found")

    pdf_bytes = generate_payslip_pdf(payroll, employee)

    filename = f"Payslip_{employee.name.replace(' ', '_')}_{payroll.year}_{payroll.month}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/preview/{employee_id}")
async def get_individual_payroll_preview(
    employee_id: int,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    absent_rate: Optional[Decimal] = Query(None),
    late_rate: Optional[Decimal] = Query(None),
    ot_rate: Optional[Decimal] = Query(None),
    advance_recovery_choice: str = Query("none"),
    advance_recovery_amount: Optional[Decimal] = Query(None),
    bonus: Optional[Decimal] = Query(None),
    other_deductions: Optional[Decimal] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Returns live calculated payroll preview for an individual employee with custom
    absent deduction, late deduction, overtime rates & advance recovery breakdown (Admin only).
    """
    emp_stmt = select(Employee).where(Employee.employee_id == employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    preview = await preview_individual_payroll(
        employee=employee,
        year=year,
        month=month,
        db=db,
        absent_rate=absent_rate,
        late_rate=late_rate,
        ot_rate=ot_rate,
        advance_recovery_choice=advance_recovery_choice,
        advance_recovery_amount=advance_recovery_amount,
        bonus=bonus,
        other_deductions=other_deductions
    )
    return preview


@router.post("/calculate-preview")
async def calculate_preview_endpoint(
    payload: PayrollCalculatePreviewRequest,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Central Authoritative Preview Endpoint:
    Accepts customized rate inputs from frontend and responds with exact math breakdown
    without mutating database records.
    """
    emp_stmt = select(Employee).where(Employee.employee_id == payload.employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    preview = await preview_individual_payroll(
        employee=employee,
        year=payload.year,
        month=payload.month,
        db=db,
        absent_rate=payload.absent_rate,
        late_rate=payload.late_rate,
        ot_rate=payload.ot_rate,
        advance_recovery_choice=payload.advance_recovery_choice or "none",
        advance_recovery_amount=payload.advance_recovery_amount or Decimal("0.00"),
        bonus=payload.bonus or Decimal("0.00"),
        other_deductions=payload.other_deductions or Decimal("0.00")
    )
    return preview


@router.post("/manual-save")
async def save_manual_payroll(
    payload: ManualPayrollSaveRequest,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Saves and finalizes authoritative manual payroll calculation for an individual employee.
    Preserves complete calculation snapshot and processes advance recovery atomically.
    """
    try:
        payroll = await save_finalized_payroll(
            employee_id=payload.employee_id,
            year=payload.year,
            month=payload.month,
            absent_rate=payload.absent_rate,
            late_rate=payload.late_rate,
            ot_rate=payload.ot_rate,
            advance_recovery_choice=payload.advance_recovery_choice,
            advance_recovery_amount=payload.advance_recovery_amount,
            bonus=payload.bonus,
            other_deductions=payload.other_deductions,
            remarks=payload.remarks,
            is_paid=payload.is_paid,
            admin=admin,
            db=db,
            working_days=payload.working_days,
            present_days=payload.present_days,
            absent_days=payload.absent_days,
            payable_ot_hours=payload.payable_ot_hours,
            salary_per_day=payload.salary_per_day,
            salary_per_hour=payload.salary_per_hour,
            payout_working_days=payload.payout_working_days,
            payout_extra_hours=payload.payout_extra_hours,
            final_salary=payload.final_salary
        )

        log_info(
            "PAYROLL",
            "PAYROLL_MANUAL_UPDATE",
            f"Payroll record #{payroll.payroll_id} finalized and snapshot saved by administrator {admin.name} for employee #{payroll.employee_id}.\nPeriod: {payroll.month}/{payroll.year}, Final Salary: Rs. {float(payroll.final_salary):,.2f}.",
            payroll_id=payroll.payroll_id,
            employee_id=str(payroll.employee_id),
            admin_id=admin.employee_code or str(admin.employee_id),
            period=f"{payroll.month}/{payroll.year}",
            final_salary=str(payroll.final_salary),
            source="WEB_ADMIN",
            action="Manual Payroll Save & Snapshot",
            result="SUCCESS"
        )

        return {
            "success": True,
            "message": "Payroll calculation snapshot saved successfully!",
            "payroll_id": payroll.payroll_id,
            "final_salary": float(payroll.final_salary)
        }
    except Exception as e:
        log_warning("PAYROLL", "PAYROLL_SAVE_FAILED", f"Failed to finalize payroll: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
