import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, Header, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import get_db
from server.models import Employee

# OAuth2 Scheme to look up Bearer token in the Authorization header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain text password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Generates a bcrypt hash from a plain text password."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a JWT access token encoding the payload."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=8)  # Default to 8 hours expiration
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Employee:
    """
    Dependency to get the current logged-in employee.
    Resolves token from Authorization header or 'access_token' cookie.
    """
    # Fallback to cookies if Authorization header not provided
    if not token:
        token = request.cookies.get("access_token")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is expired or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    stmt = select(Employee).where(Employee.email == email).where(Employee.is_active == True)
    result = await db.execute(stmt)
    employee = result.scalar_one_or_none()
    
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Employee account does not exist or is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return employee

def require_admin(current_user: Employee = Depends(get_current_user)) -> Employee:
    """
    Dependency that enforces the logged-in user has an 'admin' role.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin privilege required"
        )
    return current_user

def verify_device_key(x_device_key: str = Header(...)):
    """
    Dependency to verify the API key provided in the header by ESP32 device.
    """
    if x_device_key != settings.DEVICE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid device key verification failed"
        )
