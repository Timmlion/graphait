from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.api.deps import get_current_user
from graphait.config.loader import AgentConfig, load_agent, load_agents, save_agent, delete_agent
from graphait.database import get_db
from graphait.models.user import User
from graphait.modules.scheduler.service import scheduler_service
from graphait.schemas.agent import AgentCreate, AgentUpdate, AgentRead

router = APIRouter()


def _get_or_404(agent_id: str) -> AgentConfig:
    cfg = load_agent(agent_id)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return cfg


@router.get("", response_model=list[AgentRead])
def list_agents(_: User = Depends(get_current_user)):
    return [AgentRead(**vars(a)) for a in load_agents()]


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
def create_agent(body: AgentCreate, _: User = Depends(get_current_user)):
    if load_agent(body.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Agent '{body.id}' already exists")
    cfg = AgentConfig(**body.model_dump())
    save_agent(cfg)
    if cfg.type == "ai" and cfg.schedule_enabled:
        try:
            scheduler_service.schedule_agent(cfg.id, cfg.schedule_interval)
        except Exception:
            pass  # Scheduler will be properly wired in Task 11
    return AgentRead(**vars(cfg))


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(agent_id: str, _: User = Depends(get_current_user)):
    return AgentRead(**vars(_get_or_404(agent_id)))


@router.patch("/{agent_id}", response_model=AgentRead)
def update_agent(agent_id: str, body: AgentUpdate, _: User = Depends(get_current_user)):
    cfg = _get_or_404(agent_id)
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(cfg, k, v)
    save_agent(cfg)
    if cfg.type == "ai":
        if cfg.schedule_enabled:
            try:
                scheduler_service.schedule_agent(cfg.id, cfg.schedule_interval)
            except Exception:
                pass  # Scheduler will be properly wired in Task 11
        else:
            try:
                scheduler_service.remove_agent(cfg.id)
            except Exception:
                pass  # Scheduler will be properly wired in Task 11
    return AgentRead(**vars(cfg))


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_endpoint(agent_id: str, _: User = Depends(get_current_user)):
    _get_or_404(agent_id)
    delete_agent(agent_id)
    try:
        scheduler_service.remove_agent(agent_id)
    except Exception:
        pass  # Scheduler will be properly wired in Task 11


@router.post("/{agent_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_agent_now(agent_id: str, background_tasks: BackgroundTasks,
                        _: User = Depends(get_current_user)):
    cfg = _get_or_404(agent_id)
    if cfg.type != "ai":
        raise HTTPException(status_code=400, detail="Only AI agents can be triggered")
    from graphait.modules.scheduler.worker import run_agent_tick
    background_tasks.add_task(run_agent_tick, agent_id)
    return {"status": "triggered", "agent_id": agent_id}


@router.post("/{agent_id}/stop", status_code=status.HTTP_200_OK)
def stop_agent(agent_id: str, db: Session = Depends(get_db),
               _: User = Depends(get_current_user)):
    from graphait.models.run import AgentRun, RunStatus
    _get_or_404(agent_id)
    run = (db.query(AgentRun)
           .filter(AgentRun.agent_id == agent_id, AgentRun.status == RunStatus.running)
           .first())
    if not run:
        raise HTTPException(status_code=404, detail="No active run for this agent")
    run.status = RunStatus.stopped
    run.finished_at = datetime.utcnow()
    db.commit()
    return {"status": "stopped", "run_id": str(run.id)}
