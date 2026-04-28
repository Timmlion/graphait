import uuid
import pytest
import graphait.config.loader as loader_mod
from graphait.models.organization import Organization
from graphait.models.task import Task, TaskStatus, TaskPriority, TaskType
from graphait.models.run import AgentRun, RunEvent, RunStatus, RunEventRole


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Runs Org", "org_slug": "runsorg",
        "email": "runs@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login",
                    json={"email": "runs@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed_run(db, agent_id="test-agent", status=RunStatus.running):
    org_id = uuid.uuid4()
    db.add(Organization(id=org_id, name=f"Org {agent_id}", slug=f"org-{uuid.uuid4().hex[:6]}"))
    db.flush()
    task_id = uuid.uuid4()
    db.add(Task(id=task_id, org_id=org_id, number=1, title="Test Task",
                status=TaskStatus.todo, priority=TaskPriority.medium,
                task_type=TaskType.task))
    db.flush()
    run = AgentRun(agent_id=agent_id, task_id=task_id, status=status)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_list_runs_returns_active_first(client, db, headers):
    _seed_run(db, agent_id="done-agent", status=RunStatus.done)
    _seed_run(db, agent_id="active-agent", status=RunStatus.running)
    resp = client.get("/api/v1/runs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    # active run (finished_at=null) must come first
    assert data[0]["finished_at"] is None
    assert data[0]["agent_id"] == "active-agent"


def test_list_events(client, db, headers):
    run = _seed_run(db)
    db.add(RunEvent(run_id=run.id, role=RunEventRole.user, content="Context."))
    db.add(RunEvent(run_id=run.id, role=RunEventRole.assistant, content="Done."))
    db.commit()
    resp = client.get(f"/api/v1/runs/{run.id}/events", headers=headers)
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 2
    assert events[0]["role"] == "user"
    assert events[1]["role"] == "assistant"


def test_list_events_with_tool(client, db, headers):
    run = _seed_run(db)
    db.add(RunEvent(run_id=run.id, role=RunEventRole.tool_call,
                    content='{"path":"hello.py"}', tool_name="read_file"))
    db.add(RunEvent(run_id=run.id, role=RunEventRole.tool_result,
                    content="print('hello')", tool_name="read_file"))
    db.commit()
    resp = client.get(f"/api/v1/runs/{run.id}/events", headers=headers)
    events = resp.json()
    assert events[0]["tool_name"] == "read_file"
    assert events[1]["tool_name"] == "read_file"
