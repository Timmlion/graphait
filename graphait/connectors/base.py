from __future__ import annotations
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentContext:
    agent_id: uuid.UUID
    agent_name: str
    role_title: str
    system_prompt: Optional[str]
    authority_scope: Optional[dict]
    tasks: list[dict]           # list of {id, title, description, status, comments: [...]}
    subordinate_names: list[str]
    supervisor_name: Optional[str]


@dataclass
class Action:
    type: str                   # "comment" | "update_status" | "create_task" | "escalate"
    payload: dict = field(default_factory=dict)


class BaseConnector(ABC):
    @abstractmethod
    async def run(self, context: AgentContext, connector_config: dict) -> list[Action]:
        """Call the LLM/CLI and return a list of actions to execute."""
        ...
