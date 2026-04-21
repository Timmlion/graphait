import uuid
from sqlalchemy.orm import Session
from graphait.models.agent import Agent, AgentRelationship
from graphait.schemas.graph import RelationshipCreate, GraphData, GraphNode, GraphEdge


class GraphService:
    def create_relationship(self, db: Session, org_id: uuid.UUID, data: RelationshipCreate) -> AgentRelationship:
        from_agent = db.query(Agent).filter(Agent.id == data.from_agent_id, Agent.org_id == org_id).first()
        to_agent = db.query(Agent).filter(Agent.id == data.to_agent_id, Agent.org_id == org_id).first()
        if not from_agent or not to_agent:
            raise ValueError("One or both agents not found in this org")
        rel = AgentRelationship(from_agent_id=data.from_agent_id, to_agent_id=data.to_agent_id, type=data.type)
        db.add(rel)
        db.commit()
        db.refresh(rel)
        return rel

    def delete_relationship(self, db: Session, rel_id: uuid.UUID, org_id: uuid.UUID) -> bool:
        rel = db.query(AgentRelationship).join(
            Agent, AgentRelationship.from_agent_id == Agent.id
        ).filter(AgentRelationship.id == rel_id, Agent.org_id == org_id).first()
        if not rel:
            return False
        db.delete(rel)
        db.commit()
        return True

    def get_graph_data(self, db: Session, org_id: uuid.UUID) -> GraphData:
        agents = db.query(Agent).filter(Agent.org_id == org_id).all()
        agent_ids = {a.id for a in agents}
        rels = db.query(AgentRelationship).filter(
            AgentRelationship.from_agent_id.in_(agent_ids)
        ).all()
        nodes = [GraphNode(id=a.id, name=a.name, role_title=a.role_title, type=a.type, is_active=a.is_active) for a in agents]
        edges = [GraphEdge(id=r.id, from_agent_id=r.from_agent_id, to_agent_id=r.to_agent_id, type=r.type) for r in rels]
        return GraphData(nodes=nodes, edges=edges)


graph_service = GraphService()
