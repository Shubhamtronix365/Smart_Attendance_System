from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, Boolean, Numeric, DateTime, String, Text
from sqlalchemy.orm import relationship
from server.database.connection import Base

class Payroll(Base):
    __tablename__ = "payroll"

    payroll_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    month = Column(Integer, nullable=False)  # 1–12
    year = Column(Integer, nullable=False)
    working_days = Column(Integer, nullable=True)  # total working days in month
    present_days = Column(Integer, default=0)
    absent_days = Column(Integer, default=0)
    late_days = Column(Integer, default=0, nullable=True)  # Count of late check-ins in the billing period
    leave_days = Column(Integer, default=0)
    overtime_hours = Column(Numeric(6, 2), default=0)  # Total OT hours recorded
    payable_ot_hours = Column(Numeric(6, 2), default=0)  # Eligible daily OT hours (strictly > 1h)
    basic_salary = Column(Numeric(12, 2), nullable=True)
    absent_rate = Column(Numeric(10, 2), default=0)  # Admin-configured rate per absent day
    late_rate = Column(Numeric(10, 2), default=0)  # Admin-configured rate per late entry
    ot_rate = Column(Numeric(10, 2), default=0)  # Admin-configured hourly OT rate
    overtime_pay = Column(Numeric(12, 2), default=0)
    late_deduction = Column(Numeric(12, 2), default=0, nullable=True)  # Penalty deducted for late check-ins
    absent_deduction = Column(Numeric(12, 2), default=0, nullable=True)  # Deduction for absent days
    reimbursement_amount = Column(Numeric(12, 2), default=0)  # Approved reimbursements added
    advance_recovered = Column(Numeric(12, 2), default=0)  # Advance salary recovered this month
    advance_balance_remaining = Column(Numeric(12, 2), default=0)  # Outstanding advance balance after recovery
    deductions = Column(Numeric(12, 2), default=0)  # Total deductions (absent + late + advance + other)
    bonus = Column(Numeric(12, 2), default=0, nullable=True)  # Manual bonus / adjustment
    remarks = Column(String(255), nullable=True)  # Manual payroll calculation notes
    final_salary = Column(Numeric(12, 2), nullable=True)
    is_paid = Column(Boolean, default=False)
    approved_by = Column(Integer, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    calculation_snapshot = Column(Text, nullable=True)  # Complete JSON snapshot of rates, attendance, and calculations
    generated_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="payrolls")
    approver = relationship("Employee", foreign_keys=[approved_by])
    reimbursements = relationship("Reimbursement", back_populates="payroll")
    advance_recoveries = relationship("AdvanceRecovery", back_populates="payroll")
