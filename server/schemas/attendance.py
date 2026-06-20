from datetime import date, datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from server.models.attendance import AttendanceStatus

class AttendanceBase(BaseModel):
    employee_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    working_hours: Optional[Decimal] = None
    overtime_hours: Decimal = Decimal("0.00")
    status: AttendanceStatus = AttendanceStatus.ABSENT
    source: str = "biometric"  # "biometric" | "manual"

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    working_hours: Optional[Decimal] = None
    overtime_hours: Optional[Decimal] = None
    status: Optional[AttendanceStatus] = None
    source: Optional[str] = None

class AttendanceOut(AttendanceBase):
    attendance_id: int
    created_at: datetime
    employee_name: Optional[str] = None  # for display convenience
    employee_dept: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class AttendanceManualEntry(BaseModel):
    employee_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: AttendanceStatus = AttendanceStatus.PRESENT

class AttendanceStats(BaseModel):
    total: int
    present: int
    absent: int
    late: int
    leave: int
