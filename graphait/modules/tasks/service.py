import uuid
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from graphait.models.task import Task
from graphait.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    def _next_number(self, db: Session, org_id: uuid.UUID) -> int:
        result = db.query(func.max(Task.number)).filter(Task.org_id == org_id).scalar()
        return (result or 0) + 1

    def _next_sub_number(self, db: Session, parent_task_id: uuid.UUID) -> int:
        result = db.query(func.max(Task.sub_number)).filter(Task.parent_task_id == parent_task_id).scalar()
        return (result or 0) + 1

    def create(self, db: Session, org_id: uuid.UUID, creator_id: str, data: TaskCreate) -> Task:
        sub_number = (
            self._next_sub_number(db, data.parent_task_id) if data.parent_task_id else None
        )
        task_data = data.model_dump()
        if not task_data.get('orchestrator_id'):
            task_data['orchestrator_id'] = creator_id
        task = Task(
            org_id=org_id,
            creator_id=creator_id,
            number=self._next_number(db, org_id),
            sub_number=sub_number,
            **task_data,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def get(self, db: Session, task_id: uuid.UUID, org_id: uuid.UUID) -> Optional[Task]:
        return (
            db.query(Task)
            .options(joinedload(Task.subtasks))
            .filter(Task.id == task_id, Task.org_id == org_id)
            .first()
        )

    def list(self, db: Session, org_id: uuid.UUID, assignee_id: Optional[str] = None) -> list[Task]:
        q = db.query(Task).options(joinedload(Task.subtasks)).filter(Task.org_id == org_id)
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
