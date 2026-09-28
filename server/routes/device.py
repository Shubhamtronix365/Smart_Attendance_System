from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import get_db
from server.dependencies.auth import get_password_hash
from server.models import Employee, Attendance, AttendanceStatus
from server.services.attendance_service import determine_status, calculate_hours

router = APIRouter(prefix="/device", tags=["Device (ESP32 Tronix)"])

# ─── Auth Helper ─────────────────────────────────────────────────────────────
def verify_device_key(x_device_key: Optional[str] = Header(None)):
    if not x_device_key or x_device_key != settings.DEVICE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Device-Key header"
        )
    return x_device_key

# ─── Schemas ─────────────────────────────────────────────────────────────────
class DeviceCheckinRequest(BaseModel):
    fingerprint_id: Optional[int] = None
    rfid_uid: Optional[str] = None
    device_id: str = "esp32-01"
    timestamp: Optional[str] = None

class DeviceCheckinResponse(BaseModel):
    employee_name: str
    status: str
    message: str
    method: str = "biometric"

class EnrollmentStartRequest(BaseModel):
    employee_code: str
    name: str
    fingerprint_id: Optional[int] = None

class EnrollmentStepRequest(BaseModel):
    step: str
    fingerprint_id: Optional[int] = None
    rfid_uid: Optional[str] = None
    lcd_line1: Optional[str] = ""
    lcd_line2: Optional[str] = ""
    message: Optional[str] = ""
    error: Optional[str] = None

class EnrollmentFinalizeRequest(BaseModel):
    employee_code: Optional[str] = None
    name: str
    email: str
    phone: Optional[str] = None
    department: Optional[str] = "General"
    designation: Optional[str] = "Staff"
    salary: float = 30000.0
    fingerprint_id: Optional[int] = None
    rfid_uid: Optional[str] = None
    role: str = "employee"
    password: Optional[str] = "password123"

# ─── In-Memory Live Enrollment Session ───────────────────────────────────────
class EnrollmentState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.active: bool = False
        self.status: str = "idle"  # idle, initiated, waiting_finger_1, scan_1_ok, remove_finger, waiting_finger_2, finger_enrolled, waiting_rfid, rfid_captured, completed, failed, cancelled
        self.employee_code: Optional[str] = None
        self.name: Optional[str] = None
        self.fingerprint_id: Optional[int] = None
        self.rfid_uid: Optional[str] = None
        self.lcd_line1: str = "Employee System"
        self.lcd_line2: str = "Ready"
        self.message: str = "Hardware ready"
        self.error: Optional[str] = None
        self.updated_at: datetime = datetime.utcnow()

    def to_dict(self):
        return {
            "active": self.active,
            "status": self.status,
            "employee_code": self.employee_code,
            "name": self.name,
            "fingerprint_id": self.fingerprint_id,
            "rfid_uid": self.rfid_uid,
            "lcd_line1": self.lcd_line1,
            "lcd_line2": self.lcd_line2,
            "message": self.message,
            "error": self.error,
            "updated_at": self.updated_at.isoformat(),
        }

enrollment_session = EnrollmentState()

async def get_next_free_fingerprint_id(db: AsyncSession) -> int:
    stmt = select(Employee.fingerprint_id).where(
        Employee.fingerprint_id.isnot(None),
        Employee.is_active == True
    )
    res = await db.execute(stmt)
    used_ids = set(res.scalars().all())
    for fid in range(1, 128):
        if fid not in used_ids:
            return fid
    return 1

