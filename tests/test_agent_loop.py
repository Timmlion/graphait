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
