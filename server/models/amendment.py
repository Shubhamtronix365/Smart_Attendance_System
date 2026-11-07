import enum
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime, String, Text, Enum
from sqlalchemy.orm import relationship
from server.database.connection import Base

class AmendmentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class LateAmendment(Base):
    __tablename__ = "late_amendments"

    amendment_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance.attendance_id", ondelete="CASCADE"), nullable=False, index=True)
    original_late_minutes = Column(Integer, default=0, nullable=False)
    reason = Column(Text, nullable=False)
    attachment_path = Column(String(500), nullable=True)
    status = Column(
        Enum(AmendmentStatus, name="amendment_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=AmendmentStatus.PENDING,
        nullable=False,
        index=True
    )
    reviewer_comments = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="late_amendments")
    attendance = relationship("Attendance", back_populates="amendments")
    reviewer = relationship("Employee", foreign_keys=[reviewed_by])

class LeaveAmendment(Base):
    __tablename__ = "leave_amendments"

    amendment_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    leave_id = Column(Integer, ForeignKey("leaves.leave_id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(
        Enum(AmendmentStatus, name="leave_amendment_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=AmendmentStatus.PENDING,
        nullable=False,
        index=True
    )
    reviewer_comments = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="leave_amendments")
    leave = relationship("Leave")
    reviewer = relationship("Employee", foreign_keys=[reviewed_by])
