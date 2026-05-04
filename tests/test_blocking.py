import uuid
import pytest
import graphait.config.loader as loader_mod
from graphait.models.task import Task, Comment, TaskStatus, TaskPriority
from graphait.modules.agent.tools import ToolContext, execute_tool


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def org_id():
    return uuid.uuid4()


def _task(db, org_id, *, number=1, assignee="agent-a", blocked_by=None,
          status=TaskStatus.in_progress):
    t = Task(
        org_id=org_id, number=number, title="T",
        status=status, priority=TaskPriority.medium,
        assignee_id=assignee, blocked_by_agent_id=blocked_by,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _ctx(db, org_id, task, agent_id="agent-a"):
    return ToolContext(
        db=db, org_id=str(org_id), task_id=str(task.id),
        agent_id=agent_id, working_dir="/tmp",
    )


# --- ask_agent tool tests ---

def test_ask_agent_sets_fields(db, org_id):
    task = _task(db, org_id)
    ctx = _ctx(db, org_id, task, agent_id="agent-a")

    result = execute_tool("ask_agent", {"agent_id": "agent-b", "question": "What is X?"}, ctx)

    assert "agent-b" in result
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"
    assert task.assignee_id == "agent-b"
    assert task.status == TaskStatus.in_progress
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert len(comments) == 1
    assert "@agent-b: What is X?" in comments[0].content
    assert comments[0].is_system is False


def test_ask_agent_rejects_chaining(db, org_id):
    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    ctx = _ctx(db, org_id, task, agent_id="agent-b")

    result = execute_tool("ask_agent", {"agent_id": "agent-c", "question": "And?"}, ctx)

    assert "Error" in result
    assert "single-level" in result
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged


# --- TaskBlockingService tests ---

def test_on_run_closed_returns_to_original(db, org_id, monkeypatch):
    from graphait.modules.tasks import blocking as bl_mod
    triggered = []
    monkeypatch.setattr(bl_mod, "_trigger", lambda aid: triggered.append(aid))

    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-b")

    db.refresh(task)
    assert task.assignee_id == "agent-a"
    assert task.blocked_by_agent_id is None
    assert task.status == TaskStatus.in_progress
    assert triggered == ["agent-a"]
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert len(comments) == 1
    assert "agent-a" in comments[0].content
    assert comments[0].is_system is True


def test_on_run_closed_skips_when_original_closes(db, org_id):
    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-a")  # original closing

    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged
    assert task.assignee_id == "agent-b"           # unchanged


def test_on_run_closed_noop_when_no_blocked_by(db, org_id):
    task = _task(db, org_id)
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-a")  # no-op
    db.refresh(task)
    assert task.blocked_by_agent_id is None


def test_on_comment_added_triggers_return(db, org_id, monkeypatch):
    from graphait.modules.tasks import blocking as bl_mod
    triggered = []
    monkeypatch.setattr(bl_mod, "_trigger", lambda aid: triggered.append(aid))

    task = _task(db, org_id, assignee="human-user", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "human-user")

    assert result is True
    db.refresh(task)
    assert task.assignee_id == "agent-a"
    assert task.blocked_by_agent_id is None
    assert task.status == TaskStatus.in_progress
    assert triggered == ["agent-a"]


def test_on_comment_added_ignores_wrong_commenter(db, org_id):
    task = _task(db, org_id, assignee="human-user", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "someone-else")

    assert result is False
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged


def test_on_comment_added_noop_when_no_blocked_by(db, org_id):
    task = _task(db, org_id)
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "agent-a")
    assert result is False
