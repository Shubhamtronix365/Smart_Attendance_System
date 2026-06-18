import enum
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, Date, DateTime, Text, Enum
from sqlalchemy.orm import relationship
from server.database.connection import Base

class LeaveType(str, enum.Enum):
    CASUAL = "casual"
    SICK = "sick"
    PAID = "paid"
    UNPAID = "unpaid"

class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class Leave(Base):
    __tablename__ = "leaves"

    leave_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    leave_type = Column(
        Enum(LeaveType, name="leave_type_enum", values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    approval_status = Column(
        Enum(LeaveStatus, name="leave_status", values_callable=lambda x: [e.value for e in x]),
        default=LeaveStatus.PENDING,
        nullable=False
    )

    approved_by = Column(Integer, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    employee = relationship(
        "Employee",
        foreign_keys=[employee_id],
        back_populates="leaves"
    )
    approver = relationship(
        "Employee",
        foreign_keys=[approved_by]
    )
