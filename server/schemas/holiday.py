from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class HolidayBase(BaseModel):
    name: str = Field(..., max_length=100)
    date: date
    description: Optional[str] = None
    holiday_type: str = Field("National", max_length=50)  # National, Gazetted, Optional, Company, Weekly Off, Fixed Holiday
    company_name: str = Field("Default", max_length=100)
    is_fixed: bool = False

class HolidayCreate(HolidayBase):
    pass

class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    date: Optional[date] = None
    description: Optional[str] = None
    holiday_type: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=100)
    is_fixed: Optional[bool] = None

class HolidayOut(HolidayBase):
    holiday_id: int
    created_at: datetime
    is_fixed: bool = False

    model_config = ConfigDict(from_attributes=True)
