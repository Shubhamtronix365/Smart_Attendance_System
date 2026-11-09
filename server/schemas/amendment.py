from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from server.models.amendment import AmendmentStatus

class LateAmendmentCreate(BaseModel):
    attendance_id: int
    reason: str = Field(..., min_length=3)
    auto_approve: Optional[bool] = False
    reviewer_comments: Optional[str] = None

class LateAmendmentReview(BaseModel):
    status: AmendmentStatus  # approved | rejected
    reviewer_comments: Optional[str] = None

class LateAmendmentOut(BaseModel):
    amendment_id: int
    employee_id: int
    employee_name: Optional[str] = None
    attendance_id: int
    attendance_date: Optional[str] = None
    original_late_minutes: int
    reason: str
    attachment_path: Optional[str] = None
    status: AmendmentStatus
    reviewer_comments: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class LeaveAmendmentCreate(BaseModel):
    leave_id: int
    reason: str = Field(..., min_length=5)

class LeaveAmendmentReview(BaseModel):
    status: AmendmentStatus  # approved | rejected
    reviewer_comments: Optional[str] = None

class LeaveAmendmentOut(BaseModel):
    amendment_id: int
    employee_id: int
    employee_name: Optional[str] = None
    leave_id: int
    reason: str
    status: AmendmentStatus
    reviewer_comments: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
