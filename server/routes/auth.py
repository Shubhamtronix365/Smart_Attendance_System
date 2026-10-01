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
from typing import Optional
from pydantic import BaseModel, Field, EmailStr

router = APIRouter(prefix="/auth", tags=["Authentication"])

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=4)
    new_password: str = Field(..., min_length=4)

class UpdateCredentialsRequest(BaseModel):
    current_password: str = Field(..., min_length=4, description="Current password for verification")
    new_email: Optional[EmailStr] = Field(None, description="New email address")
    new_password: Optional[str] = Field(None, min_length=4, description="New password")

class AdminResetPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Administrator or employee email to reset")
    secret_key: str = Field(..., min_length=4, description="Admin master secret key or current password")
    new_password: str = Field(..., min_length=4, description="New password to set")

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
    current_user.plain_password = payload.new_password
    await db.commit()
    return {"message": "Password updated successfully"}

@router.put("/credentials")
async def update_credentials(
    payload: UpdateCredentialsRequest,
    current_user: Employee = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Allows a logged-in administrator (or employee) to update their email address
    and/or password, verified by their current password.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    email_updated = False
    if payload.new_email and payload.new_email.lower() != current_user.email.lower():
        # Check if email is already taken by another active user
        chk_stmt = select(Employee).where(
            Employee.email == payload.new_email,
            Employee.employee_id != current_user.employee_id,
            Employee.is_active == True
        )
        chk_res = await db.execute(chk_stmt)
        if chk_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is already in use by another account"
            )
        current_user.email = payload.new_email
        email_updated = True

    pwd_updated = False
    if payload.new_password:
        current_user.hashed_password = get_password_hash(payload.new_password)
        current_user.plain_password = payload.new_password
        pwd_updated = True

    if not email_updated and not pwd_updated:
        return {"message": "No credential changes were provided", "email": current_user.email}

    await db.commit()
    await db.refresh(current_user)

    # Re-issue access token with new email if email changed
    new_token = create_access_token(data={"sub": current_user.email})

    return {
        "message": "Credentials updated successfully",
        "email": current_user.email,
        "token": new_token,
        "email_changed": email_updated,
        "password_changed": pwd_updated
    }

@router.post("/reset-password")
async def reset_password(
    payload: AdminResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Emergency or unauthenticated password reset for administrator/staff.
    Accepts the account email, verified against the current password or master JWT secret.
    """
    from server.config import settings
    stmt = select(Employee).where(Employee.email == payload.email, Employee.is_active == True)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account found with this email"
        )

    # Verify secret_key: either current password or the system master JWT secret
    is_valid_key = (
        payload.secret_key == settings.JWT_SECRET or
        (user.hashed_password and verify_password(payload.secret_key, user.hashed_password))
    )

    if not is_valid_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authorization secret or current password"
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.plain_password = payload.new_password
    await db.commit()
    return {"message": f"Password reset successfully for {user.email}"}
