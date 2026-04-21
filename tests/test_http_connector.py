import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from graphait.connectors.http.connector import HTTPConnector
from graphait.connectors.base import AgentContext


def make_context():
    return AgentContext(
        agent_id=uuid.uuid4(),
        agent_name="Dev Bot",
        role_title="Developer",
        system_prompt="You fix bugs.",
        authority_scope={"create_tasks": True},
        tasks=[{"id": str(uuid.uuid4()), "title": "Fix login bug", "status": "todo", "comments": []}],
        subordinate_names=[],
        supervisor_name="CTO",
    )


async def test_http_connector_parses_actions():
    connector = HTTPConnector()
    config = {"api_url": "https://fake.api/v1", "api_key": "test", "model": "test-model"}
    fake_response = {
        "choices": [{"message": {"content": json.dumps({
            "actions": [
                {"type": "comment", "payload": {"task_id": "abc", "content": "Working on it"}}
            ]
        })}}]
    }
    with patch("graphait.connectors.http.connector.httpx.AsyncClient") as MockClient:
        mock_response = MagicMock()
        mock_response.json.return_value = fake_response
        mock_response.raise_for_status = MagicMock()
        mock_instance = AsyncMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
        actions = await connector.run(make_context(), config)

    assert len(actions) == 1
    assert actions[0].type == "comment"
    assert actions[0].payload["content"] == "Working on it"


async def test_http_connector_handles_empty_actions():
    connector = HTTPConnector()
    config = {"api_url": "https://fake.api/v1", "api_key": "test", "model": "test-model"}
    fake_response = {"choices": [{"message": {"content": json.dumps({"actions": []})}}]}
    with patch("graphait.connectors.http.connector.httpx.AsyncClient") as MockClient:
        mock_response = MagicMock()
        mock_response.json.return_value = fake_response
        mock_response.raise_for_status = MagicMock()
        mock_instance = AsyncMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
        actions = await connector.run(make_context(), config)

    assert actions == []
