import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from graphait.modules.scheduler.worker import run_agent_tick, _execute_action
from graphait.connectors.base import Action


async def test_run_agent_tick_skips_human_agents(db):
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent, AgentType

    org = Organization(name="Test", slug=f"test-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    human_agent = Agent(org_id=org.id, name="Bob", role_title="PM", type=AgentType.human)
    db.add(human_agent)
    db.commit()

    with patch("graphait.modules.scheduler.worker.CONNECTOR_MAP") as mock_map:
        with patch("graphait.modules.scheduler.worker.SessionLocal", return_value=db):
            await run_agent_tick(human_agent.id)
        mock_map.__getitem__.assert_not_called()


async def test_run_agent_tick_calls_connector(db):
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent, AgentType
    from graphait.models.schedule import AgentSchedule

    org = Organization(name="ConnOrg", slug=f"connorg-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    agent = Agent(
        org_id=org.id, name="Bot", role_title="Dev",
        type=AgentType.ai, connector_type="http",
        connector_config={"api_key": "test-key", "api_url": "https://fake.api/v1"}
    )
    db.add(agent)
    db.flush()
    schedule = AgentSchedule(agent_id=agent.id)
    db.add(schedule)
    db.commit()

    mock_connector = AsyncMock()
    mock_connector.run.return_value = []

    with patch("graphait.modules.scheduler.worker.CONNECTOR_MAP", {"http": mock_connector}):
        with patch("graphait.modules.scheduler.worker.SessionLocal", return_value=db):
            await run_agent_tick(agent.id)

    mock_connector.run.assert_called_once()
