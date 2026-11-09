from datetime import date as dt_date, datetime as dt_datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator

class HolidayBase(BaseModel):
    name: str = Field(..., max_length=100)
    date: dt_date
    description: Optional[str] = None
    holiday_type: str = Field("National", max_length=50)  # National, Festival, Public, Company, Optional, Observance, Weekly Off, Fixed Holiday, Custom
    company_name: str = Field("Default", max_length=100)
    is_fixed: bool = False

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, v: Any) -> dt_date:
        if isinstance(v, dt_date):
            return v
        if isinstance(v, str):
            clean = v.split("T")[0].strip()
            if "/" in clean:
                parts = clean.split("/")
                if len(parts) == 3:
                    # DD/MM/YYYY or YYYY/MM/DD
                    if len(parts[0]) == 4:
                        return dt_date(int(parts[0]), int(parts[1]), int(parts[2]))
                    return dt_date(int(parts[2]), int(parts[1]), int(parts[0]))
            return dt_date.fromisoformat(clean)
        raise ValueError("Invalid date format")

class HolidayCreate(HolidayBase):
    pass

class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    date: Optional[dt_date] = None
    description: Optional[str] = None
    holiday_type: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=100)
    is_fixed: Optional[bool] = None

    @field_validator("date", mode="before")
    @classmethod
    def validate_update_date(cls, v: Any) -> Optional[dt_date]:
        if v is None or v == "":
            return None
        if isinstance(v, dt_date):
            return v
        if isinstance(v, str):
            clean = v.split("T")[0].strip()
            if "/" in clean:
                parts = clean.split("/")
                if len(parts) == 3:
                    if len(parts[0]) == 4:
                        return dt_date(int(parts[0]), int(parts[1]), int(parts[2]))
                    return dt_date(int(parts[2]), int(parts[1]), int(parts[0]))
            return dt_date.fromisoformat(clean)
        return v

class HolidayOut(HolidayBase):
    holiday_id: int
    created_at: dt_datetime
    is_fixed: bool = False

    model_config = ConfigDict(from_attributes=True)
