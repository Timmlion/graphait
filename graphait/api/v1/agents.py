import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.modules.agents.service import agent_service
from graphait.schemas.agent import AgentCreate, AgentUpdate, AgentRead

router = APIRouter()


def _get_agent_or_404(agent_id: uuid.UUID, current_user: User, db: Session):
    agent = agent_service.get(db, agent_id, current_user.org_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
def create_agent(body: AgentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return agent_service.create(db, current_user.org_id, body)


@router.get("", response_model=list[AgentRead])
def list_agents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return agent_service.list(db, current_user.org_id)


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(agent_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_agent_or_404(agent_id, current_user, db)


@router.patch("/{agent_id}", response_model=AgentRead)
def update_agent(agent_id: uuid.UUID, body: AgentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = _get_agent_or_404(agent_id, current_user, db)
    return agent_service.update(db, agent, body)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = _get_agent_or_404(agent_id, current_user, db)
    agent_service.delete(db, agent)
