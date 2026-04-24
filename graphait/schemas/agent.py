import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from graphait.models.agent import AgentType


class ScheduleRead(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    interval_seconds: int
    is_enabled: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str
    role_title: str
    type: AgentType
    connector_type: Optional[str] = None
    connector_config: Optional[dict] = None
    system_prompt: Optional[str] = None
    authority_scope: Optional[dict] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    connector_type: Optional[str] = None
    connector_config: Optional[dict] = None
    system_prompt: Optional[str] = None
    authority_scope: Optional[dict] = None
    is_active: Optional[bool] = None


class AgentRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    role_title: str
    type: AgentType
    connector_type: Optional[str]
    connector_config: Optional[dict]
    system_prompt: Optional[str]
    authority_scope: Optional[dict]
    is_active: bool
    created_at: datetime
    schedule: Optional[ScheduleRead] = None

    model_config = {"from_attributes": True}
