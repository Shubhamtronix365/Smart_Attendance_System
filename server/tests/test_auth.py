import pytest
from datetime import timedelta
from jose import jwt
from server.dependencies.auth import get_password_hash, verify_password, create_access_token
from server.config import settings

def test_password_hashing():
    password = "secret_password"
    hashed = get_password_hash(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_create_access_token():
    payload = {"sub": "test@example.com"}
    token = create_access_token(payload, expires_delta=timedelta(minutes=15))
    
    assert token is not None
    
    decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    assert decoded["sub"] == "test@example.com"
    assert "exp" in decoded
