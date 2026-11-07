from datetime import date, datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from server.models.advance import AdvanceStatus

class AdvanceBase(BaseModel):
    employee_id: int
    amount: Decimal = Field(..., gt=0)
    advance_date: date = Field(default_factory=date.today)
    payment_method: str = Field("Bank Transfer", max_length=50)
    reference_no: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None

class AdvanceCreate(AdvanceBase):
    pass

class AdvanceRecoveryOut(BaseModel):
    recovery_id: int
    payroll_id: int
    amount_recovered: Decimal
    recovery_date: date
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AdvanceOut(AdvanceBase):
    advance_id: int
    status: AdvanceStatus
    created_at: datetime
    employee_name: Optional[str] = None
    recoveries: List[AdvanceRecoveryOut] = []

    model_config = ConfigDict(from_attributes=True)

class AdvanceSummary(BaseModel):
    employee_id: int
    employee_name: str
    total_advances: Decimal
    total_recovered: Decimal
    outstanding_balance: Decimal
    advances: List[AdvanceOut] = []
    recoveries: List[AdvanceRecoveryOut] = []

    model_config = ConfigDict(from_attributes=True)
