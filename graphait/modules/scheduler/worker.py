import asyncio
import logging
from graphait.database import SessionLocal
from graphait.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


async def run_agent_tick(agent_id: str) -> None:
    from graphait.config.loader import load_agent, load_org
    from graphait.modules.agent.loop import AgentLoop
    from graphait.modules.scheduler.service import scheduler_service

    agent_cfg = load_agent(agent_id)
    if not agent_cfg or agent_cfg.type != "ai":
        return

    with SessionLocal() as db:
        task = (
            db.query(Task)
            .filter(
                Task.assignee_id == agent_id,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
            )
            .order_by(Task.created_at)
            .first()
        )
        if not task:
            return

        org_cfg = load_org()
        loop = AgentLoop(
            agent=agent_cfg,
            org=org_cfg,
            task=task,
            db=db,
            scheduler_trigger=scheduler_service.trigger_agent,
        )
        try:
            await loop.run()
        except Exception as e:
            logger.error("AgentLoop error (agent=%s task=%s): %s", agent_id, task.id, e)
