import uuid
from typing import Optional
from pydantic import BaseModel
from graphait.models.agent import AgentType


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
    system_prompt: Optional[str]
    authority_scope: Optional[dict]
    is_active: bool

    model_config = {"from_attributes": True}
