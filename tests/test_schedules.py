import pytest


@pytest.fixture()
def ai_agent_setup(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Sched Org", "org_slug": "schedorg",
        "email": "s@schedorg.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "s@schedorg.com", "password": "TestPass123!"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    agent = client.post("/api/v1/agents", json={
        "name": "Bot", "role_title": "Dev", "type": "ai", "connector_type": "http"
    }, headers=headers).json()
    return headers, agent


def test_create_schedule(client, ai_agent_setup):
    headers, agent = ai_agent_setup
    resp = client.post("/api/v1/schedules", json={"agent_id": agent["id"], "interval_seconds": 60}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["interval_seconds"] == 60
    assert resp.json()["is_enabled"] is True


def test_cannot_schedule_human_agent(client, ai_agent_setup):
    headers, _ = ai_agent_setup
    human = client.post("/api/v1/agents", json={
        "name": "Bob", "role_title": "PM", "type": "human"
    }, headers=headers).json()
    resp = client.post("/api/v1/schedules", json={"agent_id": human["id"]}, headers=headers)
    assert resp.status_code == 400


def test_update_schedule(client, ai_agent_setup):
    headers, agent = ai_agent_setup
    sched = client.post("/api/v1/schedules", json={"agent_id": agent["id"]}, headers=headers).json()
    resp = client.patch(f"/api/v1/schedules/{sched['id']}", json={"is_enabled": False}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_enabled"] is False


def test_duplicate_schedule_returns_409(client, ai_agent_setup):
    headers, agent = ai_agent_setup
    client.post("/api/v1/schedules", json={"agent_id": agent["id"]}, headers=headers)
    resp = client.post("/api/v1/schedules", json={"agent_id": agent["id"]}, headers=headers)
    assert resp.status_code == 409
