from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import (
    verify_password,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from server.models import Employee
from server.schemas.employee import LoginRequest, TokenSchema, EmployeeOut
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["Authentication"])

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=4)
    new_password: str = Field(..., min_length=4)

@router.post("/login", response_model=TokenSchema)
async def login(
    login_data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Log in an employee using email and password.
    Returns JWT and sets an HTTPOnly cookie.
    """
    # Fetch employee
    stmt = select(Employee).where(Employee.email == login_data.email).where(Employee.is_active == True)
    result = await db.execute(stmt)
    employee = result.scalar_one_or_none()
    
    if not employee or not employee.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
        
    # Verify password
    if not verify_password(login_data.password, employee.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
        
    # Generate token
    access_token = create_access_token(data={"sub": employee.email})
    
    # Set HTTPOnly Cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=60 * 8 * 60,  # 8 hours in seconds
        samesite="none",
        secure=True,  # Required for cross-origin HTTPS
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": employee.role,
        "employee_id": employee.employee_id
    }

@router.post("/logout")
async def logout(response: Response):
    """Clears the session token by deleting the cookie."""
    response.delete_cookie(key="access_token", samesite="none", secure=True)
    return {"message": "Successfully logged out"}

@router.get("/me", response_model=EmployeeOut)
async def get_me(current_user: Employee = Depends(get_current_user)):
    """Returns details of the currently logged-in user."""
    return current_user

@router.put("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Employee = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Allows a logged-in employee (or admin) to change their own password.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"message": "Password updated successfully"}
