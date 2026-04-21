def test_health(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
