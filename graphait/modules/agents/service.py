from typing import Optional
import uuid
from sqlalchemy.orm import Session
from graphait.models.agent import Agent
from graphait.schemas.agent import AgentCreate, AgentUpdate


class AgentService:
    def create(self, db: Session, org_id: uuid.UUID, data: AgentCreate) -> Agent:
        agent = Agent(org_id=org_id, **data.model_dump())
        db.add(agent)
        db.commit()
        db.refresh(agent)
        return agent

    def get(self, db: Session, agent_id: uuid.UUID, org_id: uuid.UUID) -> Optional[Agent]:
        return db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == org_id).first()

    def list(self, db: Session, org_id: uuid.UUID) -> list[Agent]:
        return db.query(Agent).filter(Agent.org_id == org_id).all()

    def update(self, db: Session, agent: Agent, data: AgentUpdate) -> Agent:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(agent, field, value)
        db.commit()
        db.refresh(agent)
        return agent

    def delete(self, db: Session, agent: Agent) -> None:
        db.delete(agent)
        db.commit()


agent_service = AgentService()
