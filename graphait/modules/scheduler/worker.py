import asyncio
import logging
from graphait.database import SessionLocal
from graphait.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


async def run_agent_tick(agent_id: str) -> None:
    from graphait.config.loader import load_agent, load_org
    from graphait.modules.agent.loop import AgentLoop
    from graphait.modules.scheduler.service import scheduler_service

    logger.info("agent=%s wake-up triggered", agent_id)

    agent_cfg = load_agent(agent_id)
    if not agent_cfg:
        logger.warning("agent=%s config not found — skipping", agent_id)
        return
    if agent_cfg.type != "ai":
        logger.debug("agent=%s type=%s is not ai — skipping", agent_id, agent_cfg.type)
        return

    with SessionLocal() as db:
        from sqlalchemy.orm import joinedload
        task = (
            db.query(Task)
            .options(joinedload(Task.subtasks))
            .filter(
                Task.assignee_id == agent_id,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
            )
            .order_by(Task.created_at)
            .first()
        )
        if not task:
            logger.info("agent=%s no actionable tasks found — going back to sleep", agent_id)
            return

        logger.info("agent=%s picked up task #%s (id=%s status=%s)",
                    agent_id, task.number, task.id, task.status.value)
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
            logger.info("agent=%s task #%s run complete", agent_id, task.number)
        except Exception as e:
            logger.error("AgentLoop error (agent=%s task=%s): %s", agent_id, task.id, e)
