import uuid
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Approval Org", "org_slug": "approvalorg",
        "email": "approval@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "approval@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_approve_task(client, headers, db):
    from graphait.models.task import Task, TaskStatus
    # Create a task first
    resp = client.post("/api/v1/tasks", json={"title": "Needs approval"}, headers=headers)
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    # Set it to waiting_approval directly
    task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    task.status = TaskStatus.waiting_approval
    db.commit()

    resp = client.post(f"/api/v1/tasks/{task_id}/approve", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_reject_task(client, headers, db):
    from graphait.models.task import Task, TaskStatus
    # Create a task first
    resp = client.post("/api/v1/tasks", json={"title": "Needs rejection"}, headers=headers)
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    # Set it to waiting_approval
    task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    task.status = TaskStatus.waiting_approval
    db.commit()

    resp = client.post(f"/api/v1/tasks/{task_id}/reject", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_approve_non_waiting_task_returns_400(client, headers):
    # Create a task — default status is 'todo', not waiting_approval
    resp = client.post("/api/v1/tasks", json={"title": "Normal task"}, headers=headers)
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    resp = client.post(f"/api/v1/tasks/{task_id}/approve", headers=headers)
    assert resp.status_code == 400


def test_outcome_returned_in_task_read(client, headers, db):
    from graphait.models.task import Task
    resp = client.post("/api/v1/tasks", json={"title": "Outcome task"}, headers=headers)
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    task.outcome = "Feature complete."
    db.commit()

    resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "Feature complete."


def test_outcome_updatable_via_patch(client, headers, db):
    from graphait.models.task import Task
    resp = client.post("/api/v1/tasks", json={"title": "Patchable task"}, headers=headers)
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    resp = client.patch(f"/api/v1/tasks/{task_id}", json={"outcome": "Done and deployed."}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "Done and deployed."
