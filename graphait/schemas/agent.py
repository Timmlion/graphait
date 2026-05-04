from typing import Optional
from pydantic import BaseModel


class AgentCreate(BaseModel):
    id: str
    name: str
    role_title: str
    type: str = "ai"
    model: str = "anthropic/claude-sonnet-4-5"
    api_key: Optional[str] = None
    working_dir: str
    reports_to: Optional[str] = None
    schedule_interval: int = 300
    schedule_enabled: bool = True
    tools: list[str] = []
    skills: list[str] = []
    system_prompt: str = ""


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    type: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    working_dir: Optional[str] = None
    reports_to: Optional[str] = None
    schedule_interval: Optional[int] = None
    schedule_enabled: Optional[bool] = None
    tools: Optional[list[str]] = None
    skills: Optional[list[str]] = None
    system_prompt: Optional[str] = None


class AgentRead(BaseModel):
    id: str
    name: str
    role_title: str
    type: str
    model: str
    api_key: Optional[str]
    working_dir: str
    reports_to: Optional[str]
    schedule_interval: int
    schedule_enabled: bool
    tools: list[str]
    skills: list[str]
    system_prompt: str
