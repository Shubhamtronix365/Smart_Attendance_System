from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Payroll, Employee
from server.schemas.payroll import PayrollOut, PayrollUpdate
from server.services.payroll_service import generate_payroll_for_all, calculate_employee_payroll
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
