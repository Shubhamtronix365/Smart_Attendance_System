import enum
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, Numeric, DateTime, String, Text, Enum
from sqlalchemy.orm import relationship
from server.database.connection import Base

class ReimbursementStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"

class Reimbursement(Base):
    __tablename__ = "reimbursements"

    reimbursement_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    category = Column(String(50), nullable=False)  # Travel, Meals, Office Supplies, Client Entertainment, Medical, Other
    description = Column(Text, nullable=False)
    receipt_filename = Column(String(255), nullable=False)  # Original safe filename
    receipt_mimetype = Column(String(100), nullable=False)  # application/pdf, image/jpeg, etc.
    receipt_storage_path = Column(String(500), nullable=False)  # Internal secured path on disk
    status = Column(
        Enum(ReimbursementStatus, name="reimbursement_status_enum", values_callable=lambda x: [e.value for e in x]),
        default=ReimbursementStatus.PENDING,
        nullable=False,
        index=True
    )
    payroll_id = Column(Integer, ForeignKey("payroll.payroll_id", ondelete="SET NULL"), nullable=True, index=True)
    reviewed_by = Column(Integer, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    reviewer_comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="reimbursements")
    reviewer = relationship("Employee", foreign_keys=[reviewed_by])
    payroll = relationship("Payroll", back_populates="reimbursements")
