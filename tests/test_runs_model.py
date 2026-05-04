import uuid
import pytest
from graphait.models.organization import Organization
from graphait.models.task import Task, TaskStatus, TaskPriority, TaskType
from graphait.models.run import AgentRun, RunEvent, RunStatus, RunEventRole


def test_create_agent_run(db):
    org_id = uuid.uuid4()
    db.add(Organization(id=org_id, name="Run Org", slug="runorg"))
    db.flush()
    task_id = uuid.uuid4()
    db.add(Task(id=task_id, org_id=org_id, number=1, title="Test",
                status=TaskStatus.todo, priority=TaskPriority.medium,
                task_type=TaskType.task))
    db.flush()
    run = AgentRun(agent_id="my-agent", task_id=task_id, status=RunStatus.running)
    db.add(run)
    db.commit()
    db.refresh(run)
    assert run.id is not None
    assert run.finished_at is None
    assert run.status == RunStatus.running


def test_create_run_events(db):
    org_id = uuid.uuid4()
    db.add(Organization(id=org_id, name="Run Org 2", slug="runorg2"))
    db.flush()
    task_id = uuid.uuid4()
    db.add(Task(id=task_id, org_id=org_id, number=1, title="Test",
                status=TaskStatus.todo, priority=TaskPriority.medium,
                task_type=TaskType.task))
    db.flush()
    run = AgentRun(agent_id="my-agent", task_id=task_id, status=RunStatus.running)
    db.add(run)
    db.commit()
    db.refresh(run)
    event = RunEvent(run_id=run.id, role=RunEventRole.user, content="Do the thing.")
    db.add(event)
    db.commit()
    events = db.query(RunEvent).filter(RunEvent.run_id == run.id).all()
    assert len(events) == 1
    assert events[0].role == RunEventRole.user
    assert events[0].tool_name is None
