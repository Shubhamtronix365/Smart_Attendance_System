from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional, Any

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
    overtime_days: Optional[Decimal] = Decimal("0.00")
    overtime_type: Optional[str] = "per_hour"
    basic_salary: Optional[Decimal] = None
    overtime_pay: Decimal = Decimal("0.00")
    late_deduction: Optional[Decimal] = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    bonus: Optional[Decimal] = Decimal("0.00")
    remarks: Optional[str] = None
    final_salary: Optional[Decimal] = None
    is_paid: bool = False

class ManualPayrollSaveRequest(BaseModel):
    employee_id: int
    month: int
    year: int
    working_days: int = 26
    present_days: int = 0
    absent_days: Optional[int] = 0
    late_days: Optional[int] = 0
    leave_days: Optional[int] = 0
    overtime_hours: Decimal = Decimal("0.00")
    overtime_days: Optional[Decimal] = Decimal("0.00")
    overtime_type: Optional[str] = "per_hour"
    basic_salary: Decimal = Decimal("0.00")
    overtime_pay: Decimal = Decimal("0.00")
    late_deduction: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    bonus: Optional[Decimal] = Decimal("0.00")
    remarks: Optional[str] = None
    final_salary: Decimal = Decimal("0.00")
    is_paid: Optional[bool] = False

    @model_validator(mode="before")
    @classmethod
    def populate_defaults_and_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Support total_working_days alias
            if "working_days" not in data and "total_working_days" in data:
                data["working_days"] = data["total_working_days"]
            # Support net_salary alias
            if "final_salary" not in data and "net_salary" in data:
                data["final_salary"] = data["net_salary"]
            # Compute absent_days if not provided
            if "absent_days" not in data or data.get("absent_days") is None:
                w = int(data.get("working_days", 26) or 26)
                p = int(data.get("present_days", 0) or 0)
                data["absent_days"] = max(0, w - p)
            if "leave_days" not in data or data.get("leave_days") is None:
                data["leave_days"] = 0
        return data

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
