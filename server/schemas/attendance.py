from datetime import date, datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from server.models.attendance import AttendanceStatus

class AttendanceBase(BaseModel):
    employee_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    working_hours: Optional[Decimal] = None
    overtime_hours: Decimal = Decimal("0.00")
    late_minutes: Optional[int] = 0
    status: AttendanceStatus = AttendanceStatus.ABSENT
    source: str = "biometric"  # "biometric" | "manual"
    punches: Optional[str] = "[]"
    checkout_count: Optional[int] = 0

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    date: Optional[date] = None
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    working_hours: Optional[Decimal] = None
    overtime_hours: Optional[Decimal] = None
    status: Optional[AttendanceStatus] = None
    source: Optional[str] = None
    punches: Optional[str] = None
    checkout_count: Optional[int] = None

class SessionItem(BaseModel):
    session: Optional[int] = 1
    in_time: str = Field(..., alias="in")
    out_time: Optional[str] = Field(None, alias="out")
    hours: Optional[float] = None

    model_config = ConfigDict(populate_by_name=True)

class UpdateSessionsPayload(BaseModel):
    sessions: list[SessionItem]

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
    holiday: Optional[int] = 0
    overtime_hours: Optional[Decimal] = Decimal("0.00")
    late_minutes: Optional[int] = 0
    late_hours: Optional[Decimal] = Decimal("0.00")
    month_overtime_hours: Optional[Decimal] = Decimal("0.00")
    month_late_hours: Optional[Decimal] = Decimal("0.00")
    month_late_minutes: Optional[int] = 0
