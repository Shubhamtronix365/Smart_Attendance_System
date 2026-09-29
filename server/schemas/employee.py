from datetime import date, datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class EmployeeBase(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)
    designation: Optional[str] = Field(None, max_length=100)
    salary: Decimal = Field(..., max_digits=12, decimal_places=2)
    overtime_rate: Optional[Decimal] = Field(Decimal("0.00"), max_digits=10, decimal_places=2)
    late_deduction_rate: Optional[Decimal] = Field(Decimal("0.00"), max_digits=10, decimal_places=2)
    late_deduction_type: Optional[str] = Field("per_day", max_length=30)
    fingerprint_id: Optional[int] = None
    rfid_uid: Optional[str] = Field(None, max_length=50)
    role: str = Field("employee", pattern="^(admin|employee)$")

class EmployeeCreate(EmployeeBase):
    password: Optional[str] = None

class EmployeeUpdate(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=50)
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)
    designation: Optional[str] = Field(None, max_length=100)
    salary: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    overtime_rate: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2)
    late_deduction_rate: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2)
    late_deduction_type: Optional[str] = Field(None, max_length=30)
    fingerprint_id: Optional[int] = None
    rfid_uid: Optional[str] = Field(None, max_length=50)
    role: Optional[str] = Field(None, pattern="^(admin|employee)$")
    password: Optional[str] = None
    is_active: Optional[bool] = None

class EmployeeOut(EmployeeBase):
    employee_id: int
    joining_date: date
    is_active: bool
    created_at: datetime
    plain_password: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    employee_id: int

class EmployeeSummary(BaseModel):
    employee_id: int
    name: str
    present_days: int
    absent_days: int
    leave_days: int
    total_payroll_generated: Decimal
    last_salary_paid: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)
