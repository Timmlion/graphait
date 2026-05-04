import uuid
import pytest
import graphait.config.loader as loader_mod
from graphait.models.task import Task, Comment, TaskStatus, TaskPriority


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def org_id():
    return uuid.uuid4()


@pytest.fixture()
def parent_task(db, org_id):
    t = Task(
        org_id=org_id,
        number=1,
        title="Parent",
        status=TaskStatus.in_progress,
        priority=TaskPriority.medium,
        creator_id="cto",
        orchestrator_id="cto",
        human_review_required=False,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _make_subtask(db, parent, number, status, sub_number=None):
    s = Task(
        org_id=parent.org_id,
        number=number,
        sub_number=sub_number or number,
        title=f"Sub {number}",
        status=status,
        priority=TaskPriority.medium,
        parent_task_id=parent.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_system_comment_posted_on_parent(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orchestration_service.on_subtask_closed(db, sub)
    comments = db.query(Comment).filter(Comment.task_id == parent_task.id).all()
    assert len(comments) == 2
    notification = next(c for c in comments if "Sub 2" in c.content)
    assert notification.is_system is True
    assert notification.author_id == "system"


def test_no_trigger_when_siblings_pending(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    _make_subtask(db, parent_task, 2, TaskStatus.in_progress, sub_number=1)
    sub2 = _make_subtask(db, parent_task, 3, TaskStatus.done, sub_number=2)
    orchestration_service.on_subtask_closed(db, sub2)
    db.refresh(parent_task)
    assert parent_task.orchestration_review_pending is False
    assert parent_task.assignee_id is None


def test_human_review_sets_pending_flag(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    parent_task.human_review_required = True
    db.commit()
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orchestration_service.on_subtask_closed(db, sub)
    db.refresh(parent_task)
    assert parent_task.orchestration_review_pending is True


def test_auto_trigger_reassigns_parent(db, parent_task, monkeypatch):
    from graphait.modules.tasks import orchestration as orch_mod
    triggered = []
    monkeypatch.setattr(orch_mod, "_trigger", lambda agent_id: triggered.append(agent_id))
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orch_mod.orchestration_service.on_subtask_closed(db, sub)
    db.refresh(parent_task)
    assert parent_task.assignee_id == "cto"
    assert triggered == ["cto"]


def test_auto_trigger_adds_context_comment(db, parent_task, monkeypatch):
    from graphait.modules.tasks import orchestration as orch_mod
    monkeypatch.setattr(orch_mod, "_trigger", lambda _: None)
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orch_mod.orchestration_service.on_subtask_closed(db, sub)
    comments = db.query(Comment).filter(Comment.task_id == parent_task.id).all()
    assert len(comments) == 2
    context_comment = next(c for c in comments if "Review outcomes" in c.content)
    assert context_comment.is_system is True
