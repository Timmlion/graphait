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


def test_register_creates_org_and_user(client):
    resp = client.post("/api/v1/auth/register", json={
        "org_name": "Acme Corp",
        "org_slug": "acme",
        "email": "admin@acme.com",
        "password": "secret123"
    })
    assert resp.status_code == 201
    assert "access_token" in resp.json()


def test_login_returns_token(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Beta Inc",
        "org_slug": "beta",
        "email": "user@beta.com",
        "password": "pass456"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "user@beta.com", "password": "pass456"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password_returns_401(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Gamma Ltd",
        "org_slug": "gamma",
        "email": "user@gamma.com",
        "password": "correct"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "user@gamma.com", "password": "wrong"})
    assert resp.status_code == 401


def test_me_returns_current_user(client):
    reg = client.post("/api/v1/auth/register", json={
        "org_name": "Delta Co",
        "org_slug": "delta",
        "email": "me@delta.com",
        "password": "mypass"
    })
    token = reg.json()["access_token"]
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@delta.com"


def test_me_without_token_returns_401(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401  # HTTPBearer returns 401 when no credentials
