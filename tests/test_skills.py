import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Skill Org", "org_slug": "skillorg",
        "email": "skill@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "skill@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_and_list_skills(client, auth_headers):
    resp = client.post("/api/v1/skills", json={
        "id": "python-senior", "name": "Python Senior", "content": "# Python\nBe excellent."
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["id"] == "python-senior"
    listed = client.get("/api/v1/skills", headers=auth_headers).json()
    assert any(s["id"] == "python-senior" for s in listed)


def test_get_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "react-expert", "name": "React Expert",
                                         "content": "Use hooks."}, headers=auth_headers)
    resp = client.get("/api/v1/skills/react-expert", headers=auth_headers)
    assert resp.status_code == 200
    assert "Use hooks." in resp.json()["content"]


def test_patch_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "ts-dev", "name": "TS Dev",
                                         "content": "Old content."}, headers=auth_headers)
    resp = client.patch("/api/v1/skills/ts-dev", json={"content": "New content."},
                        headers=auth_headers)
    assert resp.status_code == 200
    assert "New content." in resp.json()["content"]


def test_delete_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "gone", "name": "Gone",
                                         "content": "bye"}, headers=auth_headers)
    assert client.delete("/api/v1/skills/gone", headers=auth_headers).status_code == 204
    assert client.get("/api/v1/skills/gone", headers=auth_headers).status_code == 404
