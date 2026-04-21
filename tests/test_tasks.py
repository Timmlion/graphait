import pytest


@pytest.fixture()
def setup(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Task Org", "org_slug": "taskorg",
        "email": "tasks@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "tasks@org.com", "password": "TestPass123!"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Create a human agent and link user to it
    agent = client.post("/api/v1/agents", json={
        "name": "Alice", "role_title": "PM", "type": "human"
    }, headers=headers).json()
    me = client.get("/api/v1/auth/me", headers=headers).json()
    client.patch(f"/api/v1/agents/{agent['id']}", json={"user_id": me["id"]}, headers=headers)
    return headers, agent


def test_create_task(client, setup):
    headers, agent = setup
    resp = client.post("/api/v1/tasks", json={"title": "Fix bug #1", "priority": "high"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["title"] == "Fix bug #1"
    assert resp.json()["number"] == 1


def test_list_tasks(client, setup):
    headers, agent = setup
    client.post("/api/v1/tasks", json={"title": "Task A"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "Task B"}, headers=headers)
    resp = client.get("/api/v1/tasks", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_task_status(client, setup):
    headers, agent = setup
    task = client.post("/api/v1/tasks", json={"title": "Do thing"}, headers=headers).json()
    resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "in_progress"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_create_task_without_linked_agent_returns_400(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "NoAgent Org", "org_slug": "noagentorg",
        "email": "noagent@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "noagent@org.com", "password": "TestPass123!"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    resp = client.post("/api/v1/tasks", json={"title": "No creator"}, headers=headers)
    assert resp.status_code == 400


def test_add_and_list_comments(client, setup):
    headers, agent = setup
    task = client.post("/api/v1/tasks", json={"title": "Commented task"}, headers=headers).json()
    client.post(f"/api/v1/tasks/{task['id']}/comments", json={"content": "First comment"}, headers=headers)
    resp = client.get(f"/api/v1/tasks/{task['id']}/comments", headers=headers)
    assert resp.status_code == 200
    assert resp.json()[0]["content"] == "First comment"
