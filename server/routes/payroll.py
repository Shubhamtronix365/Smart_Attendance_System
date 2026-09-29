from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Payroll, Employee
from server.schemas.payroll import PayrollOut, PayrollUpdate, ManualPayrollSaveRequest
from server.services.payroll_service import (
    generate_payroll_for_all,
    calculate_employee_payroll,
    preview_individual_payroll
)
from server.services.pdf_service import generate_payslip_pdf

router = APIRouter(prefix="/payroll", tags=["Payroll"])

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
    
    return [
        PayrollOut(
            payroll_id=r.payroll_id,
            employee_id=r.employee_id,
            month=r.month,
            year=r.year,
            working_days=r.working_days,
            present_days=r.present_days,
            absent_days=r.absent_days,
            leave_days=r.leave_days,
            overtime_hours=r.overtime_hours,
            basic_salary=r.basic_salary,
            overtime_pay=r.overtime_pay,
            deductions=r.deductions,
            final_salary=r.final_salary,
            is_paid=r.is_paid,
            generated_at=r.generated_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            department=r.employee.department if r.employee else "N/A",
            designation=r.employee.designation if r.employee else "N/A"
        )
        for r in records
    ]

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

    return [
        PayrollOut(
            payroll_id=r.payroll_id,
            employee_id=r.employee_id,
            month=r.month,
            year=r.year,
            working_days=r.working_days,
            present_days=r.present_days,
            absent_days=r.absent_days,
            leave_days=r.leave_days,
            overtime_hours=r.overtime_hours,
            basic_salary=r.basic_salary,
            overtime_pay=r.overtime_pay,
            deductions=r.deductions,
            final_salary=r.final_salary,
            is_paid=r.is_paid,
            generated_at=r.generated_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            department=r.employee.department if r.employee else "N/A",
            designation=r.employee.designation if r.employee else "N/A"
        )
        for r in records
    ]

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
    
    return [
        PayrollOut(
            payroll_id=r.payroll_id,
            employee_id=r.employee_id,
            month=r.month,
            year=r.year,
            working_days=r.working_days,
            present_days=r.present_days,
            absent_days=r.absent_days,
            leave_days=r.leave_days,
            overtime_hours=r.overtime_hours,
            basic_salary=r.basic_salary,
            overtime_pay=r.overtime_pay,
            deductions=r.deductions,
            final_salary=r.final_salary,
            is_paid=r.is_paid,
            generated_at=r.generated_at,
            employee_name=r.employee.name if r.employee else "Unknown",
            department=r.employee.department if r.employee else "N/A",
            designation=r.employee.designation if r.employee else "N/A"
        )
        for r in records
    ]

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
        
    return PayrollOut(
        payroll_id=r.payroll_id,
        employee_id=r.employee_id,
        month=r.month,
        year=r.year,
        working_days=r.working_days,
        present_days=r.present_days,
        absent_days=r.absent_days,
        leave_days=r.leave_days,
        overtime_hours=r.overtime_hours,
        basic_salary=r.basic_salary,
        overtime_pay=r.overtime_pay,
        deductions=r.deductions,
        final_salary=r.final_salary,
        is_paid=r.is_paid,
        generated_at=r.generated_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        department=r.employee.department if r.employee else "N/A",
        designation=r.employee.designation if r.employee else "N/A"
    )

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
    
    return PayrollOut(
        payroll_id=r.payroll_id,
        employee_id=r.employee_id,
        month=r.month,
        year=r.year,
        working_days=r.working_days,
        present_days=r.present_days,
        absent_days=r.absent_days,
        leave_days=r.leave_days,
        overtime_hours=r.overtime_hours,
        basic_salary=r.basic_salary,
        overtime_pay=r.overtime_pay,
        deductions=r.deductions,
        final_salary=r.final_salary,
        is_paid=r.is_paid,
        generated_at=r.generated_at,
        employee_name=r.employee.name if r.employee else "Unknown",
        department=r.employee.department if r.employee else "N/A",
        designation=r.employee.designation if r.employee else "N/A"
    )

@router.get("/payslip/{payroll_id}")
async def download_payslip(
    payroll_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Generates and downloads a binary PDF payslip for the payroll record."""
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
    
    # Format headers for direct PDF download
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
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Returns live calculated payroll preview for an individual employee with custom
    overtime rate and late deduction breakdown (Admin only).
    """
    emp_stmt = select(Employee).where(Employee.employee_id == employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    preview = await preview_individual_payroll(employee, year, month, db)
    return preview

@router.post("/manual-save")
async def save_manual_payroll(
    payload: ManualPayrollSaveRequest,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Saves or overrides manual payroll calculation for an individual employee.
    Admin can customize late deductions, overtime pay, bonus, and final salary.
    """
    from datetime import datetime as _dt
    emp_stmt = select(Employee).where(Employee.employee_id == payload.employee_id)
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    pay_stmt = select(Payroll).where(
        and_(
            Payroll.employee_id == payload.employee_id,
            Payroll.month == payload.month,
            Payroll.year == payload.year
        )
    )
    pay_res = await db.execute(pay_stmt)
    payroll = pay_res.scalar_one_or_none()

    now = _dt.utcnow()
    if payroll:
        payroll.working_days = payload.working_days
        payroll.present_days = payload.present_days
        payroll.absent_days = payload.absent_days
        payroll.late_days = payload.late_days or 0
        payroll.leave_days = payload.leave_days
        payroll.overtime_hours = payload.overtime_hours
        payroll.basic_salary = payload.basic_salary
        payroll.overtime_pay = payload.overtime_pay
        payroll.late_deduction = payload.late_deduction
        payroll.deductions = payload.deductions
        payroll.bonus = payload.bonus or 0
        payroll.remarks = payload.remarks
        payroll.final_salary = payload.final_salary
        if payload.is_paid is not None:
            payroll.is_paid = payload.is_paid
        payroll.generated_at = now
    else:
        payroll = Payroll(
            employee_id=payload.employee_id,
            month=payload.month,
            year=payload.year,
            working_days=payload.working_days,
            present_days=payload.present_days,
            absent_days=payload.absent_days,
            late_days=payload.late_days or 0,
            leave_days=payload.leave_days,
            overtime_hours=payload.overtime_hours,
            basic_salary=payload.basic_salary,
            overtime_pay=payload.overtime_pay,
            late_deduction=payload.late_deduction,
            deductions=payload.deductions,
            bonus=payload.bonus or 0,
            remarks=payload.remarks,
            final_salary=payload.final_salary,
            is_paid=payload.is_paid or False,
            generated_at=now
        )
        db.add(payroll)

    await db.commit()
    await db.refresh(payroll)
    return {
        "success": True,
        "message": f"Manual payroll successfully saved for {employee.name}",
        "payroll_id": payroll.payroll_id,
        "final_salary": float(payroll.final_salary)
    }

