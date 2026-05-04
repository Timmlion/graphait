import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Test Org", "org_slug": "testorg",
        "email": "test@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "test@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_agent(client, auth_headers):
    resp = client.post("/api/v1/agents", json={
        "id": "cto", "name": "CTO", "role_title": "Chief Technology Officer",
        "type": "ai", "model": "anthropic/claude-3-5-sonnet",
        "working_dir": "./workspaces/cto", "schedule_interval": 300
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["id"] == "cto"


def test_list_agents(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "dev1", "name": "Dev", "role_title": "Dev", "type": "ai",
        "model": "x/y", "working_dir": "./w/dev1", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.get("/api/v1/agents", headers=auth_headers)
    assert resp.status_code == 200
    assert any(a["id"] == "dev1" for a in resp.json())


def test_update_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "dev2", "name": "Dev2", "role_title": "Dev", "type": "ai",
        "model": "x/y", "working_dir": "./w/dev2", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.patch("/api/v1/agents/dev2", json={"name": "Dev2 Updated"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Dev2 Updated"


def test_delete_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "temp", "name": "Temp", "role_title": "T", "type": "ai",
        "model": "x/y", "working_dir": "./w/temp", "schedule_interval": 300
    }, headers=auth_headers)
    assert client.delete("/api/v1/agents/temp", headers=auth_headers).status_code == 204
    assert client.get("/api/v1/agents/temp", headers=auth_headers).status_code == 404


def test_run_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "runner", "name": "Runner", "role_title": "R", "type": "ai",
        "model": "x/y", "working_dir": "./w/runner", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.post("/api/v1/agents/runner/run", headers=auth_headers)
    assert resp.status_code == 202
