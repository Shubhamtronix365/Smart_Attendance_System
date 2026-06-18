import enum
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, Date, DateTime, Numeric, String, Enum
from sqlalchemy.orm import relationship
from server.database.connection import Base

class AttendanceStatus(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    HALF_DAY = "half_day"
    LEAVE = "leave"
    WFH = "wfh"

class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    check_in = Column(DateTime, nullable=True)
    check_out = Column(DateTime, nullable=True)
    working_hours = Column(Numeric(4, 2), nullable=True)
    overtime_hours = Column(Numeric(4, 2), default=0)
    status = Column(
        Enum(AttendanceStatus, name="attendance_status", values_callable=lambda x: [e.value for e in x]),
        default=AttendanceStatus.ABSENT,
        nullable=False
    )

    source = Column(String(20), default="biometric")  # "biometric" | "manual"
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="attendances")
