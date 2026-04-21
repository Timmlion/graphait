import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from graphait.connectors.opencode.connector import OpenCodeConnector
from graphait.connectors.base import AgentContext


def make_context():
    return AgentContext(
        agent_id=uuid.uuid4(),
        agent_name="Code Bot",
        role_title="Developer",
        system_prompt="Write code.",
        authority_scope={},
        tasks=[{"id": str(uuid.uuid4()), "title": "Implement login", "status": "todo", "comments": []}],
        subordinate_names=[],
        supervisor_name="CTO",
    )


async def test_opencode_connector_parses_actions():
    connector = OpenCodeConnector()
    config = {"binary": "opencode", "model": "anthropic/claude-3-5-sonnet"}

    fake_stdout = json.dumps({"actions": [
        {"type": "update_status", "payload": {"task_id": "abc", "status": "in_progress"}}
    ]}).encode()

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.communicate = AsyncMock(return_value=(fake_stdout, b""))

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_proc):
        with patch("asyncio.wait_for", new_callable=AsyncMock, return_value=(fake_stdout, b"")):
            actions = await connector.run(make_context(), config)

    assert len(actions) == 1
    assert actions[0].type == "update_status"


async def test_opencode_connector_raises_on_nonzero_exit():
    connector = OpenCodeConnector()
    config = {"binary": "opencode"}

    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.communicate = AsyncMock(return_value=(b"", b"error message"))

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_proc):
        with patch("asyncio.wait_for", new_callable=AsyncMock, return_value=(b"", b"error message")):
            import pytest
            with pytest.raises(RuntimeError, match="OpenCode exited 1"):
                await connector.run(make_context(), config)
