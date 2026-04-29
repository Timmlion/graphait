import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Org Test", "org_slug": "orgtest",
        "email": "org@test.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "org@test.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_get_org_settings(client, auth_headers):
    resp = client.get("/api/v1/org", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "system_prompt" in data
    assert "search_api_key" in data


def test_patch_org_settings(client, auth_headers):
    resp = client.patch("/api/v1/org", json={
        "system_prompt": "Build quality software.",
        "openrouter_api_key": "sk-test-123",
        "search_api_key": "search-key-abc",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["system_prompt"] == "Build quality software."
    assert data["openrouter_api_key"] == "sk-test-123"
    assert data["search_api_key"] == "search-key-abc"


def test_project_dir_saved_and_returned(client, auth_headers):
    resp = client.patch("/api/v1/org", json={"project_dir": "/Users/test/myproject"},
                        headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["project_dir"] == "/Users/test/myproject"

    resp = client.get("/api/v1/org", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["project_dir"] == "/Users/test/myproject"
