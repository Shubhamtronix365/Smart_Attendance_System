import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/smart_attendance"
    JWT_SECRET: str = "8f5a1fd8964d4ef7b5a1a1f0a1c9e88d0859a0f0254c7d0d0f985b1a3297a8bc"
    JWT_ALGORITHM: str = "HS256"
    DEVICE_API_KEY: str = "esp32_device_secret_key"
    STANDARD_WORK_HOURS: int = 8
    LATE_THRESHOLD_MINUTES: int = 30
    OT_MULTIPLIER: float = 1.5
    FRONTEND_URL: str = "http://localhost:3000"

    # Specify env file configuration
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