# ─── Device Check-in / Out (Fingerprint or RFID) ─────────────────────────────
@router.post("/checkin", response_model=DeviceCheckinResponse)
async def device_checkin(
    payload: DeviceCheckinRequest,
    db: AsyncSession = Depends(get_db),
    _key: str = Depends(verify_device_key)
):
    """
    Biometric and RFID check-in/check-out endpoint for ESP32 Tronix devices.
    Identifies the employee via fingerprint_id OR rfid_uid, records attendance, 
    and returns a success status with employee name.
    """
    if not payload.fingerprint_id and not payload.rfid_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either fingerprint_id or rfid_uid must be provided"
        )

    # 1. Lookup employee by fingerprint_id or rfid_uid
    if payload.fingerprint_id is not None:
        emp_stmt = select(Employee).where(
            Employee.fingerprint_id == payload.fingerprint_id,
            Employee.is_active == True
        )
        scan_source = "biometric"
    else:
        clean_rfid = payload.rfid_uid.strip().upper()
        emp_stmt = select(Employee).where(
            Employee.rfid_uid == clean_rfid,
            Employee.is_active == True
        )
        scan_source = "rfid"

    emp_res = await db.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()

    if not employee:
        identifier = f"Fingerprint #{payload.fingerprint_id}" if payload.fingerprint_id else f"RFID '{payload.rfid_uid}'"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{identifier} not registered or employee deactivated"
        )

    from server.utils.time_utils import get_current_local_time
    now = get_current_local_time()
    today = now.date()

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
        check_in_time = now.time()
        attendance_status = determine_status(check_in_time)

        attendance = Attendance(
            employee_id=employee.employee_id,
            date=today,
            check_in=now,
            check_out=None,
            status=attendance_status,
            source=scan_source,
            created_at=now
        )
        db.add(attendance)
        await db.commit()

        status_msg = "check_in"
        msg = f"Check-in successful! Welcome {employee.name}."
    else:
        if attendance.check_out is not None:
            return {
                "employee_name": employee.name,
                "status": "already_done",
                "message": f"Already checked out today, {employee.name}.",
                "method": scan_source
            }

        attendance.check_out = now
        working_hours, overtime_hours = calculate_hours(attendance.check_in, now)
        attendance.working_hours = working_hours
        attendance.overtime_hours = overtime_hours

        if attendance.status == AttendanceStatus.ABSENT:
            attendance.status = AttendanceStatus.PRESENT

        await db.commit()

        status_msg = "check_out"
        msg = f"Check-out successful! Goodbye {employee.name}. Worked {working_hours:.2f} hrs."

    try:
        from server.routes.websocket import ws_manager
        import asyncio
        asyncio.create_task(ws_manager.broadcast_to_clients({
            "event": "live_attendance",
            "employee_name": employee.name,
            "punch_type": status_msg,
            "method": scan_source,
            "time": now.strftime("%H:%M:%S")
        }))
        asyncio.create_task(ws_manager.broadcast_to_clients({
            "event": "attendance_updated"
        }))
    except Exception:
        pass

    return {
        "employee_name": employee.name,
        "status": status_msg,
        "message": msg,
        "method": scan_source
    }

# ─── Enrollment Handshake Endpoints ──────────────────────────────────────────

