"""
Multi-agent information flow integration test.

Scenario: Feature Development → Code Review
  1. Task "Implement rate limiting" is assigned to backend-dev agent.
  2. backend-dev implements, posts a detailed comment, then assigns to reviewer.
  3. reviewer agent picks up the task — its task message must include backend-dev's comment.
  4. reviewer posts a review comment and marks the task done.

This tests the core information-flow contract: comments left by one agent
are visible in the task message received by the next agent.
"""
import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import graphait.config.loader as loader_mod


BACKEND_DEV_ID = "backend-dev"
REVIEWER_ID = "reviewer"


# ── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()
    # Shared project context visible to both agents
    (tmp_path / "config" / "context" / "project-overview.md").write_text(
        "## Project\n"
        "Graphait is a multi-agent task platform built with FastAPI and SQLAlchemy.\n\n"
        "## Tech Stack\n"
        "Backend: FastAPI, SQLAlchemy 2.x, SQLite\n"
        "Frontend: React 18, TypeScript\n\n"
        "## Key Conventions\n"
        "- All DB changes go through Alembic migrations\n"
        "- Conventional commits: feat:, fix:, chore:\n"
        "- Tests in tests/, run with: .venv/bin/python -m pytest tests/ -q\n"
    )


# ── agent configs ────────────────────────────────────────────────────────────

def make_backend_dev():
    from graphait.config.loader import AgentConfig
    return AgentConfig(
        id=BACKEND_DEV_ID, name="Backend Dev", role_title="Backend Developer",
        type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
        working_dir="/tmp/backend-dev", reports_to=REVIEWER_ID,
        schedule_interval=300, schedule_enabled=True,
        tools=["write_file", "read_file"],
        skills=[], context=["project-overview"],
        system_prompt=(
            "You are a backend developer. When you finish implementing a feature:\n"
            "1. Post a comment summarising what you did and which files changed.\n"
            "2. Assign the task to the reviewer using assign_task.\n"
            "3. Call update_status(in_review)."
        ),
    )


def make_reviewer():
    from graphait.config.loader import AgentConfig
    return AgentConfig(
        id=REVIEWER_ID, name="Tech Lead", role_title="Reviewer",
        type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
        working_dir="/tmp/reviewer", reports_to=None,
        schedule_interval=300, schedule_enabled=True,
        tools=["read_file"],
        skills=[], context=["project-overview"],
        system_prompt=(
            "You are a tech lead. Review the developer's work by reading the task comments, "
            "post a review comment, then call update_status(done)."
        ),
    )


def make_org():
    from graphait.config.loader import OrgConfig
    return OrgConfig(
        name="Test Org", system_prompt="Build quality software.",
        openrouter_api_key="sk-org", default_model="anthropic/claude-3-5-sonnet",
    )


