from typing import Optional
from pydantic import BaseModel


class SkillCreate(BaseModel):
    id: str
    name: str
    content: str


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None


class SkillRead(BaseModel):
    id: str
    name: str
    content: str