@router.post("/enroll/start")
async def start_enrollment(
    payload: EnrollmentStartRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Called by the Web Admin console to trigger a new interactive enrollment.
    Allocates the next available fingerprint slot on the hardware.
    """
    # Release any inactive employee holding this employee code or slot
    await db.execute(
        update(Employee)
        .where(Employee.is_active == False)
        .where(
            or_(
                Employee.employee_code == payload.employee_code,
                Employee.fingerprint_id == payload.fingerprint_id if payload.fingerprint_id else False
            )
        )
        .values(employee_code=None, fingerprint_id=None)
    )
    await db.commit()

    check_stmt = select(Employee).where(
        Employee.employee_code == payload.employee_code,
        Employee.is_active == True
    )
    check_res = await db.execute(check_stmt)
    if check_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Employee ID '{payload.employee_code}' already exists"
        )

    if payload.fingerprint_id and payload.fingerprint_id > 0:
        target_fid = payload.fingerprint_id
    else:
        target_fid = await get_next_free_fingerprint_id(db)

    enrollment_session.reset()
    enrollment_session.active = True
    enrollment_session.status = "initiated"
    enrollment_session.employee_code = payload.employee_code
    enrollment_session.name = payload.name
    enrollment_session.fingerprint_id = target_fid
    enrollment_session.lcd_line1 = "Register Emp"
    enrollment_session.lcd_line2 = payload.name[:16]
    enrollment_session.message = f"Starting enrollment for {payload.name}. Assigned slot #{target_fid}."
    enrollment_session.updated_at = datetime.utcnow()

    # Broadcast command directly to all connected ESP32 devices via WebSocket
    try:
        from server.routes.websocket import ws_manager
        command_payload = {
            "command": "start_enroll",
            "session_id": "ws_session",
            "employee_code": payload.employee_code,
            "name": payload.name,
            "fingerprint_id": target_fid
        }
        await ws_manager.broadcast_to_devices(command_payload)
        await ws_manager.broadcast_to_clients({
            "event": "enrollment_update",
            "data": enrollment_session.to_dict()
        })
    except Exception as e:
        pass

    return enrollment_session.to_dict()

@router.get("/enroll/poll")
async def poll_enrollment(_key: str = Depends(verify_device_key)):
    """
    Called periodically by the ESP32 Tronix device in its main loop.
    Returns whether an enrollment session has been commanded from the web software.
    """
    if enrollment_session.active and enrollment_session.status in [
        "initiated", "waiting_finger_1", "scan_1_ok", "remove_finger", 
        "waiting_finger_2", "finger_enrolled", "waiting_rfid"
    ]:
        return {
            "has_task": True,
            "action": "enroll",
            "employee_code": enrollment_session.employee_code,
            "name": enrollment_session.name,
            "fingerprint_id": enrollment_session.fingerprint_id,
            "status": enrollment_session.status
        }
    return {"has_task": False}

@router.post("/enroll/step")
async def update_enrollment_step(
    payload: EnrollmentStepRequest,
    _key: str = Depends(verify_device_key)
):
    """
    Called by ESP32 Tronix to update the current live progress of the hardware
    """
    if not enrollment_session.active:
        return {"status": "inactive"}

    enrollment_session.status = payload.step
    if payload.fingerprint_id is not None:
        enrollment_session.fingerprint_id = payload.fingerprint_id
    if payload.rfid_uid is not None:
        enrollment_session.rfid_uid = payload.rfid_uid.strip().upper()
    if payload.lcd_line1:
        enrollment_session.lcd_line1 = payload.lcd_line1
    if payload.lcd_line2:
        enrollment_session.lcd_line2 = payload.lcd_line2
    if payload.message:
        enrollment_session.message = payload.message
    if payload.error:
        enrollment_session.error = payload.error

    enrollment_session.updated_at = datetime.utcnow()
    return {"status": "updated", "current": enrollment_session.status}

@router.get("/enroll/status")
async def get_enrollment_status():
    """
    Called periodically by the Web Admin popup to render real-time animations,
    virtual LCD status, and captured hardware fields.
    """
    return enrollment_session.to_dict()

@router.post("/enroll/cancel")
async def cancel_enrollment():
    """
    Cancels any in-progress enrollment session.
    """
    enrollment_session.status = "cancelled"
    enrollment_session.active = False
    enrollment_session.lcd_line1 = "Employee System"
    enrollment_session.lcd_line2 = "Ready"
    enrollment_session.message = "Registration cancelled."

    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_devices({"command": "cancel_enroll"})
        await ws_manager.broadcast_to_clients({
            "event": "enrollment_update",
            "data": enrollment_session.to_dict()
        })
    except Exception:
        pass

    return {"status": "cancelled"}

@router.post("/enroll/finalize")
async def finalize_enrollment(
    payload: EnrollmentFinalizeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Finalizes the registration by creating the new employee profile in the database
    with all 4 hardware fields (code, name, finger_id, rfid_uid) and company details.
    """
    # 1. Release conflicting slots, codes, or RFIDs held by soft-deleted/inactive records
    await db.execute(
        update(Employee)
        .where(Employee.is_active == False)
        .where(
            or_(
                Employee.fingerprint_id == payload.fingerprint_id if payload.fingerprint_id else False,
                Employee.rfid_uid == payload.rfid_uid if payload.rfid_uid else False,
                Employee.employee_code == payload.employee_code if payload.employee_code else False
            )
        )
        .values(fingerprint_id=None, rfid_uid=None, employee_code=None)
    )
    # If an inactive employee had this exact email, archive it so Postgres unique constraint doesn't clash
    inactive_email_res = await db.execute(
        select(Employee).where(Employee.email == payload.email, Employee.is_active == False)
    )
    for inact in inactive_email_res.scalars().all():
        inact.email = f"archived_{inact.employee_id}_{inact.email}"
    await db.commit()

    # 2. Check for collisions among ACTIVE employees only
    email_stmt = select(Employee).where(Employee.email == payload.email, Employee.is_active == True)
    email_res = await db.execute(email_stmt)
    if email_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{payload.email}' is already registered."
        )

    if payload.fingerprint_id:
        fp_stmt = select(Employee).where(Employee.fingerprint_id == payload.fingerprint_id, Employee.is_active == True)
        fp_res = await db.execute(fp_stmt)
        if fp_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Fingerprint ID {payload.fingerprint_id} already registered."
            )

    if payload.rfid_uid:
        rfid_clean = payload.rfid_uid.strip().upper()
        rfid_stmt = select(Employee).where(Employee.rfid_uid == rfid_clean, Employee.is_active == True)
        rfid_res = await db.execute(rfid_stmt)
        if rfid_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"RFID UID '{payload.rfid_uid}' already registered to another employee."
            )
    else:
        rfid_clean = None

    from server.utils.time_utils import get_current_local_date, get_current_local_time
    now_local = get_current_local_time()

    new_emp = Employee(
        employee_code=payload.employee_code or enrollment_session.employee_code,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        department=payload.department or "General",
        designation=payload.designation or "Staff",
        salary=payload.salary,
        fingerprint_id=payload.fingerprint_id or enrollment_session.fingerprint_id,
        rfid_uid=rfid_clean or enrollment_session.rfid_uid,
        role=payload.role,
        is_active=True,
        hashed_password=get_password_hash(payload.password or "password123"),
        plain_password=payload.password or "password123",
        joining_date=get_current_local_date(),
        created_at=now_local
    )

    db.add(new_emp)
    await db.commit()
    await db.refresh(new_emp)

    enrollment_session.reset()

    # Broadcast employee creation so web clients refresh
    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_clients({
            "event": "employee_created",
            "employee": {
                "id": new_emp.employee_id,
                "name": new_emp.name,
                "fingerprint_id": new_emp.fingerprint_id,
                "rfid_uid": new_emp.rfid_uid
            }
        })
    except Exception:
        pass

    return {
        "success": True,
        "message": f"Employee {new_emp.name} registered successfully!",
        "employee_id": new_emp.employee_id,
        "employee_code": new_emp.employee_code,
        "fingerprint_id": new_emp.fingerprint_id,
        "rfid_uid": new_emp.rfid_uid
    }

