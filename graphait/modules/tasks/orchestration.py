import logging
from sqlalchemy.orm import Session
from graphait.models.task import Task, Comment, TaskStatus

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {TaskStatus.done, TaskStatus.cancelled}


class TaskOrchestrationService:

    def on_subtask_closed(self, db: Session, task: Task) -> None:
        parent = db.query(Task).filter(Task.id == task.parent_task_id).first()
        if not parent:
            return

        # system comment on parent
        label = task.sub_number if task.sub_number is not None else task.number
        db.add(Comment(
            task_id=parent.id,
            author_id="system",
            content=f"Subtask #{parent.number}.{label} '{task.title}' marked {task.status.value}.",
            is_system=True,
        ))
        db.commit()

        # check siblings
        siblings = db.query(Task).filter(Task.parent_task_id == parent.id).all()
        if not all(s.status in TERMINAL_STATUSES for s in siblings):
            return

        # all resolved — human review or auto-trigger
        orchestrator_id = parent.orchestrator_id or parent.creator_id
        if not orchestrator_id:
            return

        if parent.human_review_required:
            parent.orchestration_review_pending = True
            db.commit()
        else:
            db.add(Comment(
                task_id=parent.id,
                author_id="system",
                content=(
                    "All subtasks complete. Reassigning to orchestrator for review. "
                    "Review outcomes and decide: close this task with a summary outcome, "
                    "or create new subtasks for follow-up work."
                ),
                is_system=True,
            ))
            parent.assignee_id = orchestrator_id
            if parent.status not in {TaskStatus.todo, TaskStatus.in_progress}:
                parent.status = TaskStatus.in_progress
            db.commit()
            db.refresh(parent)
            _trigger(orchestrator_id)


def _trigger(agent_id: str) -> None:
    try:
        from graphait.modules.scheduler.service import scheduler_service
        if hasattr(scheduler_service, "trigger_agent"):
            scheduler_service.trigger_agent(agent_id)
    except Exception as exc:
        logger.warning("Failed to trigger agent %s: %s", agent_id, exc)


orchestration_service = TaskOrchestrationService()
