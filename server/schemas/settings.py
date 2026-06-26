from pydantic import BaseModel, Field

class SettingsSchema(BaseModel):
    standard_work_hours: int = Field(..., description="Standard working hours target (e.g. 8)")
    late_threshold_minutes: int = Field(..., description="Late threshold in minutes (e.g. 30)")
    ot_multiplier: float = Field(..., description="Overtime multiplier (e.g. 1.5)")
    device_api_key: str = Field(..., description="API key used by ESP32 biometric device")
