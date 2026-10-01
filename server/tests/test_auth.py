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

def test_credential_update_logic():
    # Test updating password hash
    original_pass = "oldAdmin123"
    hashed = get_password_hash(original_pass)
    assert verify_password(original_pass, hashed) is True

    new_pass = "newAdminSecure456"
    new_hashed = get_password_hash(new_pass)
    assert verify_password(new_pass, new_hashed) is True
    assert verify_password(original_pass, new_hashed) is False
