import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.models.run import AgentRun, RunEvent
from graphait.models.task import Task
from graphait.schemas.run import AgentRunRead, RunEventRead

router = APIRouter()


def _to_run_read(run: AgentRun, task: Task | None) -> AgentRunRead:
    duration = None
    if run.finished_at and run.started_at:
        started = run.started_at.replace(tzinfo=None) if run.started_at.tzinfo else run.started_at
        finished = run.finished_at.replace(tzinfo=None) if run.finished_at.tzinfo else run.finished_at
        duration = (finished - started).total_seconds()
    return AgentRunRead(
        id=str(run.id),
        agent_id=run.agent_id,
        task_id=str(run.task_id),
        task_title=task.title if task else "(deleted)",
        task_number=task.number if task else None,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status.value,
        duration_seconds=duration,
    )


@router.get("", response_model=list[AgentRunRead])
def list_runs(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from sqlalchemy import case
    runs = (db.query(AgentRun)
              .order_by(
                  case(
                      (AgentRun.status == "running", 0),
                      else_=1,
                  ).asc(),
                  AgentRun.started_at.desc(),
              )
              .limit(50)
              .all())
    result = []
    for run in runs:
        task = db.query(Task).filter(Task.id == run.task_id).first()
        result.append(_to_run_read(run, task))
    return result


@router.get("/{run_id}/events", response_model=list[RunEventRead])
def list_run_events(run_id: uuid.UUID, db: Session = Depends(get_db),
                    _: User = Depends(get_current_user)):
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    events = (db.query(RunEvent)
                .filter(RunEvent.run_id == run_id)
                .order_by(RunEvent.created_at.asc())
                .all())
    return [
        RunEventRead(
            id=str(e.id),
            run_id=str(e.run_id),
            created_at=e.created_at,
            role=e.role.value,
            content=e.content,
            tool_name=e.tool_name,
        )
        for e in events
    ]