def make_task(db):
    from graphait.models.organization import Organization
    from graphait.models.task import Task, TaskStatus, TaskPriority, TaskType
    org_id = uuid.uuid4()
    db.add(Organization(id=org_id, name="Test Org", slug=f"testorg-{uuid.uuid4().hex[:6]}"))
    db.flush()
    task = Task(
        id=uuid.uuid4(), org_id=org_id, number=1,
        title="Add rate limiting to POST /tasks",
        description=(
            "Implement simple rate limiting: max 10 requests per minute per user. "
            "Return HTTP 429 when limit exceeded."
        ),
        status=TaskStatus.todo, priority=TaskPriority.high,
        task_type=TaskType.task,
        creator_id=BACKEND_DEV_ID, assignee_id=BACKEND_DEV_ID,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ── mock helpers ─────────────────────────────────────────────────────────────

def api_response(content=None, tool_calls=None):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
        msg["content"] = None
    return {"choices": [{"message": msg}]}


def tc(name, args, call_id="call_1"):
    return {"id": call_id, "type": "function",
            "function": {"name": name, "arguments": json.dumps(args)}}


def make_sequence(*responses):
    idx = [0]
    async def fake_post(*a, **kw):
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = responses[min(idx[0], len(responses) - 1)]
        idx[0] += 1
        return r
    return fake_post


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reviewer_sees_developer_comment(db):
    """
    Core information-flow test.

    backend-dev posts a comment then assigns task to reviewer.
    reviewer's task message must include backend-dev's comment verbatim.
    """
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import Comment

    task = make_task(db)
    org = make_org()

    # ── Phase 1: backend-dev works on the task ──────────────────────────────
    #
    # Turn 1: post a detailed implementation comment
    # Turn 2: assign task to reviewer
    # Turn 3: mark in_review

    backend_responses = [
        api_response(tool_calls=[tc(
            "post_comment",
            {"content": (
                "Implemented rate limiting in graphait/middleware/rate_limit.py.\n"
                "Uses a sliding window counter (Redis-backed in prod, in-memory for tests).\n"
                "Returns HTTP 429 with Retry-After header when limit exceeded.\n"
                "Tests added in tests/test_rate_limit.py — all passing."
            )},
            "call_1",
        )]),
        api_response(tool_calls=[tc(
            "assign_task",
            {"task_id": str(task.id), "assignee_id": REVIEWER_ID},
            "call_2",
        )]),
        api_response(tool_calls=[tc(
            "update_status",
            {"status": "in_review"},
            "call_3",
        )]),
    ]

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = make_sequence(*backend_responses)
        await AgentLoop(make_backend_dev(), org, task, db).run()

    # Verify backend-dev's comment is in the DB
    db.refresh(task)
    comments = db.query(Comment).filter(
        Comment.task_id == task.id, Comment.is_system == False
    ).all()
    assert len(comments) >= 1
    dev_comment = comments[0].content
    assert "rate_limit.py" in dev_comment

    # Verify task was assigned to reviewer
    assert str(task.assignee_id) == REVIEWER_ID

    # ── Phase 2: reviewer picks up the task ────────────────────────────────
    #
    # Capture the messages sent to the LLM to verify task context is present.

    captured: dict = {}

    async def reviewer_post(*a, **kw):
        if "messages" not in captured:
            captured["messages"] = kw.get("json", {}).get("messages", [])
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = api_response(
            content="Reviewed. Implementation is correct. Rate limiting logic is clean."
        )
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = reviewer_post
        await AgentLoop(make_reviewer(), org, task, db).run()

    assert "messages" in captured, "Reviewer loop never called the API"
    user_msg = next(m["content"] for m in captured["messages"] if m["role"] == "user")
    system_msg = next(m["content"] for m in captured["messages"] if m["role"] == "system")

    # Core assertion: reviewer sees what developer wrote
    assert "rate_limit.py" in user_msg, (
        f"Reviewer did not see developer's comment.\nUser message:\n{user_msg}"
    )
    assert BACKEND_DEV_ID in user_msg, (
        "Reviewer's task message should show who posted the comment"
    )

    # Context doc was injected into both agents' system prompts
    assert "Graphait" in system_msg
    assert "FastAPI" in system_msg

    # Reviewer's working_dir was injected
    assert "Your working directory: /tmp/reviewer" in system_msg


@pytest.mark.asyncio
async def test_developer_can_create_followup_task_for_reviewer(db):
    """
    Developer uses create_task to spawn a dedicated review task for the reviewer,
    instead of reassigning the same task.
    """
    from graphait.modules.agent.loop import AgentLoop
    from graphait.models.task import Task

    task = make_task(db)
    org = make_org()

    backend_responses = [
        api_response(tool_calls=[tc(
            "post_comment",
            {"content": "Implementation done. Created a review task for the tech lead."},
            "call_1",
        )]),
        api_response(tool_calls=[tc(
            "create_task",
            {
                "title": "Review: rate limiting implementation",
                "description": (
                    "Please review the rate limiting feature implemented in "
                    "graphait/middleware/rate_limit.py. See task #1 comments for details."
                ),
                "assignee_id": REVIEWER_ID,
                "priority": "high",
            },
            "call_2",
        )]),
        api_response(tool_calls=[tc(
            "update_status", {"status": "done"}, "call_3"
        )]),
    ]

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = make_sequence(*backend_responses)
        await AgentLoop(make_backend_dev(), org, task, db).run()

    db.refresh(task)

    # A new task was created for the reviewer
    from graphait.models.organization import Organization
    org_record = db.query(Organization).first()
    all_tasks = db.query(Task).filter(Task.org_id == org_record.id).all()
    assert len(all_tasks) == 2

    review_task = next(t for t in all_tasks if t.id != task.id)
    assert "review" in review_task.title.lower()
    assert str(review_task.assignee_id) == REVIEWER_ID


@pytest.mark.asyncio
async def test_shared_context_doc_visible_to_all_agents(db):
    """
    Both agents share the project-overview context doc.
    Both system prompts must include it.
    """
    from graphait.modules.agent.loop import AgentLoop

    task = make_task(db)
    org = make_org()
    simple_response = api_response(content="Done.")

    dev_captured: dict = {}
    reviewer_captured: dict = {}

    async def dev_post(*a, **kw):
        dev_captured["messages"] = kw.get("json", {}).get("messages", [])
        r = MagicMock(); r.status_code = 200
        r.json.return_value = simple_response
        return r

    async def reviewer_post(*a, **kw):
        reviewer_captured["messages"] = kw.get("json", {}).get("messages", [])
        r = MagicMock(); r.status_code = 200
        r.json.return_value = simple_response
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = dev_post
        await AgentLoop(make_backend_dev(), org, task, db).run()

    # Reset task status so reviewer can run
    from graphait.models.task import TaskStatus
    task.status = TaskStatus.todo
    db.commit()

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = reviewer_post
        await AgentLoop(make_reviewer(), org, task, db).run()

    dev_sys = next(m["content"] for m in dev_captured["messages"] if m["role"] == "system")
    rev_sys = next(m["content"] for m in reviewer_captured["messages"] if m["role"] == "system")

    for sys_msg in [dev_sys, rev_sys]:
        assert "## Context: Project Overview" in sys_msg
        assert "FastAPI" in sys_msg
        assert "SQLAlchemy" in sys_msg

    # Each agent gets its own working_dir
    assert "/tmp/backend-dev" in dev_sys
    assert "/tmp/reviewer" in rev_sys
    assert "/tmp/backend-dev" not in rev_sys
