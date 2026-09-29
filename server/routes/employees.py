from typing import List, Optional
from decimal import Decimal
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, cast, String, update, delete
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
    # 1. Release conflicting slots, codes, or RFIDs held by soft-deleted/inactive records
    await db.execute(
        update(Employee)
        .where(Employee.is_active == False)
        .where(
            or_(
                Employee.fingerprint_id == emp_data.fingerprint_id if emp_data.fingerprint_id else False,
                Employee.rfid_uid == emp_data.rfid_uid if emp_data.rfid_uid else False,
                Employee.employee_code == emp_data.employee_code if emp_data.employee_code else False
            )
        )
        .values(fingerprint_id=None, rfid_uid=None, employee_code=None)
    )
    # If an inactive employee had this exact email, archive it so Postgres unique constraint doesn't clash
    inactive_email_res = await db.execute(
        select(Employee).where(Employee.email == emp_data.email, Employee.is_active == False)
    )
    for inact in inactive_email_res.scalars().all():
        inact.email = f"archived_{inact.employee_id}_{inact.email}"
    await db.commit()

    # 2. Check for active existing email
    chk_stmt = select(Employee).where(Employee.email == emp_data.email, Employee.is_active == True)
    chk_res = await db.execute(chk_stmt)
    if chk_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee with this email already exists"
        )
        
    if emp_data.fingerprint_id:
        # Check for fingerprint_id uniqueness among ACTIVE employees
        fp_stmt = select(Employee).where(Employee.fingerprint_id == emp_data.fingerprint_id, Employee.is_active == True)
        fp_res = await db.execute(fp_stmt)
        if fp_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee with this Fingerprint ID already exists"
            )
            
    hashed_pwd = get_password_hash(emp_data.password) if emp_data.password else None
    plain_pwd = emp_data.password if emp_data.password else None
    
    db_employee = Employee(
        employee_code=emp_data.employee_code,
        name=emp_data.name,
        email=emp_data.email,
        phone=emp_data.phone,
        department=emp_data.department,
        designation=emp_data.designation,
        salary=emp_data.salary,
        overtime_rate=emp_data.overtime_rate or 0,
        late_deduction_rate=emp_data.late_deduction_rate or 0,
        late_deduction_type=emp_data.late_deduction_type or "per_day",
        fingerprint_id=emp_data.fingerprint_id,
        rfid_uid=emp_data.rfid_uid.strip().upper() if emp_data.rfid_uid else None,
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

from sqlalchemy.exc import IntegrityError

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
        
    # Release conflicting slots, codes, or RFIDs held by soft-deleted/inactive records
    await db.execute(
        update(Employee)
        .where(Employee.is_active == False)
        .where(
            or_(
                Employee.fingerprint_id == emp_data.fingerprint_id if emp_data.fingerprint_id else False,
                Employee.rfid_uid == emp_data.rfid_uid if emp_data.rfid_uid else False,
                Employee.employee_code == emp_data.employee_code if emp_data.employee_code else False
            )
        )
        .values(fingerprint_id=None, rfid_uid=None, employee_code=None)
    )

    # If an inactive employee has this new email, archive it
    if emp_data.email and emp_data.email != employee.email:
        inactive_email_res = await db.execute(
            select(Employee).where(Employee.email == emp_data.email, Employee.is_active == False)
        )
        for inact in inactive_email_res.scalars().all():
            inact.email = f"archived_{inact.employee_id}_{inact.email}"
        await db.commit()

        # Check for active employee with same email
        email_stmt = select(Employee).where(
            Employee.email == emp_data.email,
            Employee.employee_id != employee_id,
            Employee.is_active == True
        )
        email_res = await db.execute(email_stmt)
        if email_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is already registered to another employee"
            )

    # Verify fingerprint unique constraint if changing among active employees
    if emp_data.fingerprint_id is not None and emp_data.fingerprint_id != employee.fingerprint_id:
        fp_stmt = select(Employee).where(
            Employee.fingerprint_id == emp_data.fingerprint_id,
            Employee.employee_id != employee_id,
            Employee.is_active == True
        )
        fp_res = await db.execute(fp_stmt)
        if fp_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Fingerprint ID {emp_data.fingerprint_id} already assigned to another employee"
            )

    # Verify RFID unique constraint if changing among active employees
    if emp_data.rfid_uid is not None and emp_data.rfid_uid != employee.rfid_uid:
        rfid_stmt = select(Employee).where(
            Employee.rfid_uid == emp_data.rfid_uid,
            Employee.employee_id != employee_id,
            Employee.is_active == True
        )
        rfid_res = await db.execute(rfid_stmt)
        if rfid_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="RFID UID already assigned to another employee"
            )
            
    # Apply updates
    for field, value in emp_data.model_dump(exclude_unset=True).items():
        if field == "password":
            if value:
                employee.hashed_password = get_password_hash(value)
                employee.plain_password = value
        elif field == "rfid_uid" and value:
            employee.rfid_uid = value.strip().upper()
        else:
            setattr(employee, field, value)
            
    try:
        await db.commit()
        await db.refresh(employee)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Database constraint conflict while updating employee"
        )
    return employee

@router.delete("/all/clear")
async def delete_all_employees(
    db: AsyncSession = Depends(get_db)
):
    """Soft deletes all non-admin employees and broadcasts clear command to hardware."""
    stmt = select(Employee).where(Employee.role != "admin", Employee.is_active == True)
    res = await db.execute(stmt)
    employees = res.scalars().all()
    count = len(employees)
    emp_ids = [emp.employee_id for emp in employees]
    for emp in employees:
        emp.is_active = False
        emp.fingerprint_id = None
        emp.rfid_uid = None
    # Release fingerprint_id across all inactive records to make all 127 slots available
    await db.execute(update(Employee).where(Employee.is_active == False).values(fingerprint_id=None, rfid_uid=None))

    # Delete today's attendance for all deleted employees so re-registration starts fresh
    if emp_ids:
        from server.utils.time_utils import get_current_local_date
        today = get_current_local_date()
        await db.execute(
            delete(Attendance).where(
                Attendance.employee_id.in_(emp_ids),
                Attendance.date == today
            )
        )

    await db.commit()

    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_devices({
            "command": "clear_all_employees"
        })
        await ws_manager.broadcast_to_clients({
            "event": "all_employees_cleared"
        })
    except Exception:
        pass

    return {"message": f"Successfully deleted {count} employees and wiped sensor roster", "count": count}

@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Soft deletes an employee by setting is_active to False and removes from hardware."""
    stmt = select(Employee).where(Employee.employee_id == employee_id).where(Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    old_fid = employee.fingerprint_id
    old_rfid = employee.rfid_uid

    employee.is_active = False
    employee.fingerprint_id = None
    employee.rfid_uid = None

    # Delete today's attendance for this employee so re-registration starts fresh
    from server.utils.time_utils import get_current_local_date
    today = get_current_local_date()
    await db.execute(
        delete(Attendance).where(
            Attendance.employee_id == employee_id,
            Attendance.date == today
        )
    )

    await db.commit()

    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_devices({
            "command": "delete_employee",
            "fingerprint_id": old_fid,
            "rfid_uid": old_rfid
        })
        await ws_manager.broadcast_to_clients({
            "event": "employee_deleted",
            "employee_id": employee_id
        })
    except Exception:
        pass

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
