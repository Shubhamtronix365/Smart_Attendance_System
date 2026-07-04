import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.dependencies.auth import require_admin
from server.models import Employee
from server.schemas.settings import SettingsSchema

router = APIRouter(prefix="/settings", tags=["Settings"])

def update_env_file(updates: dict):
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(env_path):
        with open(env_path, "w") as f:
            for k, v in updates.items():
                f.write(f"{k}={v}\n")
        return

    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines = []
    keys_updated = set()

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key, _ = stripped.split("=", 1)
        key = key.strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}\n")
            keys_updated.add(key)
        else:
            new_lines.append(line)

    for key, value in updates.items():
        if key not in keys_updated:
            new_lines.append(f"{key}={value}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


@router.get("", response_model=SettingsSchema)
async def get_settings(current_user: Employee = Depends(require_admin)):
    """
    Get the current system thresholds and configurations (Admin only).
    """
    return SettingsSchema(
        standard_work_hours=settings.STANDARD_WORK_HOURS,
        late_threshold_minutes=settings.LATE_THRESHOLD_MINUTES,
        ot_multiplier=settings.OT_MULTIPLIER,
        device_api_key=settings.DEVICE_API_KEY
    )


@router.put("", response_model=SettingsSchema)
async def update_settings(
    payload: SettingsSchema,
    current_user: Employee = Depends(require_admin)
):
    """
    Update system thresholds and configurations (Admin only).
    Saves updates dynamically to .env and updates the system config in-memory.
    """
    updates = {
        "STANDARD_WORK_HOURS": str(payload.standard_work_hours),
        "LATE_THRESHOLD_MINUTES": str(payload.late_threshold_minutes),
        "OT_MULTIPLIER": str(payload.ot_multiplier),
        "DEVICE_API_KEY": payload.device_api_key
    }
    
    try:
        # 1. Update .env file
        update_env_file(updates)
        
        # 2. Update active in-memory settings
        settings.STANDARD_WORK_HOURS = payload.standard_work_hours
        settings.LATE_THRESHOLD_MINUTES = payload.late_threshold_minutes
        settings.OT_MULTIPLIER = payload.ot_multiplier
        settings.DEVICE_API_KEY = payload.device_api_key
        
        return SettingsSchema(
            standard_work_hours=settings.STANDARD_WORK_HOURS,
            late_threshold_minutes=settings.LATE_THRESHOLD_MINUTES,
            ot_multiplier=settings.OT_MULTIPLIER,
            device_api_key=settings.DEVICE_API_KEY
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update settings: {str(e)}"
        )
