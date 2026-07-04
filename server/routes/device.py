from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import verify_device_key
from server.models import Employee, Attendance, AttendanceStatus
from server.services.attendance_service import determine_status, calculate_hours

router = APIRouter(prefix="/device", tags=["Device (ESP32)"], dependencies=[Depends(verify_device_key)])

class DeviceCheckinRequest(BaseModel):
    fingerprint_id: int
    device_id: str
    timestamp: Optional[str] = None  # Optional string representation of device time

class DeviceRegisterRequest(BaseModel):
    employee_id: int
    fingerprint_id: int
    device_id: str

class DeviceCheckinResponse(BaseModel):
    employee_name: str
    status: str
    message: str

@router.post("/checkin", response_model=DeviceCheckinResponse)
async def device_checkin(
    payload: DeviceCheckinRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Biometric check-in/check-out endpoint for ESP32 devices.
    Identifies the employee via fingerprint_id, records attendance, 
    and returns a success status with employee name.
    """
    # 1. Lookup employee by fingerprint_id
    emp_stmt = select(Employee).where(
        Employee.fingerprint_id == payload.fingerprint_id,
        Employee.is_active == True
    )
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fingerprint ID not registered or employee deactivated"
        )
        
    today = date.today()
    now = datetime.utcnow()
    
    # 2. Check if attendance record exists for today
    att_stmt = select(Attendance).where(
        and_(
            Attendance.employee_id == employee.employee_id,
            Attendance.date == today
        )
    )
    att_res = await db.execute(att_stmt)
    attendance = att_res.scalar_one_or_none()
    
    # 3. Create or update attendance
    if not attendance:
        # Check-in logic: create new record
        check_in_time = now.time()
        attendance_status = determine_status(check_in_time)
        
        attendance = Attendance(
            employee_id=employee.employee_id,
            date=today,
            check_in=now,
            check_out=None,
            status=attendance_status,
            source="biometric",
            created_at=now
        )
        db.add(attendance)
        await db.commit()
        
        status_msg = "check_in"
        msg = f"Check-in successful! Welcome {employee.name}."
    else:
        # Check-out logic
        if attendance.check_out is not None:
            # Already checked out
            return {
                "employee_name": employee.name,
                "status": "already_done",
                "message": f"Already checked out for today, {employee.name}."
            }
            
        # Update check_out and calculate working/overtime hours
        attendance.check_out = now
        working_hours, overtime_hours = calculate_hours(attendance.check_in, now)
        attendance.working_hours = working_hours
        attendance.overtime_hours = overtime_hours
        
        # If checked in was marked "absent" or something else mistakenly, update status on check-out
        if attendance.status == AttendanceStatus.ABSENT:
            # Re-evaluate based on checkout
            attendance.status = AttendanceStatus.PRESENT
            
        await db.commit()
        
        status_msg = "check_out"
        msg = f"Check-out successful! Goodbye {employee.name}. Worked {working_hours:.2f} hrs."
        
    return {
        "employee_name": employee.name,
        "status": status_msg,
        "message": msg
    }

@router.post("/register_fingerprint")
async def register_fingerprint(
    payload: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Registers a fingerprint_id to an employee.
    Initiated by the admin through the hardware configuration menu.
    """
    # Verify employee exists and is active
    emp_stmt = select(Employee).where(
        Employee.employee_id == payload.employee_id,
        Employee.is_active == True
    )
    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    # Check if fingerprint_id is already assigned
    fp_stmt = select(Employee).where(
        Employee.fingerprint_id == payload.fingerprint_id
    )
    fp_res = await db.execute(fp_stmt)
    fp_owner = fp_res.scalar_one_or_none()
    if fp_owner and fp_owner.employee_id != payload.employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fingerprint ID {payload.fingerprint_id} already registered to employee {fp_owner.name}"
        )
        
    # Assign fingerprint
    employee.fingerprint_id = payload.fingerprint_id
    await db.commit()
    
    return {
        "message": f"Successfully mapped Fingerprint ID {payload.fingerprint_id} to employee {employee.name}."
    }