@router.get("/next-slot")
async def get_next_slot(db: AsyncSession = Depends(get_db)):
    """Returns the next available fingerprint slot on the physical sensor (1-127) and current capacity."""
    stmt = select(Employee.fingerprint_id, Employee.name, Employee.employee_id, Employee.employee_code).where(
        Employee.fingerprint_id.isnot(None),
        Employee.is_active == True
    )
    res = await db.execute(stmt)
    rows = res.all()
    occupied = [
        {"slot": r[0], "name": r[1], "employee_id": r[2], "employee_code": r[3]}
        for r in rows if r[0] is not None
    ]
    occupied.sort(key=lambda x: x["slot"])
    used_slots = set(item["slot"] for item in occupied)
    next_slot = 1
    for s in range(1, 128):
        if s not in used_slots:
            next_slot = s
            break
    return {
        "next_slot": next_slot,
        "total_slots": 127,
        "used_count": len(occupied),
        "free_count": max(127 - len(occupied), 0),
        "occupied": occupied
    }

@router.delete("/sensor/slot/{slot_id}")
async def delete_sensor_slot(slot_id: int, db: AsyncSession = Depends(get_db)):
    """Deletes a specific fingerprint template directly from the physical R307 sensor and ESP32."""
    stmt = select(Employee).where(Employee.fingerprint_id == slot_id, Employee.is_active == True)
    res = await db.execute(stmt)
    employee = res.scalar_one_or_none()
    
    if employee:
        employee.fingerprint_id = None
        await db.commit()
    
    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_devices({
            "command": "delete_employee",
            "fingerprint_id": slot_id,
            "rfid_uid": employee.rfid_uid if employee else ""
        })
        await ws_manager.broadcast_to_clients({
            "event": "sensor_slot_deleted",
            "slot_id": slot_id,
            "employee_id": employee.employee_id if employee else None
        })
    except Exception:
        pass
        
    return {"message": f"Slot #{slot_id} erased from sensor and ESP32 flash", "slot_id": slot_id}

@router.post("/sensor/clear-all")
async def clear_all_sensor_slots(db: AsyncSession = Depends(get_db)):
    """Commands the ESP32 to execute finger.emptyDatabase() to wipe all templates from the physical sensor."""
    # Wipe fingerprint_id from ALL employees (active and inactive)
    await db.execute(update(Employee).values(fingerprint_id=None))
    await db.commit()

    try:
        from server.routes.websocket import ws_manager
        await ws_manager.broadcast_to_devices({
            "command": "clear_all_employees"
        })
        await ws_manager.broadcast_to_clients({
            "event": "sensor_cleared"
        })
    except Exception:
        pass

    return {"message": "All fingerprint templates erased from physical sensor and ESP32 flash"}
