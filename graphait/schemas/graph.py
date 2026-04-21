import uuid
from pydantic import BaseModel
from graphait.models.agent import RelationshipType, AgentType


class RelationshipCreate(BaseModel):
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType


class RelationshipRead(BaseModel):
    id: uuid.UUID
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType

    model_config = {"from_attributes": True}


class GraphNode(BaseModel):
    id: uuid.UUID
    name: str
    role_title: str
    type: AgentType
    is_active: bool

    model_config = {"from_attributes": True}


class GraphEdge(BaseModel):
    id: uuid.UUID
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType

    model_config = {"from_attributes": True}


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
