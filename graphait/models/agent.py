from __future__ import annotations
import uuid
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Boolean, Text, UniqueConstraint, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.organization import Organization
    from graphait.models.user import User
    from graphait.models.task import Task
    from graphait.models.schedule import AgentSchedule


class AgentType(str, enum.Enum):
    human = "human"
    ai = "ai"


class RelationshipType(str, enum.Enum):
    reports_to = "reports_to"
    collaborates_with = "collaborates_with"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), nullable=True)  # FK added in M3
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_title: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AgentType] = mapped_column(Enum(AgentType), nullable=False)
    connector_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    connector_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    authority_scope: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship("Organization", back_populates="agents")
    user: Mapped[Optional[User]] = relationship("User", back_populates="agent")
    schedule: Mapped[Optional[AgentSchedule]] = relationship("AgentSchedule", back_populates="agent", uselist=False)

    outgoing_relationships: Mapped[list[AgentRelationship]] = relationship(
        "AgentRelationship", foreign_keys="AgentRelationship.from_agent_id", back_populates="from_agent"
    )
    incoming_relationships: Mapped[list[AgentRelationship]] = relationship(
        "AgentRelationship", foreign_keys="AgentRelationship.to_agent_id", back_populates="to_agent"
    )


class AgentRelationship(Base):
    __tablename__ = "agent_relationships"
    __table_args__ = (UniqueConstraint("from_agent_id", "to_agent_id", "type"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    to_agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[RelationshipType] = mapped_column(Enum(RelationshipType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    from_agent: Mapped[Agent] = relationship("Agent", foreign_keys=[from_agent_id], back_populates="outgoing_relationships")
    to_agent: Mapped[Agent] = relationship("Agent", foreign_keys=[to_agent_id], back_populates="incoming_relationships")
