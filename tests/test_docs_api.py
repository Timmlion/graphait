import pytest
from pathlib import Path
from unittest.mock import patch
import graphait.config.loader as loader_mod
from graphait.config.loader import OrgConfig


def _org_with_dir(project_dir: str) -> OrgConfig:
    return OrgConfig(
        name="Test", system_prompt="", openrouter_api_key=None,
        default_model="anthropic/claude-3-5-sonnet",
        project_dir=project_dir,
    )


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Docs Org", "org_slug": "docsorg",
        "email": "docs@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "docs@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_list_files_returns_entries(client, headers, tmp_path):
    (tmp_path / "README.md").write_text("# Hello")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('hi')")

    with patch("graphait.api.v1.docs.load_org", return_value=_org_with_dir(str(tmp_path))):
        resp = client.get("/api/v1/docs", headers=headers)

    assert resp.status_code == 200
    paths = [e["path"] for e in resp.json()]
    assert "README.md" in paths
    assert "src" in paths
    assert "src/main.py" in paths


def test_get_file_content(client, headers, tmp_path):
    (tmp_path / "notes.md").write_text("# Notes\nSome content here.")

    with patch("graphait.api.v1.docs.load_org", return_value=_org_with_dir(str(tmp_path))):
        resp = client.get("/api/v1/docs/content?path=notes.md", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "Some content here." in data["content"]
    assert data["is_markdown"] is True


def test_path_traversal_blocked(client, headers, tmp_path):
    (tmp_path / "safe.md").write_text("safe")

    with patch("graphait.api.v1.docs.load_org", return_value=_org_with_dir(str(tmp_path))):
        resp = client.get("/api/v1/docs/content?path=../../etc/passwd", headers=headers)

    assert resp.status_code == 400


def test_no_project_dir_returns_422(client, headers):
    with patch("graphait.api.v1.docs.load_org", return_value=OrgConfig()):
        resp = client.get("/api/v1/docs", headers=headers)
    assert resp.status_code == 422
