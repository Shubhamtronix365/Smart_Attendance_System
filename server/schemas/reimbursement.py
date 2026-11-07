from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from server.models.reimbursement import ReimbursementStatus

class ReimbursementBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    category: str = Field(..., max_length=50)
    description: str = Field(..., min_length=3)

class ReimbursementCreate(ReimbursementBase):
    pass

class ReimbursementReview(BaseModel):
    reviewer_comments: Optional[str] = None

class ReimbursementOut(ReimbursementBase):
    reimbursement_id: int
    employee_id: int
    employee_name: Optional[str] = None
    receipt_filename: str
    receipt_mimetype: str
    status: ReimbursementStatus
    payroll_id: Optional[int] = None
    reviewer_comments: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
