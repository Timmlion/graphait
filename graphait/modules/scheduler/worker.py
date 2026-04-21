import uuid
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from graphait.database import SessionLocal
from graphait.models.agent import Agent, AgentRelationship, RelationshipType, AgentType
from graphait.models.task import Task, TaskStatus, Comment
from graphait.connectors.base import AgentContext, Action
from graphait.connectors.http.connector import HTTPConnector
from graphait.connectors.opencode.connector import OpenCodeConnector
from graphait.modules.tasks.service import task_service
from graphait.modules.tasks.comment_service import comment_service
from graphait.schemas.task import TaskCreate, TaskUpdate
from graphait.schemas.comment import CommentCreate

logger = logging.getLogger(__name__)

CONNECTOR_MAP = {
    "http": HTTPConnector(),
    "opencode": OpenCodeConnector(),
}


def _build_context(db: Session, agent: Agent) -> AgentContext:
    tasks_q = db.query(Task).filter(
        Task.assignee_id == agent.id,
        Task.status.in_([TaskStatus.todo, TaskStatus.in_progress, TaskStatus.waiting_approval]),
    ).all()

    tasks_data = []
    for t in tasks_q:
        comments = db.query(Comment).filter(Comment.task_id == t.id).order_by(Comment.created_at).all()
        tasks_data.append({
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status.value,
            "priority": t.priority.value,
            "comments": [{"author": str(c.author_id), "content": c.content} for c in comments],
        })

    supervisor_rel = db.query(AgentRelationship).filter(
        AgentRelationship.from_agent_id == agent.id,
        AgentRelationship.type == RelationshipType.reports_to,
    ).first()
    supervisor_name = None
    if supervisor_rel:
        sup = db.get(Agent, supervisor_rel.to_agent_id)
        supervisor_name = sup.name if sup else None

    sub_rels = db.query(AgentRelationship).filter(
        AgentRelationship.to_agent_id == agent.id,
        AgentRelationship.type == RelationshipType.reports_to,
    ).all()
    subordinate_names = []
    for rel in sub_rels:
        sub = db.get(Agent, rel.from_agent_id)
        if sub:
            subordinate_names.append(sub.name)

    return AgentContext(
        agent_id=agent.id,
        agent_name=agent.name,
        role_title=agent.role_title,
        system_prompt=agent.system_prompt,
        authority_scope=agent.authority_scope,
        tasks=tasks_data,
        subordinate_names=subordinate_names,
        supervisor_name=supervisor_name,
    )


async def _execute_action(db: Session, agent: Agent, action: Action) -> None:
    try:
        if action.type == "comment":
            task = task_service.get(db, uuid.UUID(action.payload["task_id"]), agent.org_id)
            if task:
                comment_service.create(db, task.id, agent.id, CommentCreate(content=action.payload["content"]))

        elif action.type == "update_status":
            task = task_service.get(db, uuid.UUID(action.payload["task_id"]), agent.org_id)
            if task:
                task_service.update(db, task, TaskUpdate(status=action.payload["status"]))

        elif action.type == "create_task":
            task_service.create(db, agent.org_id, agent.id, TaskCreate(
                title=action.payload["title"],
                description=action.payload.get("description"),
                assignee_id=uuid.UUID(action.payload["assignee_id"]) if action.payload.get("assignee_id") else None,
            ))

        elif action.type == "escalate":
            rel = db.query(AgentRelationship).filter(
                AgentRelationship.from_agent_id == agent.id,
                AgentRelationship.type == RelationshipType.reports_to,
            ).first()
            if rel:
                task_service.create(db, agent.org_id, agent.id, TaskCreate(
                    title=f"[ESCALATION] from {agent.name}",
                    description=action.payload.get("message", ""),
                    assignee_id=rel.to_agent_id,
                    task_type="approval_request",
                ))
    except Exception as e:
        logger.error("Failed to execute action %s: %s", action.type, e)


async def run_agent_tick(agent_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        agent = db.get(Agent, agent_id)
        if not agent or not agent.is_active or agent.type != AgentType.ai:
            return
        if not agent.connector_type or agent.connector_type not in CONNECTOR_MAP:
            logger.warning("Agent %s has no valid connector", agent_id)
            return

        context = _build_context(db, agent)
        connector = CONNECTOR_MAP[agent.connector_type]
        actions = await connector.run(context, agent.connector_config or {})

        for action in actions:
            await _execute_action(db, agent, action)

        schedule = agent.schedule
        if schedule:
            schedule.last_run_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
