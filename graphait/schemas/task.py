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
    orchestrator_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[str] = None
    outcome: Optional[str] = None
    orchestrator_id: Optional[str] = None
    human_review_required: Optional[bool] = None
    orchestration_review_pending: Optional[bool] = None
    blocked_by_agent_id: Optional[str] = None


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
    sub_number: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    outcome: Optional[str] = None
    subtasks: list['TaskRead'] = []
    orchestrator_id: Optional[str] = None
    human_review_required: bool = False
    orchestration_review_pending: bool = False
    blocked_by_agent_id: Optional[str] = None

    model_config = {"from_attributes": True}

TaskRead.model_rebuild()
