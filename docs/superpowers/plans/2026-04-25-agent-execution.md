# Agent Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up end-to-end agent execution — assign task on Board → AI agent picks it up via AgentLoop → uses file tools → posts comment → marks done.

**Architecture:** Custom `AgentLoop` (~150 lines) calls OpenRouter via httpx with OpenAI tool calling. Skills are markdown stored in DB, written to `workspaces/{agent_id}/AGENTS.md` on save. Tools (read_file, write_file, list_directory, post_comment, update_status, create_task, assign_task) are Python functions registered per agent via checkboxes.

**Tech Stack:** FastAPI, SQLAlchemy 2 + SQLite, httpx, React + TypeScript, OpenRouter API

---

## File Map

**New (backend):**
- `graphait/models/skill.py` — Skill + AgentSkill models
- `graphait/schemas/skill.py` — SkillCreate, SkillUpdate, SkillRead
- `graphait/api/v1/skills.py` — skill CRUD + agent skill assignment
- `graphait/modules/agent/__init__.py` — empty
- `graphait/modules/agent/tools.py` — tool definitions + implementations
- `graphait/modules/agent/loop.py` — AgentLoop class
- `graphait/modules/agent/workspace.py` — AGENTS.md generation
- `tests/test_tools.py` — tool unit tests
- `tests/test_agent_loop.py` — loop integration tests
- `tests/test_skills_api.py` — skill CRUD API tests

**Modified (backend):**
- `tests/conftest.py` — switch from PostgreSQL to SQLite in-memory
- `graphait/models/__init__.py` — add Skill, AgentSkill
- `graphait/models/organization.py` — add skills relationship
- `graphait/models/agent.py` — add agent_skills relationship
- `graphait/api/v1/router.py` — register skills router
- `graphait/api/v1/agents.py` — trigger AGENTS.md regen on PATCH + skill endpoints
- `graphait/api/v1/auth.py` — auto-create human agent on register
- `graphait/modules/scheduler/worker.py` — delegate to AgentLoop

**New (frontend):**
- `frontend/src/api/skills.ts` — skill CRUD + assignment API calls
- `frontend/src/pages/SkillsPage.tsx` — list/create/edit/delete skills

**Modified (frontend):**
- `frontend/src/pages/GraphPage.tsx` — add tools checkboxes + skills tab in agent config
- `frontend/src/App.tsx` — add /skills route + nav link

---

## Task 1: Fix test infrastructure (SQLite in-memory)

**Files:**
- Modify: `tests/conftest.py`

- [ ] **Step 1: Replace conftest.py**

```python
# tests/conftest.py
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-minimum-32-chars!!")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import graphait.models  # noqa — registers all models

from graphait.database import Base, get_db
from graphait.main import create_app


@pytest.fixture()
def engine():
    e = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=e)
    yield e
    e.dispose()


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 2: Run existing tests to verify they still pass**

```bash
source .venv/bin/activate && pytest tests/test_auth.py -v
```

Expected: 9 passed (same as before, now running against SQLite)

- [ ] **Step 3: Commit**

```bash
git add tests/conftest.py
git commit -m "test: switch to SQLite in-memory test database"
```

---

## Task 2: Skill + AgentSkill models

**Files:**
- Create: `graphait/models/skill.py`
- Modify: `graphait/models/__init__.py`
- Modify: `graphait/models/organization.py`
- Modify: `graphait/models/agent.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_skills_api.py
from graphait.models.skill import Skill, AgentSkill
from graphait.models.organization import Organization
from graphait.models.agent import Agent, AgentType


def test_skill_model_created(db):
    org = Organization(name="Acme", slug="acme")
    db.add(org)
    db.flush()

    skill = Skill(org_id=org.id, name="Python Senior Dev", content="# Python\nAlways use type hints.")
    db.add(skill)
    db.commit()

    loaded = db.get(Skill, skill.id)
    assert loaded.name == "Python Senior Dev"
    assert loaded.org_id == org.id


def test_agent_skill_assignment(db):
    org = Organization(name="Beta", slug="beta")
    db.add(org)
    db.flush()

    agent = Agent(org_id=org.id, name="Dev", role_title="Engineer", type=AgentType.ai)
    skill = Skill(org_id=org.id, name="Testing", content="Use pytest.")
    db.add_all([agent, skill])
    db.flush()

    link = AgentSkill(agent_id=agent.id, skill_id=skill.id)
    db.add(link)
    db.commit()

    db.refresh(agent)
    assert len(agent.agent_skills) == 1
    assert agent.agent_skills[0].skill.name == "Testing"
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_skills_api.py::test_skill_model_created -v
```

Expected: ImportError — `graphait.models.skill` does not exist

- [ ] **Step 3: Create skill.py model**

```python
# graphait/models/skill.py
from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, DateTime, func, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.agent import Agent
    from graphait.models.organization import Organization


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship("Organization", back_populates="skills")
    agent_skills: Mapped[list["AgentSkill"]] = relationship("AgentSkill", back_populates="skill", cascade="all, delete-orphan")


class AgentSkill(Base):
    __tablename__ = "agent_skills"

    agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True)
    skill_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="agent_skills")
    skill: Mapped["Skill"] = relationship("Skill", back_populates="agent_skills")
```

- [ ] **Step 4: Register in models/\_\_init\_\_.py**

Add to the bottom of `graphait/models/__init__.py`:
```python
from graphait.models.skill import Skill, AgentSkill
```

- [ ] **Step 5: Add skills relationship to Organization**

In `graphait/models/organization.py`, add to imports:
```python
if TYPE_CHECKING:
    from graphait.models.user import User
    from graphait.models.agent import Agent
    from graphait.models.skill import Skill  # add this
```

Add to Organization class body after the `agents` relationship:
```python
    skills: Mapped[list["Skill"]] = relationship("Skill", back_populates="organization")
