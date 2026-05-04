import logging
from sqlalchemy.orm import Session
from graphait.models.task import Task, Comment, TaskStatus

logger = logging.getLogger(__name__)


class TaskBlockingService:

    def on_run_closed(self, db: Session, task: Task, agent_id: str) -> None:
        """Called when an agent's run closes. If agent_id is the asked agent
        (not the original), return the task to the original agent."""
        db.refresh(task)
        orig = task.blocked_by_agent_id
        if not orig:
            return
        if agent_id == orig:
            # Original agent's run closing (after ask_agent) — not a return signal
            return
        responder = task.assignee_id
        task.blocked_by_agent_id = None
        task.assignee_id = orig
        task.status = TaskStatus.in_progress
        db.add(Comment(
            task_id=task.id,
            author_id="system",
            content=f"Answer received from @{responder}. Returning task to @{orig}.",
            is_system=True,
        ))
        db.commit()
        _trigger(orig)

    def on_comment_added(self, db: Session, task: Task, commenter_agent_id: str) -> bool:
        """Called when a human posts a comment via the HTTP endpoint.
        Returns True if the unblock was triggered (caller should skip normal trigger)."""
        if not task.blocked_by_agent_id:
            return False
        if commenter_agent_id != task.assignee_id:
            return False
        orig = task.blocked_by_agent_id
        task.blocked_by_agent_id = None
        task.assignee_id = orig
        task.status = TaskStatus.in_progress
        db.add(Comment(
            task_id=task.id,
            author_id="system",
            content=f"Answer received from @{commenter_agent_id}. Returning task to @{orig}.",
            is_system=True,
        ))
        db.commit()
        _trigger(orig)
        return True


def _trigger(agent_id: str) -> None:
    try:
        from graphait.modules.scheduler.service import scheduler_service
        if hasattr(scheduler_service, "trigger_agent"):
            scheduler_service.trigger_agent(agent_id)
    except Exception as exc:
        logger.warning("Failed to trigger agent %s: %s", agent_id, exc)


blocking_service = TaskBlockingService()
