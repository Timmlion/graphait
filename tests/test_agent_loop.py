import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ──────────────────────────────────────────────────────────────────

AGENT_ID = "test-dev"


def make_agent():
    from graphait.config.loader import AgentConfig
    return AgentConfig(id=AGENT_ID, name="Test Dev", role_title="Developer",
                       type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
                       working_dir="/tmp/test-dev-loop", reports_to=None,
                       schedule_interval=300, schedule_enabled=True,
                       tools=["read_file"], skills=[], system_prompt="You are a dev.")


def make_org():
    from graphait.config.loader import OrgConfig
    return OrgConfig(name="Acme", system_prompt="Build quality software.",
                     openrouter_api_key="sk-org", default_model="anthropic/claude-3-5-sonnet")


def make_task(db):
    from graphait.models.organization import Organization
    from graphait.models.task import Task, TaskStatus, TaskPriority

    org_id = uuid.uuid4()
    org = Organization(id=org_id, name="Acme", slug="acme")
    db.add(org)
    db.flush()

    task = Task(id=uuid.uuid4(), org_id=org_id, number=1, title="Write tests",
                description="Add unit tests.", status=TaskStatus.todo,
                priority=TaskPriority.high, creator_id=AGENT_ID,
                assignee_id=AGENT_ID)
    db.add(task)
    db.flush()
    return task


def mock_response(content=None, tool_calls=None):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
        msg["content"] = None
    return {"choices": [{"message": msg}]}


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_loop_completes_on_text_response(db):
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import Comment
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Tests are done!")
    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), make_org(), task, db).run()
    db.refresh(task)
    assert task.status.value == "done"
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert len(comments) == 1
    assert comments[0].is_system == False
    assert "Tests are done!" in comments[0].content

    # Verify AgentRun was created and closed
    from graphait.models.run import AgentRun, RunEvent, RunStatus, RunEventRole
    run = db.query(AgentRun).first()
    assert run is not None
    assert run.status == RunStatus.done
    assert run.finished_at is not None
    events = db.query(RunEvent).filter(RunEvent.run_id == run.id).all()
    assert any(e.role == RunEventRole.user for e in events)
    assert any(e.role == RunEventRole.assistant for e in events)


@pytest.mark.asyncio
async def test_loop_executes_tool_then_completes(db):
    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)

    tool_call = {"id": "call_1", "type": "function",
                 "function": {"name": "post_comment",
                              "arguments": json.dumps({"content": "Working on it."})}}
    responses = [mock_response(tool_calls=[tool_call]), mock_response(content="All done.")]
    idx = [0]

    async def fake_post(*a, **kw):
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = responses[min(idx[0], len(responses) - 1)]
        idx[0] += 1
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = fake_post
        await AgentLoop(make_agent(), make_org(), task, db).run()

    db.refresh(task)
    assert task.status.value == "done"
    from graphait.models.task import Comment
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert any("Working on it." in c.content for c in comments)

    # Verify tool events were logged
    from graphait.models.run import AgentRun, RunEvent, RunStatus, RunEventRole
    run = db.query(AgentRun).first()
    assert run.status == RunStatus.done
    events = db.query(RunEvent).filter(RunEvent.run_id == run.id).all()
    assert any(e.role == RunEventRole.tool_call for e in events)
    assert any(e.role == RunEventRole.tool_result for e in events)


@pytest.mark.asyncio
async def test_loop_injects_working_dir_in_system_prompt(db, tmp_path, monkeypatch):
    import graphait.config.loader as loader_mod
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()

    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Done.")

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), make_org(), task, db).run()

    call_json = mock_http.post.call_args.kwargs["json"]
    system_content = next(m["content"] for m in call_json["messages"] if m["role"] == "system")
    assert "Your working directory: /tmp/test-dev-loop" in system_content


@pytest.mark.asyncio
async def test_loop_appends_context_docs_in_system_prompt(db, tmp_path, monkeypatch):
    import graphait.config.loader as loader_mod
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()
    (tmp_path / "config" / "context" / "project-overview.md").write_text(
        "# Project\nBuild great things."
    )

    from graphait.modules.agent.loop import AgentLoop
    from graphait.config.loader import AgentConfig
    agent = AgentConfig(
        id=AGENT_ID, name="Test Dev", role_title="Developer",
        type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
        working_dir="/tmp/test-dev-loop", reports_to=None,
        schedule_interval=300, schedule_enabled=True,
        tools=["read_file"], skills=[], system_prompt="You are a dev.",
        context=["project-overview"],
    )
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Done.")

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(agent, make_org(), task, db).run()

    call_json = mock_http.post.call_args.kwargs["json"]
    system_content = next(m["content"] for m in call_json["messages"] if m["role"] == "system")
    assert "## Context: Project Overview" in system_content
    assert "Build great things." in system_content


