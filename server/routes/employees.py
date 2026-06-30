from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import require_admin, get_password_hash
from server.models import Employee, Attendance, AttendanceStatus, Payroll
from server.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeOut, EmployeeSummary

router = APIRouter(prefix="/employees", tags=["Employees"], dependencies=[Depends(require_admin)])

@router.get("", response_model=List[EmployeeOut])
async def list_employees(
    department: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Lists all employees, with optional department filter, 
    general search (name/email/ID), and pagination.
    """
    stmt = select(Employee).where(Employee.is_active == True)
    
    if department:
        stmt = stmt.where(Employee.department == department)
        
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.where(
            or_(
                Employee.name.ilike(search_filter),
                Employee.email.ilike(search_filter),
                cast(Employee.employee_id, String).like(search_filter)
            )
        )
        
    # Order by ID
    stmt = stmt.order_by(Employee.employee_id)
    
    # Pagination
    offset = (page - 1) * size
    stmt = stmt.offset(offset).limit(size)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(
    emp_data: EmployeeCreate,
    db: AsyncSession = Depends(get_db)
):
    """Creates a new employee record and hashes password if provided."""
    # Check for existing email
    chk_stmt = select(Employee).where(Employee.email == emp_data.email)
    chk_res = await db.execute(chk_stmt)
    if chk_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee with this email already exists"
        )
        
    if emp_data.fingerprint_id:
        # Check for fingerprint_id uniqueness
        fp_stmt = select(Employee).where(Employee.fingerprint_id == emp_data.fingerprint_id)
        fp_res = await db.execute(fp_stmt)
        if fp_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee with this Fingerprint ID already exists"
            )
            
    hashed_pwd = get_password_hash(emp_data.password) if emp_data.password else None
    plain_pwd = emp_data.password if emp_data.password else None
    
    db_employee = Employee(
        name=emp_data.name,
        email=emp_data.email,
        phone=emp_data.phone,
        department=emp_data.department,
        designation=emp_data.designation,
        salary=emp_data.salary,
        fingerprint_id=emp_data.fingerprint_id,
        role=emp_data.role,
        hashed_password=hashed_pwd,
        plain_password=plain_pwd
    )
    
    db.add(db_employee)
    await db.commit()
    await db.refresh(db_employee)
    return db_employee

@router.get("/{employee_id}", response_model=EmployeeOut)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Retrieves detailed profile of a single employee."""
    stmt = select(Employee).where(Employee.employee_id == employee_id).where(Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    return employee

@router.put("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int,
    emp_data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Updates an employee record."""
    stmt = select(Employee).where(Employee.employee_id == employee_id).where(Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    # Verify fingerprint unique constraint if changing
    if emp_data.fingerprint_id is not None and emp_data.fingerprint_id != employee.fingerprint_id:
        fp_stmt = select(Employee).where(Employee.fingerprint_id == emp_data.fingerprint_id)
        fp_res = await db.execute(fp_stmt)
        if fp_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Fingerprint ID already assigned to another employee"
            )
            
    # Apply updates
    for field, value in emp_data.model_dump(exclude_unset=True).items():
        if field == "password":
            if value:
                employee.hashed_password = get_password_hash(value)
                employee.plain_password = value
        else:
            setattr(employee, field, value)
            
    await db.commit()
    await db.refresh(employee)
    return employee

@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Soft deletes an employee by setting is_active to False."""
    stmt = select(Employee).where(Employee.employee_id == employee_id).where(Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    employee.is_active = False
    await db.commit()
    return {"message": "Employee soft deleted successfully"}

@router.get("/{employee_id}/summary", response_model=EmployeeSummary)
async def get_employee_summary(
    employee_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Gets total attendance counts and payroll summaries for an employee."""
    stmt = select(Employee).where(Employee.employee_id == employee_id).where(Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    # Present days count
    p_stmt = select(func.count(Attendance.attendance_id)).where(
        Attendance.employee_id == employee_id,
        Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH])
    )
    p_res = await db.execute(p_stmt)
    present_days = p_res.scalar() or 0
    
    # Absent days count
    a_stmt = select(func.count(Attendance.attendance_id)).where(
        Attendance.employee_id == employee_id,
        Attendance.status == AttendanceStatus.ABSENT
    )
    a_res = await db.execute(a_stmt)
    absent_days = a_res.scalar() or 0
    
    # Leave days count
    l_stmt = select(func.count(Attendance.attendance_id)).where(
        Attendance.employee_id == employee_id,
        Attendance.status == AttendanceStatus.LEAVE
    )
    l_res = await db.execute(l_stmt)
    leave_days = l_res.scalar() or 0
    
    # Payroll summary
    pay_stmt = select(func.sum(Payroll.final_salary)).where(
        Payroll.employee_id == employee_id
    )
    pay_res = await db.execute(pay_stmt)
    total_payroll = pay_res.scalar() or Decimal("0.00")
    
    # Last paid salary
    last_stmt = select(Payroll.final_salary).where(
        Payroll.employee_id == employee_id,
        Payroll.is_paid == True
    ).order_by(Payroll.year.desc(), Payroll.month.desc()).limit(1)
    last_res = await db.execute(last_stmt)
    last_paid = last_res.scalar() or None
    
    return {
        "employee_id": employee.employee_id,
        "name": employee.name,
        "present_days": present_days,
        "absent_days": absent_days,
        "leave_days": leave_days,
        "total_payroll_generated": total_payroll,
        "last_salary_paid": last_paid
    }