```

- [ ] **Step 6: Add agent_skills relationship to Agent**

In `graphait/models/agent.py`, add to TYPE_CHECKING block:
```python
    from graphait.models.skill import AgentSkill  # add this
```

Add to Agent class body after the `schedule` relationship:
```python
    agent_skills: Mapped[list["AgentSkill"]] = relationship("AgentSkill", back_populates="agent", cascade="all, delete-orphan")
```

- [ ] **Step 7: Run tests**

```bash
pytest tests/test_skills_api.py -v
```

Expected: 2 passed

- [ ] **Step 8: Confirm existing auth tests still pass**

```bash
pytest tests/test_auth.py -v
```

Expected: 9 passed

- [ ] **Step 9: Commit**

```bash
git add graphait/models/skill.py graphait/models/__init__.py graphait/models/organization.py graphait/models/agent.py tests/test_skills_api.py
git commit -m "feat: Skill + AgentSkill models"
```

---

## Task 3: Skill CRUD API + agent skill assignment

**Files:**
- Create: `graphait/schemas/skill.py`
- Create: `graphait/api/v1/skills.py`
- Modify: `graphait/api/v1/router.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_skills_api.py`:

```python
def _register(client, slug):
    resp = client.post("/api/v1/auth/register", json={
        "org_name": slug, "org_slug": slug,
        "email": f"admin@{slug}.com", "password": "pass123"
    })
    return resp.json()["access_token"]