@pytest.mark.asyncio
async def test_loop_exits_on_request_approval(db):
    """request_approval tool sets task to waiting_approval and closes run as blocked."""
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import TaskStatus, Comment
    from graphait.models.run import AgentRun, RunStatus

    task = make_task(db)
    tool_call = {
        "id": "call_1", "type": "function",
        "function": {
            "name": "request_approval",
            "arguments": json.dumps({"reason": "About to drop the database. Please confirm."})
        }
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(tool_calls=[tool_call])

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), make_org(), task, db).run()

    db.refresh(task)
    assert task.status == TaskStatus.waiting_approval

    run = db.query(AgentRun).first()
    assert run.status == RunStatus.blocked

    comments = db.query(Comment).filter(Comment.task_id == task.id, Comment.is_system == True).all()
    assert any("drop the database" in c.content for c in comments)
    # API called exactly once (one iteration before exiting)
    assert mock_http.post.call_count == 1


@pytest.mark.asyncio
async def test_update_status_saves_outcome(db):
    """Agent can write an outcome summary when marking task done."""
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import TaskStatus

    task = make_task(db)
    tool_call = {
        "id": "call_1", "type": "function",
        "function": {
            "name": "update_status",
            "arguments": json.dumps({
                "status": "done",
                "outcome": "Implemented rate limiting middleware. All tests pass."
            })
        }
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(tool_calls=[tool_call])

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), make_org(), task, db).run()

    db.refresh(task)
    assert task.status == TaskStatus.done
    assert task.outcome == "Implemented rate limiting middleware. All tests pass."


@pytest.mark.asyncio
async def test_run_skips_if_task_already_locked(db):
    """AgentLoop.run() exits immediately if another run is already active for this task."""
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.run import AgentRun, RunStatus

    task = make_task(db)

    # Seed an active run for this task (simulates another agent already working on it)
    existing_run = AgentRun(
        agent_id="other-agent",
        task_id=task.id,
        status=RunStatus.running,
    )
    db.add(existing_run)
    db.commit()

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        await AgentLoop(make_agent(), make_org(), task, db).run()

    # API must not have been called
    mock_http.post.assert_not_called()

    # No new AgentRun should have been created
    runs = db.query(AgentRun).all()
    assert len(runs) == 1  # only the seeded one


@pytest.mark.asyncio
async def test_loop_injects_project_dir_in_system_prompt(db, tmp_path, monkeypatch):
    import graphait.config.loader as loader_mod
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()

    from graphait.modules.agent.loop import AgentLoop
    from graphait.config.loader import OrgConfig

    org = OrgConfig(
        name="Acme", system_prompt="Build quality software.",
        openrouter_api_key="sk-org", default_model="anthropic/claude-3-5-sonnet",
        project_dir="/Users/test/projects/my-app",
    )
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Done.")

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), org, task, db).run()

    call_json = mock_http.post.call_args.kwargs["json"]
    system_content = next(m["content"] for m in call_json["messages"] if m["role"] == "system")
    assert "Project directory (shared repo root): /Users/test/projects/my-app" in system_content


@pytest.mark.asyncio
async def test_agent_can_create_subtask(db):
    """Agent creates a subtask by passing parent_task_id to create_task."""
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import Task

    task = make_task(db)
    tool_call = {
        "id": "call_1", "type": "function",
        "function": {
            "name": "create_task",
            "arguments": json.dumps({
                "title": "Write unit tests",
                "parent_task_id": str(task.id),
            })
        }
    }
    responses = [mock_response(tool_calls=[tool_call]), mock_response(content="Done.")]
    idx = [0]

    async def fake_post(*a, **kw):
        r = MagicMock(); r.status_code = 200
        r.json.return_value = responses[min(idx[0], len(responses) - 1)]
        idx[0] += 1
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = fake_post
        await AgentLoop(make_agent(), make_org(), task, db).run()

    from graphait.models.organization import Organization
    org = db.query(Organization).first()
    all_tasks = db.query(Task).filter(Task.org_id == org.id).all()
    subtask = next((t for t in all_tasks if t.id != task.id), None)
    assert subtask is not None
    assert subtask.title == "Write unit tests"
    assert subtask.parent_task_id == task.id
