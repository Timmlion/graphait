import uuid
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from graphait.models.task import Task
from graphait.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    def _next_number(self, db: Session, org_id: uuid.UUID) -> int:
        result = db.query(func.max(Task.number)).filter(Task.org_id == org_id).scalar()
        return (result or 0) + 1

    def create(self, db: Session, org_id: uuid.UUID, creator_id: uuid.UUID, data: TaskCreate) -> Task:
        task = Task(
            org_id=org_id,
            creator_id=creator_id,
            number=self._next_number(db, org_id),
            **data.model_dump(),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def get(self, db: Session, task_id: uuid.UUID, org_id: uuid.UUID) -> Optional[Task]:
        return db.query(Task).filter(Task.id == task_id, Task.org_id == org_id).first()

    def list(self, db: Session, org_id: uuid.UUID, assignee_id: Optional[uuid.UUID] = None) -> list[Task]:
        q = db.query(Task).filter(Task.org_id == org_id)
        if assignee_id:
            q = q.filter(Task.assignee_id == assignee_id)
        return q.order_by(Task.created_at.desc()).all()

    def update(self, db: Session, task: Task, data: TaskUpdate) -> Task:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(task, field, value)
        db.commit()
        db.refresh(task)
        return task

    def delete(self, db: Session, task: Task) -> None:
        db.delete(task)
        db.commit()


task_service = TaskService()
