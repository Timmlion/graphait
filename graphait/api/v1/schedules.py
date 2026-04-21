import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.agent import AgentType
from graphait.models.user import User
from graphait.models.schedule import AgentSchedule
from graphait.modules.agents.service import agent_service

router = APIRouter()


class ScheduleCreate(BaseModel):
    agent_id: uuid.UUID
    interval_seconds: int = 300


class ScheduleUpdate(BaseModel):
    interval_seconds: Optional[int] = None
    is_enabled: Optional[bool] = None


class ScheduleRead(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    interval_seconds: int
    is_enabled: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = agent_service.get(db, body.agent_id, current_user.org_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if agent.type != AgentType.ai:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Schedules only for AI agents")
    if agent.schedule:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Schedule already exists")
    schedule = AgentSchedule(agent_id=body.agent_id, interval_seconds=body.interval_seconds)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}", response_model=ScheduleRead)
def update_schedule(schedule_id: uuid.UUID, body: ScheduleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = db.query(AgentSchedule).join(
        AgentSchedule.agent
    ).filter(AgentSchedule.id == schedule_id, AgentSchedule.agent.has(org_id=current_user.org_id)).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    return schedule
