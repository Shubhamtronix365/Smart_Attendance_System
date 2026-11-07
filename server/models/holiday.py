from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, UniqueConstraint
from server.database.connection import Base

class Holiday(Base):
    __tablename__ = "holidays"

    holiday_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=True)
    holiday_type = Column(String(50), default="National", nullable=False)  # National, Gazetted, Optional, Company
    company_name = Column(String(100), default="Default", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("date", "company_name", name="uq_holiday_date_company"),
    )

    @property
    def is_fixed(self) -> bool:
        return self.holiday_type in ("Weekly Off", "Fixed Holiday") or (self.date and self.date.weekday() == 6)
