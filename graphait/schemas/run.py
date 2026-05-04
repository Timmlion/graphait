from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AgentRunRead(BaseModel):
    id: str
    agent_id: str
    task_id: str
    task_title: str
    task_number: Optional[int]
    started_at: datetime
    finished_at: Optional[datetime]
    status: str
    duration_seconds: Optional[float]

    model_config = {"from_attributes": True}


class RunEventRead(BaseModel):
    id: str
    run_id: str
    created_at: datetime
    role: str
    content: str
    tool_name: Optional[str]

    model_config = {"from_attributes": True}
