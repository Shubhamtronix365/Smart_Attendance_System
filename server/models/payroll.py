from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, Boolean, Numeric, DateTime, String
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
    overtime_hours = Column(Numeric(6, 2), default=0)
    basic_salary = Column(Numeric(12, 2), nullable=True)
    overtime_pay = Column(Numeric(12, 2), default=0)
    late_deduction = Column(Numeric(12, 2), default=0, nullable=True)  # Penalty deducted for late check-ins
    deductions = Column(Numeric(12, 2), default=0)  # Total deductions (absent + late + other)
    bonus = Column(Numeric(12, 2), default=0, nullable=True)  # Manual bonus / adjustment
    remarks = Column(String(255), nullable=True)  # Manual payroll calculation notes
    final_salary = Column(Numeric(12, 2), nullable=True)
    is_paid = Column(Boolean, default=False)
    generated_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="payrolls")
