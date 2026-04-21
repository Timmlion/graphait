import pytest


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Test Org", "org_slug": "testorg",
        "email": "test@org.com", "password": "TestPass123!"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "test@org.com", "password": "TestPass123!"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_agent(client, auth_headers):
    resp = client.post("/api/v1/agents", json={
        "name": "CEO Agent", "role_title": "CEO", "type": "ai",
        "connector_type": "http"
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["role_title"] == "CEO"


def test_list_agents(client, auth_headers):
    client.post("/api/v1/agents", json={"name": "A", "role_title": "CTO", "type": "ai"}, headers=auth_headers)
    resp = client.get("/api/v1/agents", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_agent(client, auth_headers):
    create_resp = client.post("/api/v1/agents", json={"name": "Old Name", "role_title": "Dev", "type": "human"}, headers=auth_headers)
    agent_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/agents/{agent_id}", json={"name": "New Name"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_delete_agent(client, auth_headers):
    create_resp = client.post("/api/v1/agents", json={"name": "Temp", "role_title": "Temp", "type": "ai"}, headers=auth_headers)
    agent_id = create_resp.json()["id"]
    resp = client.delete(f"/api/v1/agents/{agent_id}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get(f"/api/v1/agents/{agent_id}", headers=auth_headers).status_code == 404


def test_get_agent_from_other_org_returns_404(client):
    client.post("/api/v1/auth/register", json={"org_name": "Org1", "org_slug": "org1", "email": "a@org1.com", "password": "TestPass123!"})
    r1 = client.post("/api/v1/auth/login", json={"email": "a@org1.com", "password": "TestPass123!"})
    h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}

    client.post("/api/v1/auth/register", json={"org_name": "Org2", "org_slug": "org2", "email": "b@org2.com", "password": "TestPass123!"})
    r2 = client.post("/api/v1/auth/login", json={"email": "b@org2.com", "password": "TestPass123!"})
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

    agent_resp = client.post("/api/v1/agents", json={"name": "Secret", "role_title": "CEO", "type": "ai"}, headers=h1)
    agent_id = agent_resp.json()["id"]

    resp = client.get(f"/api/v1/agents/{agent_id}", headers=h2)
    assert resp.status_code == 404
    list_resp = client.get("/api/v1/agents", headers=h2)
    assert all(a["id"] != agent_id for a in list_resp.json())
