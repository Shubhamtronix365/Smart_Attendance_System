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

import datetime as dt
from pydantic import field_validator

class AttendanceUpdate(BaseModel):
    date: Optional[dt.date] = None
    check_in: Optional[dt.datetime] = None
    check_out: Optional[dt.datetime] = None
    working_hours: Optional[Decimal] = None
    overtime_hours: Optional[Decimal] = None
    status: Optional[AttendanceStatus] = None
    source: Optional[str] = None
    punches: Optional[str] = None
    checkout_count: Optional[int] = None

    @field_validator("date", mode="before")
    @classmethod
    def clean_date(cls, v):
        if not v or v in ("", "null", "none", "—", "-"):
            return None
        if isinstance(v, str):
            v = v.split("T")[0].strip()
            return dt.date.fromisoformat(v)
        return v

    @field_validator("check_in", "check_out", mode="before")
    @classmethod
    def clean_datetime(cls, v):
        if not v or v in ("", "null", "none", "—", "-"):
            return None
        if isinstance(v, str):
            v = v.strip()
            # If string ends with AM/PM (e.g. "2026-10-30T09:15:00 AM" or "2026-10-30 09:15 AM")
            if " AM" in v.upper() or " PM" in v.upper():
                import re
                clean = re.sub(r"\s+", " ", v)
                for fmt in ("%Y-%m-%dT%I:%M:%S %p", "%Y-%m-%dT%I:%M %p", "%Y-%m-%d %I:%M:%S %p", "%Y-%m-%d %I:%M %p"):
                    try:
                        return dt.datetime.strptime(clean, fmt)
                    except ValueError:
                        pass
            # Standard ISO datetime or date
            if "T" in v:
                v = v.replace("Z", "")
                parts = v.split("T")
                d_part = parts[0]
                t_part = parts[1]
                if not t_part or t_part in ("—", "-"):
                    return None
                if len(t_part) == 5:
                    t_part += ":00"
                v = f"{d_part}T{t_part}"
                return dt.datetime.fromisoformat(v)
            elif " " in v:
                return dt.datetime.fromisoformat(v)
        return v

    @field_validator("status", mode="before")
    @classmethod
    def clean_status(cls, v):
        if not v or v in ("", "null", "none"):
            return None
        if isinstance(v, str):
            v_low = v.lower().strip()
            if v_low in ("halfday", "half_day"):
                return AttendanceStatus.HALF_DAY
            for s in AttendanceStatus:
                if s.value == v_low:
                    return s
        return v

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
