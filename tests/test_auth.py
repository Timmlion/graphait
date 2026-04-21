from datetime import datetime, timedelta, timezone
from graphait.modules.auth.service import hash_password, verify_password, create_access_token, decode_access_token


def test_hash_and_verify_password():
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_and_decode_token():
    token = create_access_token({"sub": "user-id-123"})
    payload = decode_access_token(token)
    assert payload["sub"] == "user-id-123"


def test_decode_invalid_token_returns_none():
    result = decode_access_token("not.a.real.token")
    assert result is None


def test_decode_expired_token_returns_none():
    from graphait.modules.auth.service import create_access_token, decode_access_token
    from graphait.config import settings
    from jose import jwt
    expired_payload = {
        "sub": "user-id-123",
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    }
    token = jwt.encode(expired_payload, settings.secret_key, algorithm=settings.algorithm)
    result = decode_access_token(token)
    assert result is None
