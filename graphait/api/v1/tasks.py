import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.agent import Agent
from graphait.models.user import User
from graphait.modules.tasks.service import task_service
from graphait.schemas.task import TaskCreate, TaskUpdate, TaskRead
from graphait.modules.tasks.comment_service import comment_service
from graphait.schemas.comment import CommentCreate, CommentRead

router = APIRouter()


def _require_agent_id(user: User, db: Session) -> uuid.UUID:
    agent = db.query(Agent).filter(Agent.user_id == user.id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no linked agent — create a human agent first",
        )
    return agent.id


def _get_task_or_404(task_id: uuid.UUID, user: User, db: Session):
    task = task_service.get(db, task_id, user.org_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    creator_id = _require_agent_id(current_user, db)
    return task_service.create(db, current_user.org_id, creator_id, body)


@router.get("", response_model=list[TaskRead])
def list_tasks(
    assignee_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return task_service.list(db, current_user.org_id, assignee_id)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_task_or_404(task_id, current_user, db)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    return task_service.update(db, task, body)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    task_service.delete(db, task)


@router.get("/{task_id}/comments", response_model=list[CommentRead])
def list_comments(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    return comment_service.list(db, task_id)


@router.post("/{task_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(task_id: uuid.UUID, body: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    author_id = _require_agent_id(current_user, db)
    return comment_service.create(db, task_id, author_id, body)
