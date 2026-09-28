from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from server.models.leave import LeaveType, LeaveStatus

class LeaveBase(BaseModel):
    employee_id: int
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: Optional[str] = None
    approval_status: LeaveStatus = LeaveStatus.PENDING

class LeaveCreate(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: Optional[str] = None

class LeaveApproval(BaseModel):
    approval_status: LeaveStatus = LeaveStatus.APPROVED

class LeaveOut(LeaveBase):
    leave_id: int
    approved_by: Optional[int] = None
    created_at: datetime
    employee_name: Optional[str] = None
    approver_name: Optional[str] = None
    employee_dept: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class LeaveBalance(BaseModel):
    employee_id: int
    casual: int
    sick: int
    paid: int
    unpaid: int
