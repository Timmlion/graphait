import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ──────────────────────────────────────────────────────────────────

def make_agent():
    from graphait.config.loader import AgentConfig
    return AgentConfig(id="test-dev", name="Test Dev", role_title="Developer",
                       type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
                       working_dir="/tmp/test-dev-loop", reports_to=None,
                       schedule_interval=300, schedule_enabled=True,
                       tools=["read_file"], skills=[], system_prompt="You are a dev.")


def make_org():
    from graphait.config.loader import OrgConfig
    return OrgConfig(name="Acme", system_prompt="Build quality software.",
                     openrouter_api_key="sk-org", default_model="anthropic/claude-3-5-sonnet")


def _seed_db(db):
    """Create the minimum DB rows required to satisfy FK constraints."""
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent, AgentType

    org_id = uuid.uuid4()
    agent_uuid = uuid.uuid4()

    org = Organization(id=org_id, name="Acme", slug="acme")
    db.add(org)
    db.flush()

    agent = Agent(id=agent_uuid, org_id=org_id, name="Test Dev",
                  role_title="Developer", type=AgentType.ai)
    db.add(agent)
    db.flush()

    return org_id, agent_uuid


def make_task(db):
    from graphait.models.task import Task, TaskStatus, TaskPriority

    org_id, agent_uuid = _seed_db(db)

    task = Task(id=uuid.uuid4(), org_id=org_id, number=1, title="Write tests",
                description="Add unit tests.", status=TaskStatus.todo,
                priority=TaskPriority.high, creator_id=agent_uuid,
                assignee_id=agent_uuid)
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
    task = make_task(db)
    # The response object is NOT async — only client.post() is awaited.
    # Use MagicMock for the response so raise_for_status() stays synchronous.
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


@pytest.mark.asyncio
async def test_loop_executes_tool_then_completes(db):
    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)

    # Tool call uses post_comment which writes a Comment — author_id must be a
    # valid agent UUID in the DB.  We retrieve the agent_uuid we just seeded.
    from graphait.models.agent import Agent
    agent_db = db.query(Agent).first()
    agent_cfg = make_agent()
    # Patch agent config id to match the seeded UUID so FK is satisfied
    agent_cfg_patched = agent_cfg.__class__(
        **{**agent_cfg.__dict__,
           "id": str(agent_db.id)})

    tool_call = {"id": "call_1", "type": "function",
                 "function": {"name": "post_comment",
                              "arguments": json.dumps({"content": "Working on it."})}}
    responses = [mock_response(tool_calls=[tool_call]), mock_response(content="All done.")]
    idx = [0]

    async def fake_post(*a, **kw):
        # Return a plain MagicMock so raise_for_status() stays synchronous.
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = responses[min(idx[0], len(responses) - 1)]
        idx[0] += 1
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = fake_post
        await AgentLoop(agent_cfg_patched, make_org(), task, db).run()

    db.refresh(task)
    assert task.status.value == "done"
    from graphait.models.task import Comment
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert any("Working on it." in c.content for c in comments)
