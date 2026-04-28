import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str


class CommentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: Optional[str]
    content: str
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}
