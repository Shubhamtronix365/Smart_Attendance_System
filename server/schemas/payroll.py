from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

class PayrollBase(BaseModel):
    employee_id: int
    month: int
    year: int
    working_days: Optional[int] = None
    present_days: int = 0
    absent_days: int = 0
    leave_days: int = 0
    overtime_hours: Decimal = Decimal("0.00")
    basic_salary: Optional[Decimal] = None
    overtime_pay: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    final_salary: Optional[Decimal] = None
    is_paid: bool = False

class PayrollCreate(PayrollBase):
    pass

class PayrollUpdate(BaseModel):
    is_paid: Optional[bool] = None

class PayrollOut(PayrollBase):
    payroll_id: int
    generated_at: datetime
    employee_name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
