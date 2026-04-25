from __future__ import annotations
import uuid
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Boolean, Text, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.agent import Agent


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"
    cancelled = "cancelled"
    waiting_approval = "waiting_approval"
    approved = "approved"
    rejected = "rejected"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskType(str, enum.Enum):
    task = "task"
    approval_request = "approval_request"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("org_id", "number", name="uq_tasks_org_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), nullable=False, default=TaskStatus.todo)
    priority: Mapped[TaskPriority] = mapped_column(Enum(TaskPriority), nullable=False, default=TaskPriority.medium)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), nullable=False, default=TaskType.task)
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    creator_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assignee: Mapped[Optional[Agent]] = relationship("Agent", foreign_keys=[assignee_id])
    creator: Mapped[Agent] = relationship("Agent", foreign_keys=[creator_id])
    subtasks: Mapped[list[Task]] = relationship("Task", foreign_keys=[parent_task_id])
    comments: Mapped[list[Comment]] = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    attachments: Mapped[list[Attachment]] = relationship("Attachment", back_populates="task", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="comments")
    author: Mapped[Agent] = relationship("Agent")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    comment_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="attachments")
