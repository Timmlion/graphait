import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Task Org", "org_slug": "taskorg2",
        "email": "tasks2@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "tasks2@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_task(client, headers):
    resp = client.post("/api/v1/tasks", json={"title": "Fix bug #1", "priority": "high"},
                       headers=headers)
    assert resp.status_code == 201
    assert resp.json()["number"] == 1


def test_list_tasks(client, headers):
    client.post("/api/v1/tasks", json={"title": "A"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "B"}, headers=headers)
    assert len(client.get("/api/v1/tasks", headers=headers).json()) == 2


def test_filter_tasks_by_assignee(client, headers):
    client.post("/api/v1/tasks", json={"title": "Assigned", "assignee_id": "cto"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "Unassigned"}, headers=headers)
    resp = client.get("/api/v1/tasks?assignee_id=cto", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["assignee_id"] == "cto"


def test_update_task_status(client, headers):
    task = client.post("/api/v1/tasks", json={"title": "Do thing"}, headers=headers).json()
    resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "in_progress"},
                        headers=headers)
    assert resp.json()["status"] == "in_progress"


def test_add_and_list_comments(client, headers):
    task = client.post("/api/v1/tasks", json={"title": "With comments"}, headers=headers).json()
    post = client.post(f"/api/v1/tasks/{task['id']}/comments",
                       json={"content": "First comment"}, headers=headers)
    assert post.status_code == 201
    comments = client.get(f"/api/v1/tasks/{task['id']}/comments", headers=headers).json()
    assert comments[0]["content"] == "First comment"
