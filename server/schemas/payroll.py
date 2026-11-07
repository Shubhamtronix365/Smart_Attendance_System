from datetime import datetime
from typing import Optional, Any, List, Dict
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, model_validator

class PayrollBase(BaseModel):
    employee_id: int
    month: int
    year: int
    working_days: Optional[int] = None
    present_days: int = 0
    absent_days: int = 0
    late_days: Optional[int] = 0
    leave_days: int = 0
    overtime_hours: Decimal = Decimal("0.00")
    payable_ot_hours: Optional[Decimal] = Decimal("0.00")
    basic_salary: Optional[Decimal] = None
    absent_rate: Optional[Decimal] = Decimal("0.00")
    absent_deduction: Optional[Decimal] = Decimal("0.00")
    late_rate: Optional[Decimal] = Decimal("0.00")
    late_deduction: Optional[Decimal] = Decimal("0.00")
    ot_rate: Optional[Decimal] = Decimal("0.00")
    overtime_pay: Decimal = Decimal("0.00")
    reimbursement_amount: Optional[Decimal] = Decimal("0.00")
    advance_recovered: Optional[Decimal] = Decimal("0.00")
    advance_balance_remaining: Optional[Decimal] = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    bonus: Optional[Decimal] = Decimal("0.00")
    remarks: Optional[str] = None
    final_salary: Optional[Decimal] = None
    is_paid: bool = False

class ManualPayrollSaveRequest(BaseModel):
    employee_id: int
    month: int
    year: int
    absent_rate: Decimal = Decimal("0.00")
    late_rate: Decimal = Decimal("0.00")
    ot_rate: Decimal = Decimal("0.00")
    advance_recovery_choice: str = "none"  # "full" | "partial" | "none"
    advance_recovery_amount: Decimal = Decimal("0.00")
    bonus: Decimal = Decimal("0.00")
    other_deductions: Decimal = Decimal("0.00")
    remarks: Optional[str] = None
    is_paid: bool = False

    @model_validator(mode="before")
    @classmethod
    def populate_defaults_and_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Backward-compat with older payload formats
            if "absent_rate" not in data:
                data["absent_rate"] = Decimal("0.00")
            if "late_rate" not in data:
                data["late_rate"] = Decimal("0.00")
            if "ot_rate" not in data:
                data["ot_rate"] = Decimal("0.00")
            if "advance_recovery_choice" not in data:
                data["advance_recovery_choice"] = "none"
            if "advance_recovery_amount" not in data:
                data["advance_recovery_amount"] = Decimal("0.00")
            if "bonus" not in data:
                data["bonus"] = Decimal("0.00")
            if "other_deductions" not in data:
                data["other_deductions"] = Decimal("0.00")
        return data

class PayrollCalculatePreviewRequest(BaseModel):
    employee_id: int
    month: int
    year: int
    absent_rate: Optional[Decimal] = Decimal("0.00")
    late_rate: Optional[Decimal] = Decimal("0.00")
    ot_rate: Optional[Decimal] = Decimal("0.00")
    advance_recovery_choice: Optional[str] = "none"
    advance_recovery_amount: Optional[Decimal] = Decimal("0.00")
    bonus: Optional[Decimal] = Decimal("0.00")
    other_deductions: Optional[Decimal] = Decimal("0.00")

class PayrollCreate(PayrollBase):
    pass

class PayrollUpdate(BaseModel):
    is_paid: Optional[bool] = None

class PayrollOut(PayrollBase):
    payroll_id: int
    generated_at: datetime
    approved_at: Optional[datetime] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    calculation_snapshot: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
