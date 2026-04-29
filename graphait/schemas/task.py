import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from graphait.models.task import TaskStatus, TaskPriority, TaskType


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    task_type: TaskType = TaskType.task
    assignee_id: Optional[str] = None
    parent_task_id: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[str] = None
    outcome: Optional[str] = None


class TaskRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    number: Optional[int]
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    task_type: TaskType
    assignee_id: Optional[str]
    creator_id: Optional[str]
    parent_task_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    outcome: Optional[str] = None
    subtasks: list['TaskRead'] = []

    model_config = {"from_attributes": True}

TaskRead.model_rebuild()
