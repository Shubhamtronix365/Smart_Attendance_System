import enum
from datetime import datetime, date
from sqlalchemy import Column, Integer, ForeignKey, Numeric, Date, DateTime, String, Text, Enum
from sqlalchemy.orm import relationship
from server.database.connection import Base

class AdvanceStatus(str, enum.Enum):
    OPEN = "open"
    PARTIALLY_RECOVERED = "partially_recovered"
    FULLY_RECOVERED = "fully_recovered"

class SalaryAdvance(Base):
    __tablename__ = "salary_advances"

    advance_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    advance_date = Column(Date, default=date.today, nullable=False)
    payment_method = Column(String(50), default="Bank Transfer", nullable=False)  # Bank Transfer, UPI, Cash, Cheque
    reference_no = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(
        Enum(AdvanceStatus, name="advance_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=AdvanceStatus.OPEN,
        nullable=False
    )
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="advances")
    recoveries = relationship("AdvanceRecovery", back_populates="advance", cascade="all, delete-orphan")

class AdvanceRecovery(Base):
    __tablename__ = "advance_recoveries"

    recovery_id = Column(Integer, primary_key=True, autoincrement=True)
    advance_id = Column(Integer, ForeignKey("salary_advances.advance_id", ondelete="SET NULL"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_id = Column(Integer, ForeignKey("payroll.payroll_id", ondelete="CASCADE"), nullable=False, index=True)
    amount_recovered = Column(Numeric(12, 2), nullable=False)
    recovery_date = Column(Date, default=date.today, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    advance = relationship("SalaryAdvance", back_populates="recoveries")
    payroll = relationship("Payroll", back_populates="advance_recoveries")
    employee = relationship("Employee")
