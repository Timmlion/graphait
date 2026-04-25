from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
import enum
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.member)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship("Organization", back_populates="users")
    agent: Mapped[Optional[Agent]] = relationship("Agent", back_populates="user", uselist=False)