def test_create_and_list_skills(client):
    token = _register(client, "skills1")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post("/api/v1/skills", json={"name": "Python", "content": "Use type hints."}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["name"] == "Python"

    resp = client.get("/api/v1/skills", headers=headers)
    assert len(resp.json()) == 1


def test_update_skill(client):
    token = _register(client, "skills2")
    headers = {"Authorization": f"Bearer {token}"}
    skill_id = client.post("/api/v1/skills", json={"name": "Old", "content": "old"}, headers=headers).json()["id"]

    resp = client.patch(f"/api/v1/skills/{skill_id}", json={"name": "New"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"


def test_assign_and_list_agent_skills(client):
    token = _register(client, "skills3")
    headers = {"Authorization": f"Bearer {token}"}

    skill_id = client.post("/api/v1/skills", json={"name": "Testing", "content": "use pytest"}, headers=headers).json()["id"]
    agent_id = client.post("/api/v1/agents", json={
        "name": "Tester", "role_title": "QA", "type": "ai"
    }, headers=headers).json()["id"]

    resp = client.put(f"/api/v1/agents/{agent_id}/skills/{skill_id}", headers=headers)
    assert resp.status_code == 204

    resp = client.get(f"/api/v1/agents/{agent_id}/skills", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Testing"

    resp = client.delete(f"/api/v1/agents/{agent_id}/skills/{skill_id}", headers=headers)
    assert resp.status_code == 204

    resp = client.get(f"/api/v1/agents/{agent_id}/skills", headers=headers)
    assert len(resp.json()) == 0
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_skills_api.py::test_create_and_list_skills -v
```

Expected: 404 (route not found)

- [ ] **Step 3: Create skill schemas**

```python
# graphait/schemas/skill.py
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str
    content: str = ""


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None


class SkillRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create skill API**

```python
# graphait/api/v1/skills.py
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.skill import Skill, AgentSkill
from graphait.models.agent import Agent
from graphait.models.user import User
from graphait.schemas.skill import SkillCreate, SkillUpdate, SkillRead
from graphait.modules.agent.workspace import regenerate_agents_md

router = APIRouter()


def _get_skill_or_404(skill_id: uuid.UUID, org_id: uuid.UUID, db: Session) -> Skill:
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.org_id == org_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.get("", response_model=list[SkillRead])
def list_skills(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Skill).filter(Skill.org_id == current_user.org_id).all()


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def create_skill(body: SkillCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = Skill(org_id=current_user.org_id, name=body.name, content=body.content)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.patch("/{skill_id}", response_model=SkillRead)
def update_skill(skill_id: uuid.UUID, body: SkillUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = _get_skill_or_404(skill_id, current_user.org_id, db)
    if body.name is not None:
        skill.name = body.name
    if body.content is not None:
        skill.content = body.content
    db.commit()
    db.refresh(skill)
    # regenerate AGENTS.md for all agents with this skill
    for asoc in skill.agent_skills:
        db.refresh(asoc.agent)
        regenerate_agents_md(asoc.agent)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(skill_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = _get_skill_or_404(skill_id, current_user.org_id, db)
    db.delete(skill)
    db.commit()


# --- Agent skill assignment (mounted on /agents/{id}/skills via agents.py) ---

def assign_skill_to_agent(agent_id: uuid.UUID, skill_id: uuid.UUID, db: Session, org_id: uuid.UUID) -> None:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    skill = _get_skill_or_404(skill_id, org_id, db)
    exists = db.query(AgentSkill).filter_by(agent_id=agent_id, skill_id=skill_id).first()
    if not exists:
        db.add(AgentSkill(agent_id=agent_id, skill_id=skill_id))
        db.commit()
        db.refresh(agent)
        regenerate_agents_md(agent)


def remove_skill_from_agent(agent_id: uuid.UUID, skill_id: uuid.UUID, db: Session, org_id: uuid.UUID) -> None:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    link = db.query(AgentSkill).filter_by(agent_id=agent_id, skill_id=skill_id).first()
    if link:
        db.delete(link)
        db.commit()
        db.refresh(agent)
        regenerate_agents_md(agent)


def list_agent_skills(agent_id: uuid.UUID, db: Session, org_id: uuid.UUID) -> list[Skill]:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return [asoc.skill for asoc in agent.agent_skills]
```

- [ ] **Step 5: Register skills router in router.py**

In `graphait/api/v1/router.py`, add:
```python
from graphait.api.v1 import auth, agents, tasks, graph, schedules, org, skills  # add skills

# in the router includes, add:
router.include_router(skills.router, prefix="/skills", tags=["skills"])
```

- [ ] **Step 6: Add skill assignment endpoints to agents.py**

Add to the end of `graphait/api/v1/agents.py`:

```python
from graphait.api.v1.skills import assign_skill_to_agent, remove_skill_from_agent, list_agent_skills
from graphait.schemas.skill import SkillRead


@router.get("/{agent_id}/skills", response_model=list[SkillRead])
def get_agent_skills(agent_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return list_agent_skills(agent_id, db, current_user.org_id)


@router.put("/{agent_id}/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_agent_skill(agent_id: uuid.UUID, skill_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    assign_skill_to_agent(agent_id, skill_id, db, current_user.org_id)


@router.delete("/{agent_id}/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_agent_skill(agent_id: uuid.UUID, skill_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    remove_skill_from_agent(agent_id, skill_id, db, current_user.org_id)
```

- [ ] **Step 7: Add stub workspace module** (needed by skills.py import — full impl in Task 5)

```python
# graphait/modules/agent/__init__.py
# (empty)
```

```python
# graphait/modules/agent/workspace.py
from graphait.models.agent import Agent


def regenerate_agents_md(agent: Agent) -> None:
    pass  # implemented in Task 5
```

- [ ] **Step 8: Run tests**

```bash
pytest tests/test_skills_api.py -v
```

Expected: 5 passed

- [ ] **Step 9: Commit**

```bash
git add graphait/schemas/skill.py graphait/api/v1/skills.py graphait/api/v1/router.py graphait/api/v1/agents.py graphait/modules/agent/__init__.py graphait/modules/agent/workspace.py tests/test_skills_api.py
git commit -m "feat: skill CRUD API + agent skill assignment endpoints"
```

---

## Task 4: Tool implementations

**Files:**
- Create: `graphait/modules/agent/tools.py`
- Create: `tests/test_tools.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_tools.py
import pytest
from pathlib import Path
from graphait.modules.agent.tools import read_file, write_file, list_directory, _safe_path, TOOL_DEFINITIONS, ALWAYS_ENABLED


def test_write_and_read_file(tmp_path):
    result = write_file("hello.txt", "world", tmp_path)
    assert "hello.txt" in result
    assert read_file("hello.txt", tmp_path) == "world"


def test_write_creates_subdirectories(tmp_path):
    write_file("sub/dir/file.py", "# code", tmp_path)
    assert (tmp_path / "sub" / "dir" / "file.py").read_text() == "# code"


def test_list_directory(tmp_path):
    (tmp_path / "a.py").write_text("")
    (tmp_path / "b.md").write_text("")
    result = list_directory(".", tmp_path)
    assert "a.py" in result
    assert "b.md" in result


def test_path_traversal_blocked(tmp_path):
    with pytest.raises(ValueError, match="Path traversal denied"):
        _safe_path("../../etc/passwd", tmp_path)


def test_always_enabled_tools_present():
    for name in ALWAYS_ENABLED:
        assert name in TOOL_DEFINITIONS


def test_tool_definitions_have_required_fields():
    for name, tool in TOOL_DEFINITIONS.items():
        schema = tool.to_openai_schema()
        assert schema["type"] == "function"
        assert "name" in schema["function"]
        assert "description" in schema["function"]
        assert "parameters" in schema["function"]
```

- [ ] **Step 2: Run to see them fail**

```bash
pytest tests/test_tools.py -v
```

Expected: ImportError — `graphait.modules.agent.tools` does not exist

- [ ] **Step 3: Implement tools.py**

```python
# graphait/modules/agent/tools.py
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict

    def to_openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def _safe_path(path: str, working_dir: Path) -> Path:
    target = (working_dir / path).resolve()
    if not str(target).startswith(str(working_dir.resolve())):
        raise ValueError(f"Path traversal denied: {path}")
    return target


def read_file(path: str, working_dir: Path) -> str:
    target = _safe_path(path, working_dir)
    if not target.exists():
        return f"Error: file not found: {path}"
    return target.read_text(encoding="utf-8")


def write_file(path: str, content: str, working_dir: Path) -> str:
    target = _safe_path(path, working_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Written {len(content)} chars to {path}"


def list_directory(path: str, working_dir: Path) -> str:
    target = _safe_path(path, working_dir)
    if not target.exists():
        return f"Error: directory not found: {path}"
    entries = sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name))
    if not entries:
        return "(empty directory)"
    return "\n".join(f"{'[dir]' if e.is_dir() else '[file]'} {e.name}" for e in entries)


TOOL_DEFINITIONS: dict[str, ToolDefinition] = {
    "read_file": ToolDefinition(
        name="read_file",
        description="Read the contents of a file from the agent's working directory.",
        parameters={
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Relative file path"}},
            "required": ["path"],
        },
    ),
    "write_file": ToolDefinition(
        name="write_file",
        description="Write content to a file in the agent's working directory. Creates directories as needed.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative file path"},
                "content": {"type": "string", "description": "Content to write"},
            },
            "required": ["path", "content"],
        },
    ),
    "list_directory": ToolDefinition(
        name="list_directory",
        description="List files and subdirectories at a path within the working directory.",
        parameters={
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Relative path (use '.' for root)"}},
            "required": ["path"],
        },
    ),
    "post_comment": ToolDefinition(
        name="post_comment",
        description="Post an interim comment on the current task to report progress. Does not change task status.",
        parameters={
            "type": "object",
            "properties": {"content": {"type": "string", "description": "Comment text (markdown supported)"}},
            "required": ["content"],
        },
    ),
    "update_status": ToolDefinition(
        name="update_status",
        description="Update the status of the current task. Use 'done' when complete, 'blocked' if you cannot proceed.",
        parameters={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["done", "blocked", "in_progress", "in_review", "cancelled"],
                },
                "comment": {"type": "string", "description": "Optional explanation posted as comment before status change"},
            },
            "required": ["status"],
        },
    ),
    "create_task": ToolDefinition(
        name="create_task",
        description="Create a new task in Graphait, optionally assigning it to another agent.",
        parameters={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                "assignee_id": {"type": "string", "description": "UUID of agent to assign (optional)"},
            },
            "required": ["title"],
        },
    ),
    "assign_task": ToolDefinition(
        name="assign_task",
        description="Assign an existing task to a specific agent by UUID.",
        parameters={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "UUID of the task"},
                "agent_id": {"type": "string", "description": "UUID of the agent"},
            },
            "required": ["task_id", "agent_id"],
        },
    ),
}

ALWAYS_ENABLED: frozenset[str] = frozenset({"post_comment", "update_status", "create_task", "assign_task"})
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_tools.py -v
```

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/agent/tools.py tests/test_tools.py
git commit -m "feat: agent tool definitions and implementations"
```

---

## Task 5: AgentLoop

**Files:**
- Create: `graphait/modules/agent/loop.py`
- Create: `tests/test_agent_loop.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_agent_loop.py
import uuid
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from graphait.modules.agent.loop import AgentLoop
from graphait.models.agent import Agent, AgentType
from graphait.models.task import Task, TaskStatus, TaskPriority, TaskType


def _make_agent(tmp_path):
    agent = Agent(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        name="Dev",
        role_title="Engineer",
        type=AgentType.ai,
        system_prompt="You are a helpful engineer.",
        connector_config={
            "model": "openai/gpt-4o-mini",
            "api_key": "sk-test",
            "working_dir": str(tmp_path),
        },
        is_active=True,
    )
    agent.agent_skills = []
    agent.organization = MagicMock(settings={})
    return agent


def _make_task():
    task = Task(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        title="Write hello world",
        description="Create a hello.py file",
        status=TaskStatus.todo,
        priority=TaskPriority.medium,
        task_type=TaskType.task,
        creator_id=uuid.uuid4(),
    )
    task.comments = []
    return task


def _openrouter_response(content=None, tool_calls=None):
    msg = {"role": "assistant"}
    if content:
        msg["content"] = content
    if tool_calls:
        msg["tool_calls"] = tool_calls
        msg["content"] = None
    return {"choices": [{"message": msg}]}


@pytest.mark.asyncio
async def test_loop_posts_comment_and_marks_done_on_text_response(tmp_path, db):
    agent = _make_agent(tmp_path)
    task = _make_task()
    task.org_id = agent.org_id
    db.add_all([agent, task])
    db.commit()

    loop = AgentLoop(agent, task, db)
    loop._post_comment = MagicMock()
    loop._update_task_status = MagicMock()

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = _openrouter_response(content="Task complete!")
        mock_client.post.return_value = mock_resp

        await loop.run()

    loop._post_comment.assert_called_once_with("Task complete!")
    loop._update_task_status.assert_called_once_with(TaskStatus.done)


@pytest.mark.asyncio
async def test_loop_executes_write_file_tool(tmp_path, db):
    agent = _make_agent(tmp_path)
    task = _make_task()
    task.org_id = agent.org_id
    db.add_all([agent, task])
    db.commit()

    loop = AgentLoop(agent, task, db)
    loop._post_comment = MagicMock()
    loop._update_task_status = MagicMock()

    tool_call = {
        "id": "tc1",
        "type": "function",
        "function": {
            "name": "write_file",
            "arguments": json.dumps({"path": "hello.py", "content": "print('hello')"}),
        },
    }
    done_call = {
        "id": "tc2",
        "type": "function",
        "function": {
            "name": "update_status",
            "arguments": json.dumps({"status": "done", "comment": "File written."}),
        },
    }

    responses = [
        _openrouter_response(tool_calls=[tool_call]),
        _openrouter_response(tool_calls=[done_call]),
    ]
    call_count = 0

    async def fake_post(*args, **kwargs):
        nonlocal call_count
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = responses[call_count]
        call_count += 1
        return resp

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.post.side_effect = fake_post

        await loop.run()

    assert (tmp_path / "hello.py").read_text() == "print('hello')"
    loop._post_comment.assert_called_with("File written.")
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_agent_loop.py -v
```

Expected: ImportError — `graphait.modules.agent.loop` does not exist

- [ ] **Step 3: Implement AgentLoop**

```python
# graphait/modules/agent/loop.py
import uuid
import json
import logging
from pathlib import Path

import httpx

from graphait.models.agent import Agent
from graphait.models.task import Task, TaskStatus, Comment
from graphait.modules.agent.tools import TOOL_DEFINITIONS, ALWAYS_ENABLED, read_file, write_file, list_directory

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 20


class AgentLoop:
    def __init__(self, agent: Agent, task: Task, db):
        self.agent = agent
        self.task = task
        self.db = db

        config = agent.connector_config or {}
        self.working_dir = Path(config.get("working_dir", f"./workspaces/{agent.id}"))
        self.working_dir.mkdir(parents=True, exist_ok=True)

        org_settings = getattr(agent, "organization", None)
        org_settings = (org_settings.settings or {}) if org_settings else {}
        self.api_key = config.get("api_key") or org_settings.get("openrouter_api_key", "")
        self.model = config.get("model", "openai/gpt-4o-mini")
        self.api_url = config.get("api_url", "https://openrouter.ai/api/v1")
        self.enabled_tools: frozenset[str] = frozenset(config.get("enabled_tools", [])) | ALWAYS_ENABLED

    # --- prompt building ---

    def _build_system_prompt(self) -> str:
        parts = [self.agent.system_prompt or f"You are {self.agent.name}, a {self.agent.role_title}."]

        skill_docs = [asoc.skill for asoc in (self.agent.agent_skills or [])]
        if skill_docs:
            parts.append("\n## Skills\n")
            for skill in skill_docs:
                parts.append(f"### {skill.name}\n{skill.content}")

        parts.append("\n## Available tools\n")
        for name in sorted(self.enabled_tools):
            if name in TOOL_DEFINITIONS:
                parts.append(f"- `{name}`: {TOOL_DEFINITIONS[name].description}")

        parts.append(f"\n## Working directory\n{self.working_dir.resolve()}")
        return "\n".join(parts)

    def _build_task_prompt(self) -> str:
        comments = sorted(self.task.comments or [], key=lambda c: c.created_at)[-10:]
        comment_text = "\n".join(
            f"[{c.created_at.strftime('%H:%M')}] {c.content}" for c in comments
        ) or "(no comments yet)"
        number = getattr(self.task, "number", None)
        label = f"Task #{number}" if number else "Task"
        return (
            f"## {label}: {self.task.title}\n\n"
            f"{self.task.description or '(no description)'}\n\n"
            f"Priority: {self.task.priority.value}\n"
            f"Status: {self.task.status.value}\n\n"
            f"## Recent comments\n{comment_text}\n\n"
            "Work on this task using your tools. When done, call `update_status` with "
            "status='done'. If blocked, call `update_status` with status='blocked' and explain why."
        )

    def _get_tool_schemas(self) -> list[dict]:
        return [
            TOOL_DEFINITIONS[name].to_openai_schema()
            for name in self.enabled_tools
            if name in TOOL_DEFINITIONS
        ]

    # --- tool execution ---

    def _execute_tool(self, name: str, args: dict) -> str:
        try:
            if name == "read_file":
                return read_file(args["path"], self.working_dir)
            if name == "write_file":
                return write_file(args["path"], args["content"], self.working_dir)
            if name == "list_directory":
                return list_directory(args.get("path", "."), self.working_dir)
            if name == "post_comment":
                self._post_comment(args["content"])
                return "Comment posted."
            if name == "update_status":
                if args.get("comment"):
                    self._post_comment(args["comment"])
                self._update_task_status(TaskStatus(args["status"]))
                return f"Status set to {args['status']}."
            if name == "create_task":
                return self._create_task(args)
            if name == "assign_task":
                return self._assign_task(args)
            return f"Unknown tool: {name}"
        except Exception as e:
            logger.warning("Tool %s failed: %s", name, e)
            return f"Tool error ({name}): {e}"

    def _post_comment(self, content: str) -> None:
        comment = Comment(
            task_id=self.task.id,
            author_id=self.agent.id,
            content=content,
            is_system=False,
        )
        self.db.add(comment)
        self.db.commit()

    def _update_task_status(self, status: TaskStatus) -> None:
        self.task.status = status
        self.db.commit()

    def _create_task(self, args: dict) -> str:
        from graphait.models.task import Task as TaskModel, TaskPriority, TaskType
        t = TaskModel(
            org_id=self.agent.org_id,
            title=args["title"],
            description=args.get("description"),
            priority=TaskPriority(args.get("priority", "medium")),
            task_type=TaskType.task,
            creator_id=self.agent.id,
            assignee_id=uuid.UUID(args["assignee_id"]) if args.get("assignee_id") else None,
        )
        self.db.add(t)
        self.db.commit()
        self.db.refresh(t)
        num = t.number or str(t.id)[:8]
        return f"Created task #{num}: {t.title}"

    def _assign_task(self, args: dict) -> str:
        from graphait.models.task import Task as TaskModel
        t = self.db.get(TaskModel, uuid.UUID(args["task_id"]))
        if not t:
            return f"Task {args['task_id']} not found."
        t.assignee_id = uuid.UUID(args["agent_id"])
        self.db.commit()
        return "Task assigned."

    # --- main loop ---

    async def run(self) -> None:
        messages: list[dict] = [
            {"role": "system", "content": self._build_system_prompt()},
            {"role": "user", "content": self._build_task_prompt()},
        ]
        tools = self._get_tool_schemas()

        async with httpx.AsyncClient(timeout=120) as client:
            for iteration in range(MAX_ITERATIONS):
                resp = await client.post(
                    f"{self.api_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"model": self.model, "messages": messages, "tools": tools, "tool_choice": "auto"},
                )
                resp.raise_for_status()
                data = resp.json()
                msg = data["choices"][0]["message"]
                messages.append(msg)

                tool_calls = msg.get("tool_calls") or []
                if not tool_calls:
                    if msg.get("content"):
                        self._post_comment(msg["content"])
                    self._update_task_status(TaskStatus.done)
                    return

                stop = False
                for tc in tool_calls:
                    args = json.loads(tc["function"]["arguments"])
                    result = self._execute_tool(tc["function"]["name"], args)
                    messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
                    if tc["function"]["name"] == "update_status":
                        stop = True

                if stop:
                    return

        logger.warning("Agent %s hit max %d iterations on task %s", self.agent.id, MAX_ITERATIONS, self.task.id)
        self._post_comment(f"⚠️ Reached {MAX_ITERATIONS} iteration limit without completing.")
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_agent_loop.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/agent/loop.py tests/test_agent_loop.py
git commit -m "feat: AgentLoop — tool calling execution engine"
```

---

## Task 6: Workspace module (AGENTS.md generation)

**Files:**
- Modify: `graphait/modules/agent/workspace.py` (replace stub)
- Modify: `graphait/api/v1/agents.py` (trigger regen on PATCH)

- [ ] **Step 1: Write failing test**

```python
# tests/test_agent_loop.py — add at the bottom:

from graphait.modules.agent.workspace import regenerate_agents_md, get_working_dir
from graphait.models.organization import Organization


def test_regenerate_agents_md_writes_file(tmp_path, db):
    org = Organization(name="Acme", slug="acme-ws")
    db.add(org)
    db.flush()

    agent = Agent(
        org_id=org.id,
        name="Alice",
        role_title="Engineer",
        type=AgentType.ai,
        system_prompt="Be helpful.",
        connector_config={"working_dir": str(tmp_path), "enabled_tools": ["read_file"]},
        is_active=True,
    )
    agent.agent_skills = []
    db.add(agent)
    db.commit()

    regenerate_agents_md(agent)

    md = (tmp_path / "AGENTS.md").read_text()
    assert "Alice" in md
    assert "Engineer" in md
    assert "Be helpful." in md
    assert "read_file" in md
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_agent_loop.py::test_regenerate_agents_md_writes_file -v
```

Expected: PASS (stub exists) but content will be empty — actually it will fail the assertions

- [ ] **Step 3: Implement workspace.py**

```python
# graphait/modules/agent/workspace.py
from pathlib import Path
from graphait.models.agent import Agent
from graphait.modules.agent.tools import TOOL_DEFINITIONS, ALWAYS_ENABLED


def get_working_dir(agent: Agent) -> Path:
    config = agent.connector_config or {}
    path = Path(config.get("working_dir", f"./workspaces/{agent.id}"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def regenerate_agents_md(agent: Agent) -> None:
    working_dir = get_working_dir(agent)
    (working_dir / "files").mkdir(exist_ok=True)
    (working_dir / "AGENTS.md").write_text(_build_agents_md(agent), encoding="utf-8")


def _build_agents_md(agent: Agent) -> str:
    config = agent.connector_config or {}
    enabled_tools: frozenset[str] = frozenset(config.get("enabled_tools", [])) | ALWAYS_ENABLED

    lines = [
        f"# {agent.name} — {agent.role_title}",
        "",
        agent.system_prompt or f"You are {agent.name}, a {agent.role_title}.",
    ]

    skill_docs = [asoc.skill for asoc in (agent.agent_skills or [])]
    if skill_docs:
        lines += ["", "---", "", "## Skills", ""]
        for skill in skill_docs:
            lines += [f"### {skill.name}", "", skill.content, ""]

    lines += ["", "---", "", "## Available tools", ""]
    for name in sorted(enabled_tools):
        if name in TOOL_DEFINITIONS:
            lines.append(f"- `{name}`: {TOOL_DEFINITIONS[name].description}")

    working_dir = get_working_dir(agent)
    lines += ["", "---", "", "## Working directory", f"`{working_dir.resolve()}`", ""]
    return "\n".join(lines)
```

- [ ] **Step 4: Trigger regen in agents.py on PATCH**

In `graphait/api/v1/agents.py`, update the `update_agent` endpoint:

```python
from graphait.modules.agent.workspace import regenerate_agents_md

@router.patch("/{agent_id}", response_model=AgentRead)
def update_agent(agent_id: uuid.UUID, body: AgentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = _get_agent_or_404(agent_id, current_user, db)
    updated = agent_service.update(db, agent, body)
    regenerate_agents_md(updated)
    return updated
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_agent_loop.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add graphait/modules/agent/workspace.py graphait/api/v1/agents.py
git commit -m "feat: workspace AGENTS.md generation on agent/skill save"
```

---

## Task 7: Wire AgentLoop into scheduler worker

**Files:**
- Modify: `graphait/modules/scheduler/worker.py`

- [ ] **Step 1: Replace worker.py**

```python
# graphait/modules/scheduler/worker.py
import uuid
import asyncio
import logging
from datetime import datetime, timezone

from graphait.database import SessionLocal
from graphait.models.agent import Agent, AgentType
from graphait.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


async def run_agent_tick(agent_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        agent = db.get(Agent, agent_id)
        if not agent or not agent.is_active or agent.type != AgentType.ai:
            return

        config = agent.connector_config or {}
        if not config.get("model"):
            logger.warning("Agent %s has no model configured — skipping tick", agent_id)
            return

        task = (
            db.query(Task)
            .filter(
                Task.assignee_id == agent_id,
                Task.org_id == agent.org_id,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
            )
            .order_by(Task.created_at)
            .first()
        )
        if not task:
            return

        from graphait.modules.agent.loop import AgentLoop
        loop = AgentLoop(agent, task, db)
        try:
            await loop.run()
        except Exception:
            logger.exception("AgentLoop failed for agent=%s task=%s", agent_id, task.id)
        finally:
            schedule = agent.schedule
            if schedule:
                schedule.last_run_at = datetime.now(timezone.utc)
                db.commit()
```

- [ ] **Step 2: Verify all tests still pass**

```bash
pytest tests/ -v
```

Expected: all tests pass (14+ passed)

- [ ] **Step 3: Commit**

```bash
git add graphait/modules/scheduler/worker.py
git commit -m "feat: wire AgentLoop into scheduler worker"
```

---

## Task 8: Auto-create human agent on register

**Files:**
- Modify: `graphait/api/v1/auth.py`
- Modify: `tests/test_auth.py`

- [ ] **Step 1: Add failing test**

Add to `tests/test_auth.py`:

```python
def test_register_auto_creates_human_agent(client):
    resp = client.post("/api/v1/auth/register", json={
        "org_name": "Zeta Corp",
        "org_slug": "zeta",
        "email": "human@zeta.com",
        "password": "pass123"
    })
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    agents = client.get("/api/v1/agents", headers=headers).json()
    assert len(agents) == 1
    assert agents[0]["type"] == "human"
    assert agents[0]["name"] == "human"  # derived from email prefix
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_auth.py::test_register_auto_creates_human_agent -v
```

Expected: FAIL — agents list is empty after register

- [ ] **Step 3: Update auth.py register endpoint**

```python
# graphait/api/v1/auth.py
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.models.organization import Organization
from graphait.models.user import User, UserRole
from graphait.models.agent import Agent, AgentType
from graphait.modules.auth.service import hash_password, verify_password, create_access_token
from graphait.schemas.user import RegisterRequest, LoginRequest, TokenResponse, UserRead
from graphait.api.deps import get_current_user

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(Organization).filter(Organization.slug == body.org_slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Org slug already taken")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    org = Organization(name=body.org_name, slug=body.org_slug)
    db.add(org)
    db.flush()

    user = User(org_id=org.id, email=body.email, password_hash=hash_password(body.password), role=UserRole.admin)
    db.add(user)
    db.flush()

    human_agent = Agent(
        org_id=org.id,
        user_id=user.id,
        name=body.email.split("@")[0],
        role_title="Human",
        type=AgentType.human,
        is_active=True,
    )
    db.add(human_agent)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Step 4: Run all tests**

```bash
pytest tests/ -v
```

Expected: all pass (15+ passed)

- [ ] **Step 5: Commit**

```bash
git add graphait/api/v1/auth.py tests/test_auth.py
git commit -m "feat: auto-create human agent on register"
```

---

## Task 9: Frontend — Skills management page

**Files:**
- Create: `frontend/src/api/skills.ts`
- Create: `frontend/src/pages/SkillsPage.tsx`
- Modify: `frontend/src/App.tsx` (add route + nav)

- [ ] **Step 1: Create skills API client**

```typescript
// frontend/src/api/skills.ts
import { apiFetch } from "./index";

export interface Skill {
  id: string;
  org_id: string;
  name: string;
  content: string;
  created_at: string;
}

export const skillsApi = {
  list: () => apiFetch<Skill[]>("/skills"),
  create: (data: { name: string; content: string }) =>
    apiFetch<Skill>("/skills", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; content?: string }) =>
    apiFetch<Skill>(`/skills/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<void>(`/skills/${id}`, { method: "DELETE" }),
  listForAgent: (agentId: string) => apiFetch<Skill[]>(`/agents/${agentId}/skills`),
  assign: (agentId: string, skillId: string) =>
    apiFetch<void>(`/agents/${agentId}/skills/${skillId}`, { method: "PUT" }),
  remove: (agentId: string, skillId: string) =>
    apiFetch<void>(`/agents/${agentId}/skills/${skillId}`, { method: "DELETE" }),
};
```

- [ ] **Step 2: Create SkillsPage.tsx**

```tsx
// frontend/src/pages/SkillsPage.tsx
import { useState, useEffect } from "react";
import { skillsApi, type Skill } from "../api/skills";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [form, setForm] = useState({ name: "", content: "" });
  const [creating, setCreating] = useState(false);

  const load = () => skillsApi.list().then(setSkills);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await skillsApi.create(form);
    setForm({ name: "", content: "" });
    setCreating(false);
    load();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await skillsApi.update(editing.id, { name: form.name, content: form.content });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this skill?")) return;
    await skillsApi.delete(id);
    load();
  };

  const startEdit = (skill: Skill) => {
    setEditing(skill);
    setForm({ name: skill.name, content: skill.content });
    setCreating(false);
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ name: "", content: "" });
  };

  return (
    <div className="skills-page">
      <div className="page-header">
        <h1>Skills</h1>
        <button className="btn btn--primary" onClick={startCreate}>+ New skill</button>
      </div>

      {(creating || editing) && (
        <div className="skill-form">
          <input
            className="input"
            placeholder="Skill name (e.g. Python Senior Dev)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <textarea
            className="input skill-form__textarea"
            placeholder="Skill content (markdown). Describe how the agent should approach this domain..."
            value={form.content}
            rows={12}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          />
          <div className="skill-form__actions">
            <button className="btn btn--primary" onClick={editing ? handleUpdate : handleCreate}>
              {editing ? "Save changes" : "Create skill"}
            </button>
            <button className="btn" onClick={() => { setEditing(null); setCreating(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="skill-list">
        {skills.length === 0 && !creating && (
          <p className="empty-state">No skills yet. Create one to teach agents how to work.</p>
        )}
        {skills.map(skill => (
          <div key={skill.id} className="skill-card">
            <div className="skill-card__header">
              <span className="skill-card__name">{skill.name}</span>
              <div className="skill-card__actions">
                <button className="btn btn--sm" onClick={() => startEdit(skill)}>Edit</button>
                <button className="btn btn--sm btn--danger" onClick={() => handleDelete(skill.id)}>Delete</button>
              </div>
            </div>
            <pre className="skill-card__preview">{skill.content.slice(0, 200)}{skill.content.length > 200 ? "…" : ""}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add route and nav link**

In `frontend/src/App.tsx` (or wherever routes are defined), add:

```tsx
import SkillsPage from "./pages/SkillsPage";

// inside Routes:
<Route path="/skills" element={<SkillsPage />} />
```

In the nav sidebar, add a Skills link alongside Board/Graph/Inbox/Settings. (Exact location depends on your nav component — find the nav items list and add `{ path: "/skills", label: "Skills" }`.)

- [ ] **Step 4: Add CSS**

Add to `frontend/src/index.css`:

```css
.skills-page { padding: 24px; max-width: 800px; }
.skill-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; padding: 16px; border: 1px solid var(--border); }
.skill-form__textarea { font-family: var(--font-mono, monospace); resize: vertical; }
.skill-form__actions { display: flex; gap: 8px; }
.skill-list { display: flex; flex-direction: column; gap: 12px; }
.skill-card { border: 1px solid var(--border); padding: 16px; }
.skill-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.skill-card__name { font-weight: 600; }
.skill-card__actions { display: flex; gap: 6px; }
.skill-card__preview { font-size: 12px; color: var(--muted); white-space: pre-wrap; margin: 0; }
.btn--sm { padding: 2px 8px; font-size: 12px; }
.btn--danger { color: var(--danger, #e53e3e); }
.empty-state { color: var(--muted); }
```

- [ ] **Step 5: Start dev server and verify**

```bash
source .venv/bin/activate && make dev
```

Open `http://localhost:5173/skills`. Verify: page loads, create a skill, edit it, delete it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/skills.ts frontend/src/pages/SkillsPage.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat: skills management page"
```

---

## Task 10: Frontend — Agent config: Tools checkboxes + Skills tab

**Files:**
- Modify: `frontend/src/pages/GraphPage.tsx`

The agent config panel in GraphPage currently has tabs including a "connector" tab. We need to add:
1. **Tools** — checkboxes for `read_file`, `write_file`, `list_directory` (always-enabled tools are shown but disabled)
2. **Skills** — list of org skills with assign/unassign toggles

- [ ] **Step 1: Add tools and skills state to agent detail panel**

In `GraphPage.tsx`, find the agent detail/edit panel (where `connector_config` is managed). Add:

```tsx
import { skillsApi, type Skill } from "../api/skills";

const OPTIONAL_TOOLS = ["read_file", "write_file", "list_directory"] as const;
const ALWAYS_ON_TOOLS = ["post_comment", "update_status", "create_task", "assign_task"] as const;

// Inside the component, alongside other agent state:
const [orgSkills, setOrgSkills] = useState<Skill[]>([]);
const [agentSkills, setAgentSkills] = useState<Skill[]>([]);

// Load org skills and agent's current skills when agent is selected:
useEffect(() => {
  if (!selectedAgent) return;
  skillsApi.list().then(setOrgSkills);
  skillsApi.listForAgent(selectedAgent.id).then(setAgentSkills);
}, [selectedAgent?.id]);

const enabledTools: string[] = (selectedAgent?.connector_config as any)?.enabled_tools ?? [];

const toggleTool = async (toolName: string, checked: boolean) => {
  const current = enabledTools;
  const updated = checked
    ? [...current, toolName]
    : current.filter(t => t !== toolName);
  await agentsApi.update(selectedAgent!.id, {
    connector_config: { ...(selectedAgent!.connector_config as any), enabled_tools: updated }
  });
  // refresh agent
};

const toggleSkill = async (skill: Skill, assigned: boolean) => {
  if (assigned) {
    await skillsApi.remove(selectedAgent!.id, skill.id);
  } else {
    await skillsApi.assign(selectedAgent!.id, skill.id);
  }
  skillsApi.listForAgent(selectedAgent!.id).then(setAgentSkills);
};
```

- [ ] **Step 2: Add Tools tab content**

Add a "Tools" tab to the agent config panel (alongside existing tabs). Tab content:

```tsx
{activeTab === "tools" && (
  <div className="tools-tab">
    <p className="tools-tab__hint">Always enabled (cannot remove):</p>
    {ALWAYS_ON_TOOLS.map(t => (
      <label key={t} className="tool-item tool-item--disabled">
        <input type="checkbox" checked disabled /> <code>{t}</code>
      </label>
    ))}
    <p className="tools-tab__hint">Optional tools:</p>
    {OPTIONAL_TOOLS.map(t => (
      <label key={t} className="tool-item">
        <input
          type="checkbox"
          checked={enabledTools.includes(t)}
          onChange={e => toggleTool(t, e.target.checked)}
        />
        <code>{t}</code>
      </label>
    ))}
  </div>
)}
```

- [ ] **Step 3: Add Skills tab content**

```tsx
{activeTab === "skills" && (
  <div className="skills-tab">
    {orgSkills.length === 0 && (
      <p className="empty-state">No skills in your org yet. <a href="/skills">Create skills →</a></p>
    )}
    {orgSkills.map(skill => {
      const assigned = agentSkills.some(s => s.id === skill.id);
      return (
        <label key={skill.id} className="skill-item">
          <input
            type="checkbox"
            checked={assigned}
            onChange={() => toggleSkill(skill, assigned)}
          />
          <span className="skill-item__name">{skill.name}</span>
        </label>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Add CSS**

```css
.tools-tab, .skills-tab { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; }
.tools-tab__hint { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 2px; }
.tool-item { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.tool-item--disabled { opacity: 0.5; cursor: default; }
.skill-item { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0; }
.skill-item__name { font-size: 14px; }
```

- [ ] **Step 5: Test the full flow in browser**

1. Start dev server: `make dev`
2. Register → auto-redirect to app (human agent auto-created)
3. Go to `/skills` → create a skill "Software Engineer" with content `Always write clean, typed code.`
4. Go to Graph (`/graph`) → create an AI agent, fill in:
   - Name: "Dev Agent"
   - Role: "Software Engineer"  
   - Type: AI
   - Model: `openai/gpt-4o-mini` (in connector config)
   - API key: your OpenRouter key
5. Open agent → Tools tab → check `write_file` and `read_file`
6. Open agent → Skills tab → assign "Software Engineer"
7. Go to Board → create task "Write a hello.py that prints Hello, World!"
8. Assign to "Dev Agent"
9. Go back to Graph → click "Run now" on Dev Agent
10. Go to Board → open task → verify comment appeared + status = done

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/GraphPage.tsx frontend/src/index.css
git commit -m "feat: tools checkboxes + skills tab in agent config"
```

---

## Self-review

**Spec coverage check:**
- ✅ AgentLoop with tool calling loop (Task 5)
- ✅ Skills as markdown in DB, injected to system prompt (Tasks 2–3, loop._build_system_prompt)
- ✅ AGENTS.md written on save (Task 6)
- ✅ Tools: read_file, write_file, list_directory, post_comment, update_status, create_task, assign_task (Task 4)
- ✅ Tools as checkboxes per agent (Task 10)
- ✅ Skills assigned per agent (Tasks 3, 9, 10)
- ✅ Human agent auto-created on register (Task 8)
- ✅ Worker delegates to AgentLoop (Task 7)
- ✅ AGENTS.md regenerated on skill content update (Task 3, skills.py update_skill)
- ✅ Test infrastructure switched to SQLite (Task 1)

**Type consistency:**
- `AgentSkill.agent_skills` — Agent model uses `agent_skills`, loop uses `agent.agent_skills` ✅
- `ALWAYS_ENABLED` (frozenset) used in tools.py and workspace.py ✅
- `TaskStatus.done` / `TaskStatus.todo` / `TaskStatus.in_progress` — consistent with models/task.py ✅
- `SkillRead` used in skills.py and agents.py skill endpoints ✅
