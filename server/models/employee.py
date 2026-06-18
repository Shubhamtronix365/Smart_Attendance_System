from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Boolean, Numeric, Date, DateTime
from sqlalchemy.orm import relationship
from server.database.connection import Base

class Employee(Base):
    __tablename__ = "employees"

    employee_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    phone = Column(String(20), nullable=True)
    department = Column(String(100), nullable=True)
    designation = Column(String(100), nullable=True)
    salary = Column(Numeric(12, 2), nullable=False)
    fingerprint_id = Column(Integer, unique=True, nullable=True)  # ID stored in sensor
    joining_date = Column(Date, default=date.today)
    is_active = Column(Boolean, default=True)
    hashed_password = Column(String, nullable=True)  # for web login
    plain_password = Column(String, nullable=True)  # for admin viewing
    role = Column(String(20), default="employee")  # "admin" | "employee"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    attendances = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    leaves = relationship(
        "Leave",
        primaryjoin="Employee.employee_id == Leave.employee_id",
        back_populates="employee",
        cascade="all, delete-orphan"
    )
    payrolls = relationship("Payroll", back_populates="employee", cascade="all, delete-orphan")
