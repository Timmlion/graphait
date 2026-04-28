from fastapi import APIRouter, Depends
from pydantic import BaseModel
from graphait.api.deps import get_current_user
from graphait.config.loader import load_agents
from graphait.models.user import User
from graphait.schemas.agent import AgentRead

router = APIRouter()


class GraphEdge(BaseModel):
    id: str
    from_agent_id: str
    to_agent_id: str
    type: str = "reports_to"


class GraphData(BaseModel):
    nodes: list[AgentRead]
    edges: list[GraphEdge]


@router.get("", response_model=GraphData)
def get_graph(_: User = Depends(get_current_user)):
    agents = load_agents()
    nodes = [AgentRead(**vars(a)) for a in agents]
    edges = [
        GraphEdge(
            id=f"{a.id}->reports_to->{a.reports_to}",
            from_agent_id=a.id,
            to_agent_id=a.reports_to,
            type="reports_to",
        )
        for a in agents
        if a.reports_to
    ]
    return GraphData(nodes=nodes, edges=edges)
