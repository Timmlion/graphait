# Graphait M1 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Graphait M1 backend — agent graph, task board, auth, HTTP/OpenCode connectors, and Redis scheduler — serving a REST API for the M1 frontend.

**Architecture:** Modularny monolit FastAPI + SQLAlchemy (sync) + PostgreSQL. Redis obsługuje scheduler agentów (APScheduler over Redis). Connectors implementują BaseConnector ABC. Testy: pytest + TestClient + dedykowana test DB w PostgreSQL.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic, PostgreSQL 16, Redis 7, APScheduler 3.x, python-jose, passlib[bcrypt], httpx, pytest

---

## File Map

```
graphait/
  __init__.py
  main.py                        # FastAPI app factory
  config.py                      # pydantic-settings
  database.py                    # engine, SessionLocal, Base, get_db
  models/
    __init__.py                  # re-exports all models (needed by Alembic)
    organization.py
    user.py
    agent.py                     # Agent + AgentRelationship
    task.py                      # Task + Comment + Attachment
    schedule.py                  # AgentSchedule
  schemas/
    __init__.py
    organization.py
    user.py
    agent.py
    task.py
    comment.py
    graph.py
  api/
    __init__.py
    deps.py                      # get_db, get_current_agent (auth dependency)
    v1/
      __init__.py
      router.py
      auth.py
      agents.py
      tasks.py
      graph.py
      schedules.py
  modules/
    auth/
      service.py                 # hash_password, verify_password, create_token, decode_token
    agents/
      service.py                 # AgentService
    tasks/
      service.py                 # TaskService
    graph/
      service.py                 # GraphService (nodes + edges query)
    scheduler/
      service.py                 # SchedulerService (APScheduler + Redis)
      worker.py                  # run_agent_tick(agent_id) — fetches context, calls connector, executes actions
  connectors/
    base.py                      # BaseConnector ABC, AgentContext, Action dataclasses
    http/
      connector.py               # HTTPConnector (OpenRouter-compatible)
    opencode/
      connector.py               # OpenCodeConnector (headless CLI)
  alembic/
    env.py
    versions/
      001_initial_schema.py
tests/
  conftest.py                    # engine, db (transaction rollback), client fixtures
  test_auth.py
  test_agents.py
  test_tasks.py
  test_graph.py
  test_schedules.py
  test_http_connector.py
  test_opencode_connector.py
  test_worker.py
requirements.txt
requirements-dev.txt
Dockerfile
docker-compose.yml
.env.example
pyproject.toml                   # pytest config
```

---

## Task 1: Project scaffold

**Files:**
- Create: `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`
- Create: `graphait/__init__.py`, `graphait/config.py`, `graphait/database.py`, `graphait/main.py`
- Create: `Dockerfile`, `.env.example`

- [ ] **Create `requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
sqlalchemy==2.0.36
alembic==1.14.0
psycopg2-binary==2.9.10
redis==5.2.1
apscheduler==3.10.4
pydantic-settings==2.6.1
pydantic[email]==2.10.3
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.20
httpx==0.28.1
cryptography==43.0.3
```

- [ ] **Create `requirements-dev.txt`**

```
pytest==8.3.4
pytest-cov==6.0.0
httpx==0.28.1
```

- [ ] **Create `pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
```

- [ ] **Create `graphait/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://graphait:graphait@db:5432/graphait"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "change-me-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Create `graphait/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from graphait.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Create `graphait/main.py`**

```python
from fastapi import FastAPI
from graphait.api.v1.router import router


def create_app() -> FastAPI:
    app = FastAPI(title="Graphait", version="0.1.0")
    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
```

- [ ] **Create `graphait/api/v1/router.py`** (skeleton, expanded in later tasks)

```python
from fastapi import APIRouter
from graphait.api.v1 import auth, agents, tasks, graph, schedules

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(graph.router, prefix="/graph", tags=["graph"])
router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
```

- [ ] **Create empty module files** (`__init__.py` in each package)

```bash
mkdir -p graphait/{models,schemas,api/v1,modules/{auth,agents,tasks,graph,scheduler},connectors/{http,opencode}}
touch graphait/__init__.py \
      graphait/models/__init__.py \
      graphait/schemas/__init__.py \
      graphait/api/__init__.py \
      graphait/api/v1/__init__.py \
      graphait/modules/auth/__init__.py \
      graphait/modules/agents/__init__.py \
      graphait/modules/tasks/__init__.py \
      graphait/modules/graph/__init__.py \
      graphait/modules/scheduler/__init__.py \
      graphait/connectors/__init__.py \
      graphait/connectors/http/__init__.py \
      graphait/connectors/opencode/__init__.py
```

- [ ] **Create `Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "graphait.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Create `.env.example`**

```
DATABASE_URL=postgresql://graphait:graphait@localhost:5432/graphait
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-me-in-production-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

- [ ] **Verify app starts**

```bash
pip install -r requirements.txt -r requirements-dev.txt
uvicorn graphait.main:app --reload
# Expected: INFO: Application startup complete.
curl http://localhost:8000/api/v1/auth/
# Expected: 404 or empty (routes not yet defined)
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: scaffold fastapi project structure"
```

---

## Task 2: Alembic init + Organization + User models

**Files:**
- Create: `graphait/models/organization.py`, `graphait/models/user.py`
- Create: `alembic/env.py`, `alembic/versions/001_initial_schema.py`
- Modify: `graphait/models/__init__.py`

- [ ] **Create `graphait/models/organization.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.user import User
    from graphait.models.agent import Agent


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    settings: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list[User]] = relationship("User", back_populates="organization")
    agents: Mapped[list[Agent]] = relationship("Agent", back_populates="organization")
```

- [ ] **Create `graphait/models/user.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
import enum
from sqlalchemy import String, DateTime, func, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.member)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship("Organization", back_populates="users")
    agent: Mapped[Optional[Agent]] = relationship("Agent", back_populates="user", uselist=False)
```

- [ ] **Update `graphait/models/__init__.py`** (Alembic needs all models imported here)

```python
from graphait.models.organization import Organization
from graphait.models.user import User
```

- [ ] **Init Alembic**

```bash
alembic init alembic
```

- [ ] **Update `alembic/env.py`** — replace the `target_metadata` block:

```python
from graphait.database import Base
import graphait.models  # noqa: F401 — triggers all model imports

target_metadata = Base.metadata

# Also update the `run_migrations_online` function to use config url:
# connectable = create_engine(config.get_main_option("sqlalchemy.url"))
```

At the top of `alembic/env.py`, add before `target_metadata`:
```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

- [ ] **Create `alembic.ini`** — set `sqlalchemy.url`:

```ini
sqlalchemy.url = postgresql://graphait:graphait@localhost:5432/graphait
```

- [ ] **Generate first migration**

```bash
alembic revision --autogenerate -m "initial schema"
# Creates alembic/versions/XXXX_initial_schema.py — review it, should have organizations + users tables
```

- [ ] **Write failing test**

Create `tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from graphait.database import Base, get_db
from graphait.main import create_app

TEST_DB_URL = "postgresql://graphait:graphait@localhost:5432/graphait_test"


@pytest.fixture(scope="session")
def engine():
    e = create_engine(TEST_DB_URL)
    Base.metadata.create_all(bind=e)
    yield e
    Base.metadata.drop_all(bind=e)


@pytest.fixture()
def db(engine):
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
```

Create `tests/test_auth.py` (first test — will fail until Task 6):
```python
def test_health(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
```

- [ ] **Run — expect failure** (route not defined yet)

```bash
createdb graphait_test  # run once
pytest tests/test_auth.py -v
# Expected: FAIL — 404 Not Found (route not yet defined)
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: organization + user models, alembic init"
```

---

## Task 3: Agent + AgentRelationship models

**Files:**
- Create: `graphait/models/agent.py`
- Modify: `graphait/models/__init__.py`

- [ ] **Create `graphait/models/agent.py`**

```python
from __future__ import annotations
import uuid
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.organization import Organization
    from graphait.models.user import User
    from graphait.models.task import Task
    from graphait.models.schedule import AgentSchedule


class AgentType(str, enum.Enum):
    human = "human"
    ai = "ai"


class RelationshipType(str, enum.Enum):
    reports_to = "reports_to"
    collaborates_with = "collaborates_with"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # FK added in M3
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_title: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AgentType] = mapped_column(Enum(AgentType), nullable=False)
    connector_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    connector_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    authority_scope: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship("Organization", back_populates="agents")
    user: Mapped[Optional[User]] = relationship("User", back_populates="agent")
    schedule: Mapped[Optional[AgentSchedule]] = relationship("AgentSchedule", back_populates="agent", uselist=False)

    outgoing_relationships: Mapped[list[AgentRelationship]] = relationship(
        "AgentRelationship", foreign_keys="AgentRelationship.from_agent_id", back_populates="from_agent"
    )
    incoming_relationships: Mapped[list[AgentRelationship]] = relationship(
        "AgentRelationship", foreign_keys="AgentRelationship.to_agent_id", back_populates="to_agent"
    )


class AgentRelationship(Base):
    __tablename__ = "agent_relationships"
    __table_args__ = (UniqueConstraint("from_agent_id", "to_agent_id", "type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    to_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[RelationshipType] = mapped_column(Enum(RelationshipType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    from_agent: Mapped[Agent] = relationship("Agent", foreign_keys=[from_agent_id], back_populates="outgoing_relationships")
    to_agent: Mapped[Agent] = relationship("Agent", foreign_keys=[to_agent_id], back_populates="incoming_relationships")
```

- [ ] **Update `graphait/models/__init__.py`**

```python
from graphait.models.organization import Organization
from graphait.models.user import User
from graphait.models.agent import Agent, AgentRelationship
```

- [ ] **Generate migration**

```bash
alembic revision --autogenerate -m "add agents and relationships"
alembic upgrade head  # apply to dev db
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: agent + agent_relationship models"
```

---

## Task 4: Task + Comment + Attachment + AgentSchedule models

**Files:**
- Create: `graphait/models/task.py`, `graphait/models/schedule.py`
- Modify: `graphait/models/__init__.py`

- [ ] **Create `graphait/models/task.py`**

```python
from __future__ import annotations
import uuid
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Boolean, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.agent import Agent


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"
    cancelled = "cancelled"
    waiting_approval = "waiting_approval"
    approved = "approved"
    rejected = "rejected"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskType(str, enum.Enum):
    task = "task"
    approval_request = "approval_request"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # set by trigger/service
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), nullable=False, default=TaskStatus.todo)
    priority: Mapped[TaskPriority] = mapped_column(Enum(TaskPriority), nullable=False, default=TaskPriority.medium)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), nullable=False, default=TaskType.task)
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    creator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assignee: Mapped[Optional[Agent]] = relationship("Agent", foreign_keys=[assignee_id])
    creator: Mapped[Agent] = relationship("Agent", foreign_keys=[creator_id])
    subtasks: Mapped[list[Task]] = relationship("Task", foreign_keys=[parent_task_id])
    comments: Mapped[list[Comment]] = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    attachments: Mapped[list[Attachment]] = relationship("Attachment", back_populates="task", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="comments")
    author: Mapped[Agent] = relationship("Agent")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    comment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="attachments")
```

- [ ] **Create `graphait/models/schedule.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import DateTime, func, ForeignKey, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.agent import Agent


class AgentSchedule(Base):
    __tablename__ = "agent_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False)
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    agent: Mapped[Agent] = relationship("Agent", back_populates="schedule")
```

- [ ] **Update `graphait/models/__init__.py`**

```python
from graphait.models.organization import Organization
from graphait.models.user import User
from graphait.models.agent import Agent, AgentRelationship
from graphait.models.task import Task, Comment, Attachment
from graphait.models.schedule import AgentSchedule
```

- [ ] **Generate and apply migration**

```bash
alembic revision --autogenerate -m "add tasks comments attachments schedules"
alembic upgrade head
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: task, comment, attachment, agent_schedule models"
```

---

## Task 5: Auth service

**Files:**
- Create: `graphait/modules/auth/service.py`

- [ ] **Write failing test** — `tests/test_auth.py`

```python
from graphait.modules.auth.service import hash_password, verify_password, create_access_token, decode_access_token


def test_hash_and_verify_password():
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_and_decode_token():
    token = create_access_token({"sub": "user-id-123"})
    payload = decode_access_token(token)
    assert payload["sub"] == "user-id-123"


def test_decode_invalid_token_returns_none():
    result = decode_access_token("not.a.real.token")
    assert result is None
```

- [ ] **Run — expect FAIL**

```bash
pytest tests/test_auth.py::test_hash_and_verify_password -v
# Expected: FAIL — ImportError
```

- [ ] **Create `graphait/modules/auth/service.py`**

```python
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from graphait.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_auth.py::test_hash_and_verify_password tests/test_auth.py::test_create_and_decode_token tests/test_auth.py::test_decode_invalid_token_returns_none -v
```

- [ ] **Commit**

```bash
git add graphait/modules/auth/service.py tests/test_auth.py
git commit -m "feat: auth service — password hashing + JWT"
```

---

## Task 6: Auth API (register org+user, login, /me)

**Files:**
- Create: `graphait/schemas/organization.py`, `graphait/schemas/user.py`
- Create: `graphait/api/deps.py`, `graphait/api/v1/auth.py`

- [ ] **Create `graphait/schemas/organization.py`**

```python
import uuid
from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    slug: str


class OrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}
```

- [ ] **Create `graphait/schemas/user.py`**

```python
import uuid
from pydantic import BaseModel, EmailStr
from graphait.models.user import UserRole


class RegisterRequest(BaseModel):
    org_name: str
    org_slug: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    org_id: uuid.UUID

    model_config = {"from_attributes": True}
```

- [ ] **Create `graphait/api/deps.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.modules.auth.service import decode_access_token
from graphait.models.user import User

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

- [ ] **Create `graphait/api/v1/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.models.organization import Organization
from graphait.models.user import User
from graphait.modules.auth.service import hash_password, verify_password, create_access_token
from graphait.schemas.user import RegisterRequest, LoginRequest, TokenResponse, UserRead
from graphait.api.deps import get_current_user
import uuid

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(Organization).filter(Organization.slug == body.org_slug).first():
        raise HTTPException(status_code=400, detail="Org slug already taken")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    org = Organization(name=body.org_name, slug=body.org_slug)
    db.add(org)
    db.flush()
    user = User(org_id=org.id, email=body.email, password_hash=hash_password(body.password), role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Write failing tests** — add to `tests/test_auth.py`

```python
def test_register_creates_org_and_user(client):
    resp = client.post("/api/v1/auth/register", json={
        "org_name": "Acme Corp",
        "org_slug": "acme",
        "email": "admin@acme.com",
        "password": "secret123"
    })
    assert resp.status_code == 201
    assert "access_token" in resp.json()


def test_login_returns_token(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Beta Inc",
        "org_slug": "beta",
        "email": "user@beta.com",
        "password": "pass456"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "user@beta.com", "password": "pass456"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password_returns_401(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Gamma Ltd",
        "org_slug": "gamma",
        "email": "user@gamma.com",
        "password": "correct"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "user@gamma.com", "password": "wrong"})
    assert resp.status_code == 401


def test_me_returns_current_user(client):
    reg = client.post("/api/v1/auth/register", json={
        "org_name": "Delta Co",
        "org_slug": "delta",
        "email": "me@delta.com",
        "password": "mypass"
    })
    token = reg.json()["access_token"]
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@delta.com"


def test_me_without_token_returns_401(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 403  # HTTPBearer returns 403 when no credentials
```

- [ ] **Add empty router files** so imports don't fail

```python
# graphait/api/v1/agents.py
from fastapi import APIRouter
router = APIRouter()

# graphait/api/v1/tasks.py
from fastapi import APIRouter
router = APIRouter()

# graphait/api/v1/graph.py
from fastapi import APIRouter
router = APIRouter()

# graphait/api/v1/schedules.py
from fastapi import APIRouter
router = APIRouter()
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_auth.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: auth API — register, login, /me"
```

---

## Task 7: Agent CRUD API

**Files:**
- Create: `graphait/schemas/agent.py`, `graphait/modules/agents/service.py`
- Modify: `graphait/api/v1/agents.py`

- [ ] **Create `graphait/schemas/agent.py`**

```python
import uuid
from typing import Optional
from pydantic import BaseModel
from graphait.models.agent import AgentType


class AgentCreate(BaseModel):
    name: str
    role_title: str
    type: AgentType
    connector_type: Optional[str] = None
    connector_config: Optional[dict] = None
    system_prompt: Optional[str] = None
    authority_scope: Optional[dict] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    connector_type: Optional[str] = None
    connector_config: Optional[dict] = None
    system_prompt: Optional[str] = None
    authority_scope: Optional[dict] = None
    is_active: Optional[bool] = None


class AgentRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    role_title: str
    type: AgentType
    connector_type: Optional[str]
    system_prompt: Optional[str]
    authority_scope: Optional[dict]
    is_active: bool

    model_config = {"from_attributes": True}
```

- [ ] **Create `graphait/modules/agents/service.py`**

```python
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
```

- [ ] **Update `graphait/api/v1/agents.py`**

```python
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
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("", response_model=AgentRead, status_code=201)
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


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = _get_agent_or_404(agent_id, current_user, db)
    agent_service.delete(db, agent)
```

- [ ] **Write failing tests** — create `tests/test_agents.py`

```python
import pytest


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Test Org", "org_slug": "testorg",
        "email": "test@org.com", "password": "pass"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "test@org.com", "password": "pass"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_agent(client, auth_headers):
    resp = client.post("/api/v1/agents", json={
        "name": "CEO Agent", "role_title": "CEO", "type": "ai",
        "connector_type": "http"
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["role_title"] == "CEO"


def test_list_agents(client, auth_headers):
    client.post("/api/v1/agents", json={"name": "A", "role_title": "CTO", "type": "ai"}, headers=auth_headers)
    resp = client.get("/api/v1/agents", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_update_agent(client, auth_headers):
    create_resp = client.post("/api/v1/agents", json={"name": "Old Name", "role_title": "Dev", "type": "human"}, headers=auth_headers)
    agent_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/agents/{agent_id}", json={"name": "New Name"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_delete_agent(client, auth_headers):
    create_resp = client.post("/api/v1/agents", json={"name": "Temp", "role_title": "Temp", "type": "ai"}, headers=auth_headers)
    agent_id = create_resp.json()["id"]
    resp = client.delete(f"/api/v1/agents/{agent_id}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get(f"/api/v1/agents/{agent_id}", headers=auth_headers).status_code == 404


def test_get_agent_from_other_org_returns_404(client):
    # Register two orgs
    client.post("/api/v1/auth/register", json={"org_name": "Org1", "org_slug": "org1", "email": "a@org1.com", "password": "p"})
    r1 = client.post("/api/v1/auth/login", json={"email": "a@org1.com", "password": "p"})
    h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}

    client.post("/api/v1/auth/register", json={"org_name": "Org2", "org_slug": "org2", "email": "b@org2.com", "password": "p"})
    r2 = client.post("/api/v1/auth/login", json={"email": "b@org2.com", "password": "p"})
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

    agent_resp = client.post("/api/v1/agents", json={"name": "Secret", "role_title": "CEO", "type": "ai"}, headers=h1)
    agent_id = agent_resp.json()["id"]

    resp = client.get(f"/api/v1/agents/{agent_id}", headers=h2)
    assert resp.status_code == 404
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_agents.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: agent CRUD API"
```

---

## Task 8: AgentRelationship + Graph data API

**Files:**
- Create: `graphait/schemas/graph.py`, `graphait/modules/graph/service.py`
- Modify: `graphait/api/v1/graph.py`, `graphait/api/v1/agents.py`

- [ ] **Create `graphait/schemas/graph.py`**

```python
import uuid
from pydantic import BaseModel
from graphait.models.agent import RelationshipType, AgentType


class RelationshipCreate(BaseModel):
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType


class RelationshipRead(BaseModel):
    id: uuid.UUID
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType

    model_config = {"from_attributes": True}


class GraphNode(BaseModel):
    id: uuid.UUID
    name: str
    role_title: str
    type: AgentType
    is_active: bool


class GraphEdge(BaseModel):
    id: uuid.UUID
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    type: RelationshipType


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
```

- [ ] **Create `graphait/modules/graph/service.py`**

```python
import uuid
from sqlalchemy.orm import Session
from graphait.models.agent import Agent, AgentRelationship
from graphait.schemas.graph import RelationshipCreate, GraphData, GraphNode, GraphEdge


class GraphService:
    def create_relationship(self, db: Session, org_id: uuid.UUID, data: RelationshipCreate) -> AgentRelationship:
        from_agent = db.query(Agent).filter(Agent.id == data.from_agent_id, Agent.org_id == org_id).first()
        to_agent = db.query(Agent).filter(Agent.id == data.to_agent_id, Agent.org_id == org_id).first()
        if not from_agent or not to_agent:
            raise ValueError("One or both agents not found in this org")
        rel = AgentRelationship(from_agent_id=data.from_agent_id, to_agent_id=data.to_agent_id, type=data.type)
        db.add(rel)
        db.commit()
        db.refresh(rel)
        return rel

    def delete_relationship(self, db: Session, rel_id: uuid.UUID, org_id: uuid.UUID) -> bool:
        rel = db.query(AgentRelationship).join(
            Agent, AgentRelationship.from_agent_id == Agent.id
        ).filter(AgentRelationship.id == rel_id, Agent.org_id == org_id).first()
        if not rel:
            return False
        db.delete(rel)
        db.commit()
        return True

    def get_graph_data(self, db: Session, org_id: uuid.UUID) -> GraphData:
        agents = db.query(Agent).filter(Agent.org_id == org_id).all()
        agent_ids = {a.id for a in agents}
        rels = db.query(AgentRelationship).filter(
            AgentRelationship.from_agent_id.in_(agent_ids)
        ).all()
        nodes = [GraphNode(id=a.id, name=a.name, role_title=a.role_title, type=a.type, is_active=a.is_active) for a in agents]
        edges = [GraphEdge(id=r.id, from_agent_id=r.from_agent_id, to_agent_id=r.to_agent_id, type=r.type) for r in rels]
        return GraphData(nodes=nodes, edges=edges)


graph_service = GraphService()
```

- [ ] **Update `graphait/api/v1/graph.py`**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.modules.graph.service import graph_service
from graphait.schemas.graph import RelationshipCreate, RelationshipRead, GraphData

router = APIRouter()


@router.get("", response_model=GraphData)
def get_graph(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return graph_service.get_graph_data(db, current_user.org_id)


@router.post("/relationships", response_model=RelationshipRead, status_code=201)
def create_relationship(body: RelationshipCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return graph_service.create_relationship(db, current_user.org_id, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/relationships/{rel_id}", status_code=204)
def delete_relationship(rel_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not graph_service.delete_relationship(db, rel_id, current_user.org_id):
        raise HTTPException(status_code=404, detail="Relationship not found")
```

- [ ] **Write failing tests** — create `tests/test_graph.py`

```python
import pytest


@pytest.fixture()
def org_with_agents(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Graph Org", "org_slug": "graphorg",
        "email": "graph@org.com", "password": "pass"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "graph@org.com", "password": "pass"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    ceo = client.post("/api/v1/agents", json={"name": "CEO", "role_title": "CEO", "type": "ai"}, headers=headers).json()
    cto = client.post("/api/v1/agents", json={"name": "CTO", "role_title": "CTO", "type": "ai"}, headers=headers).json()
    return headers, ceo, cto


def test_create_relationship(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    resp = client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"],
        "to_agent_id": ceo["id"],
        "type": "reports_to"
    }, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["type"] == "reports_to"


def test_get_graph_returns_nodes_and_edges(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"], "to_agent_id": ceo["id"], "type": "reports_to"
    }, headers=headers)
    resp = client.get("/api/v1/graph", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1


def test_delete_relationship(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    rel = client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"], "to_agent_id": ceo["id"], "type": "reports_to"
    }, headers=headers).json()
    resp = client.delete(f"/api/v1/graph/relationships/{rel['id']}", headers=headers)
    assert resp.status_code == 204
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_graph.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: graph API — relationships + graph data endpoint"
```

---

## Task 9: Task CRUD API

**Files:**
- Create: `graphait/schemas/task.py`, `graphait/modules/tasks/service.py`
- Modify: `graphait/api/v1/tasks.py`

- [ ] **Create `graphait/schemas/task.py`**

```python
import uuid
from typing import Optional
from pydantic import BaseModel
from graphait.models.task import TaskStatus, TaskPriority, TaskType


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    task_type: TaskType = TaskType.task
    assignee_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[uuid.UUID] = None


class TaskRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    number: Optional[int]
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    task_type: TaskType
    assignee_id: Optional[uuid.UUID]
    creator_id: uuid.UUID
    parent_task_id: Optional[uuid.UUID]

    model_config = {"from_attributes": True}
```

- [ ] **Create `graphait/modules/tasks/service.py`**

```python
import uuid
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from graphait.models.task import Task
from graphait.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    def _next_number(self, db: Session, org_id: uuid.UUID) -> int:
        result = db.query(func.max(Task.number)).filter(Task.org_id == org_id).scalar()
        return (result or 0) + 1

    def create(self, db: Session, org_id: uuid.UUID, creator_id: uuid.UUID, data: TaskCreate) -> Task:
        task = Task(
            org_id=org_id,
            creator_id=creator_id,
            number=self._next_number(db, org_id),
            **data.model_dump(),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def get(self, db: Session, task_id: uuid.UUID, org_id: uuid.UUID) -> Optional[Task]:
        return db.query(Task).filter(Task.id == task_id, Task.org_id == org_id).first()

    def list(self, db: Session, org_id: uuid.UUID, assignee_id: Optional[uuid.UUID] = None) -> list[Task]:
        q = db.query(Task).filter(Task.org_id == org_id)
        if assignee_id:
            q = q.filter(Task.assignee_id == assignee_id)
        return q.order_by(Task.created_at.desc()).all()

    def update(self, db: Session, task: Task, data: TaskUpdate) -> Task:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(task, field, value)
        db.commit()
        db.refresh(task)
        return task

    def delete(self, db: Session, task: Task) -> None:
        db.delete(task)
        db.commit()


task_service = TaskService()
```

- [ ] **Update `graphait/api/v1/tasks.py`**

```python
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.modules.tasks.service import task_service
from graphait.modules.agents.service import agent_service
from graphait.schemas.task import TaskCreate, TaskUpdate, TaskRead

router = APIRouter()


def _require_agent(user: User, db: Session) -> uuid.UUID:
    """Returns the agent_id linked to the current user, or raises 400."""
    from graphait.models.agent import Agent
    agent = db.query(Agent).filter(Agent.user_id == user.id).first()
    if not agent:
        raise HTTPException(status_code=400, detail="User has no linked agent — create a human agent first")
    return agent.id


def _get_task_or_404(task_id: uuid.UUID, user: User, db: Session) -> "Task":
    task = task_service.get(db, task_id, user.org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskRead, status_code=201)
def create_task(body: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    creator_id = _require_agent(current_user, db)
    return task_service.create(db, current_user.org_id, creator_id, body)


@router.get("", response_model=list[TaskRead])
def list_tasks(
    assignee_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return task_service.list(db, current_user.org_id, assignee_id)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_task_or_404(task_id, current_user, db)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    return task_service.update(db, task, body)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    task_service.delete(db, task)
```

- [ ] **Write failing tests** — create `tests/test_tasks.py`

```python
import pytest


@pytest.fixture()
def setup(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Task Org", "org_slug": "taskorg",
        "email": "tasks@org.com", "password": "pass"
    })
    r = client.post("/api/v1/auth/login", json={"email": "tasks@org.com", "password": "pass"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    agent = client.post("/api/v1/agents", json={
        "name": "Alice", "role_title": "PM", "type": "human"
    }, headers=headers).json()
    # Link user to agent by patching user_id on agent (done via direct DB in real setup,
    # here we expose a helper endpoint in auth for linking — see note below)
    return headers, agent


def test_create_task(client, setup):
    headers, agent = setup
    # First we need to link the user to the agent.
    # Update agent to set user_id = current user's id
    me = client.get("/api/v1/auth/me", headers=headers).json()
    client.patch(f"/api/v1/agents/{agent['id']}", json={"user_id": me["id"]}, headers=headers)
    resp = client.post("/api/v1/tasks", json={"title": "Fix bug #1", "priority": "high"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["title"] == "Fix bug #1"
    assert resp.json()["number"] == 1


def test_list_tasks(client, setup):
    headers, agent = setup
    me = client.get("/api/v1/auth/me", headers=headers).json()
    client.patch(f"/api/v1/agents/{agent['id']}", json={"user_id": me["id"]}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "Task A"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "Task B"}, headers=headers)
    resp = client.get("/api/v1/tasks", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


def test_update_task_status(client, setup):
    headers, agent = setup
    me = client.get("/api/v1/auth/me", headers=headers).json()
    client.patch(f"/api/v1/agents/{agent['id']}", json={"user_id": me["id"]}, headers=headers)
    task = client.post("/api/v1/tasks", json={"title": "Do thing"}, headers=headers).json()
    resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "in_progress"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"
```

> **Note:** `AgentUpdate` needs to accept `user_id` field to link user→agent. Add `user_id: Optional[uuid.UUID] = None` to `AgentUpdate` schema and handle it in `AgentService.update`.

- [ ] **Add `user_id` to `AgentUpdate`** in `graphait/schemas/agent.py`

```python
class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    user_id: Optional[uuid.UUID] = None      # add this line
    connector_type: Optional[str] = None
    connector_config: Optional[dict] = None
    system_prompt: Optional[str] = None
    authority_scope: Optional[dict] = None
    is_active: Optional[bool] = None
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_tasks.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: task CRUD API"
```

---

## Task 10: Comment API

**Files:**
- Create: `graphait/schemas/comment.py`, `graphait/modules/tasks/comment_service.py`
- Modify: `graphait/api/v1/tasks.py`

- [ ] **Create `graphait/schemas/comment.py`**

```python
import uuid
from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str


class CommentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID
    content: str
    is_system: bool

    model_config = {"from_attributes": True}
```

- [ ] **Create `graphait/modules/tasks/comment_service.py`**

```python
import uuid
from sqlalchemy.orm import Session
from graphait.models.task import Comment
from graphait.schemas.comment import CommentCreate


class CommentService:
    def create(self, db: Session, task_id: uuid.UUID, author_id: uuid.UUID, data: CommentCreate, is_system: bool = False) -> Comment:
        comment = Comment(task_id=task_id, author_id=author_id, content=data.content, is_system=is_system)
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return comment

    def list(self, db: Session, task_id: uuid.UUID) -> list[Comment]:
        return db.query(Comment).filter(Comment.task_id == task_id).order_by(Comment.created_at).all()


comment_service = CommentService()
```

- [ ] **Add comment routes to `graphait/api/v1/tasks.py`**

Append to the existing router:
```python
from graphait.modules.tasks.comment_service import comment_service
from graphait.schemas.comment import CommentCreate, CommentRead


@router.get("/{task_id}/comments", response_model=list[CommentRead])
def list_comments(task_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    return comment_service.list(db, task_id)


@router.post("/{task_id}/comments", response_model=CommentRead, status_code=201)
def add_comment(task_id: uuid.UUID, body: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    author_id = _require_agent(current_user, db)
    return comment_service.create(db, task_id, author_id, body)
```

- [ ] **Write failing tests** — add to `tests/test_tasks.py`

```python
def test_add_and_list_comments(client, setup):
    headers, agent = setup
    me = client.get("/api/v1/auth/me", headers=headers).json()
    client.patch(f"/api/v1/agents/{agent['id']}", json={"user_id": me["id"]}, headers=headers)
    task = client.post("/api/v1/tasks", json={"title": "Commented task"}, headers=headers).json()
    client.post(f"/api/v1/tasks/{task['id']}/comments", json={"content": "First comment"}, headers=headers)
    resp = client.get(f"/api/v1/tasks/{task['id']}/comments", headers=headers)
    assert resp.status_code == 200
    assert resp.json()[0]["content"] == "First comment"
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_tasks.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: comment API"
```

---

## Task 11: AgentSchedule API

**Files:**
- Create: `graphait/api/v1/schedules.py`

- [ ] **Update `graphait/api/v1/schedules.py`**

```python
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
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

    model_config = {"from_attributes": True}


@router.post("", response_model=ScheduleRead, status_code=201)
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = agent_service.get(db, body.agent_id, current_user.org_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.type != "ai":
        raise HTTPException(status_code=400, detail="Schedules only for AI agents")
    if agent.schedule:
        raise HTTPException(status_code=409, detail="Schedule already exists")
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
        raise HTTPException(status_code=404, detail="Schedule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    return schedule
```

- [ ] **Write failing tests** — create `tests/test_schedules.py`

```python
import pytest


@pytest.fixture()
def ai_agent_setup(client):
    client.post("/api/v1/auth/register", json={"org_name": "Sched Org", "org_slug": "schedorg", "email": "s@org.com", "password": "p"})
    r = client.post("/api/v1/auth/login", json={"email": "s@org.com", "password": "p"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    agent = client.post("/api/v1/agents", json={"name": "Bot", "role_title": "Dev", "type": "ai", "connector_type": "http"}, headers=headers).json()
    return headers, agent


def test_create_schedule(client, ai_agent_setup):
    headers, agent = ai_agent_setup
    resp = client.post("/api/v1/schedules", json={"agent_id": agent["id"], "interval_seconds": 60}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["interval_seconds"] == 60


def test_cannot_schedule_human_agent(client, ai_agent_setup):
    headers, _ = ai_agent_setup
    human = client.post("/api/v1/agents", json={"name": "Bob", "role_title": "PM", "type": "human"}, headers=headers).json()
    resp = client.post("/api/v1/schedules", json={"agent_id": human["id"]}, headers=headers)
    assert resp.status_code == 400


def test_update_schedule(client, ai_agent_setup):
    headers, agent = ai_agent_setup
    sched = client.post("/api/v1/schedules", json={"agent_id": agent["id"]}, headers=headers).json()
    resp = client.patch(f"/api/v1/schedules/{sched['id']}", json={"is_enabled": False}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_enabled"] is False
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_schedules.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: agent schedule API"
```

---

## Task 12: BaseConnector + HTTP/OpenRouter connector

**Files:**
- Create: `graphait/connectors/base.py`, `graphait/connectors/http/connector.py`

- [ ] **Create `graphait/connectors/base.py`**

```python
from __future__ import annotations
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


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
```

- [ ] **Create `graphait/connectors/http/connector.py`**

```python
import json
import httpx
from graphait.connectors.base import BaseConnector, AgentContext, Action

SYSTEM_TEMPLATE = """You are {name}, a {role_title} in an AI-managed organization.
{system_prompt}

Authority scope: {authority_scope}
Supervisor: {supervisor}
Subordinates: {subordinates}

You will receive your current tasks and recent comments. Respond with a JSON object containing an "actions" array.
Each action has a "type" and "payload":
- {{"type": "comment", "payload": {{"task_id": "...", "content": "..."}}}}
- {{"type": "update_status", "payload": {{"task_id": "...", "status": "done|in_progress|in_review|cancelled"}}}}
- {{"type": "create_task", "payload": {{"title": "...", "description": "...", "assignee_id": "..."}}}}
- {{"type": "escalate", "payload": {{"task_id": "...", "message": "..."}}}}

Respond ONLY with valid JSON. No markdown fences."""

USER_TEMPLATE = """Your current tasks:
{tasks}

What actions will you take?"""


class HTTPConnector(BaseConnector):
    async def run(self, context: AgentContext, connector_config: dict) -> list[Action]:
        api_url = connector_config.get("api_url", "https://openrouter.ai/api/v1/chat/completions")
        api_key = connector_config.get("api_key", "")
        model = connector_config.get("model", "openai/gpt-4o-mini")

        system_msg = SYSTEM_TEMPLATE.format(
            name=context.agent_name,
            role_title=context.role_title,
            system_prompt=context.system_prompt or "",
            authority_scope=json.dumps(context.authority_scope or {}),
            supervisor=context.supervisor_name or "none (you are the top of hierarchy)",
            subordinates=", ".join(context.subordinate_names) or "none",
        )
        user_msg = USER_TEMPLATE.format(tasks=json.dumps(context.tasks, indent=2, default=str))

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                api_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ]},
            )
            resp.raise_for_status()

        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
        return [Action(type=a["type"], payload=a.get("payload", {})) for a in data.get("actions", [])]
```

- [ ] **Write failing tests** — create `tests/test_http_connector.py`

```python
import pytest
import json
import uuid
from unittest.mock import AsyncMock, patch
from graphait.connectors.http.connector import HTTPConnector
from graphait.connectors.base import AgentContext


def make_context():
    return AgentContext(
        agent_id=uuid.uuid4(),
        agent_name="Dev Bot",
        role_title="Developer",
        system_prompt="You fix bugs.",
        authority_scope={"create_tasks": True},
        tasks=[{"id": str(uuid.uuid4()), "title": "Fix login bug", "status": "todo", "comments": []}],
        subordinate_names=[],
        supervisor_name="CTO",
    )


@pytest.mark.asyncio
async def test_http_connector_parses_actions():
    connector = HTTPConnector()
    config = {"api_url": "https://fake.api/v1", "api_key": "test", "model": "test-model"}
    fake_response = {
        "choices": [{"message": {"content": json.dumps({
            "actions": [
                {"type": "comment", "payload": {"task_id": "abc", "content": "Working on it"}}
            ]
        })}}]
    }
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value.json.return_value = fake_response
        mock_post.return_value.raise_for_status = lambda: None
        actions = await connector.run(make_context(), config)

    assert len(actions) == 1
    assert actions[0].type == "comment"
    assert actions[0].payload["content"] == "Working on it"


@pytest.mark.asyncio
async def test_http_connector_handles_empty_actions():
    connector = HTTPConnector()
    config = {"api_url": "https://fake.api/v1", "api_key": "test", "model": "test-model"}
    fake_response = {"choices": [{"message": {"content": json.dumps({"actions": []})}}]}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value.json.return_value = fake_response
        mock_post.return_value.raise_for_status = lambda: None
        actions = await connector.run(make_context(), config)

    assert actions == []
```

Add to `requirements-dev.txt`:
```
pytest-asyncio==0.24.0
anyio==4.6.0
```

Add to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_http_connector.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: BaseConnector + HTTP/OpenRouter connector"
```

---

## Task 13: OpenCode headless CLI connector

**Files:**
- Create: `graphait/connectors/opencode/connector.py`

- [ ] **Create `graphait/connectors/opencode/connector.py`**

```python
import asyncio
import json
import tempfile
import os
from graphait.connectors.base import BaseConnector, AgentContext, Action

TASK_PROMPT_TEMPLATE = """You are {name}, a {role_title}.
{system_prompt}

Your current tasks (JSON):
{tasks}

Authority scope: {authority_scope}
Supervisor: {supervisor}
Subordinates: {subordinates}

Respond with a JSON object with an "actions" array. Each action:
- {{"type": "comment", "payload": {{"task_id": "...", "content": "..."}}}}
- {{"type": "update_status", "payload": {{"task_id": "...", "status": "done|in_progress|in_review"}}}}
- {{"type": "create_task", "payload": {{"title": "...", "description": "...", "assignee_id": "..."}}}}
- {{"type": "escalate", "payload": {{"task_id": "...", "message": "..."}}}}
Respond ONLY with valid JSON."""


class OpenCodeConnector(BaseConnector):
    async def run(self, context: AgentContext, connector_config: dict) -> list[Action]:
        opencode_bin = connector_config.get("binary", "opencode")
        model = connector_config.get("model", "")

        prompt = TASK_PROMPT_TEMPLATE.format(
            name=context.agent_name,
            role_title=context.role_title,
            system_prompt=context.system_prompt or "",
            tasks=json.dumps(context.tasks, indent=2, default=str),
            authority_scope=json.dumps(context.authority_scope or {}),
            supervisor=context.supervisor_name or "none",
            subordinates=", ".join(context.subordinate_names) or "none",
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(prompt)
            prompt_file = f.name

        try:
            cmd = [opencode_bin, "run", "--no-tty", "--output-format", "json"]
            if model:
                cmd += ["--model", model]
            cmd += ["--prompt-file", prompt_file]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, **connector_config.get("env", {})},
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        finally:
            os.unlink(prompt_file)

        if proc.returncode != 0:
            raise RuntimeError(f"OpenCode exited {proc.returncode}: {stderr.decode()[:500]}")

        output = stdout.decode().strip()
        # OpenCode may wrap output — find the JSON object
        start = output.find("{")
        if start == -1:
            return []
        data = json.loads(output[start:])
        return [Action(type=a["type"], payload=a.get("payload", {})) for a in data.get("actions", [])]
```

- [ ] **Write failing tests** — create `tests/test_opencode_connector.py`

```python
import pytest
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from graphait.connectors.opencode.connector import OpenCodeConnector
from graphait.connectors.base import AgentContext


def make_context():
    return AgentContext(
        agent_id=uuid.uuid4(),
        agent_name="Code Bot",
        role_title="Developer",
        system_prompt="Write code.",
        authority_scope={},
        tasks=[{"id": str(uuid.uuid4()), "title": "Implement login", "status": "todo", "comments": []}],
        subordinate_names=[],
        supervisor_name="CTO",
    )


@pytest.mark.asyncio
async def test_opencode_connector_parses_actions():
    connector = OpenCodeConnector()
    config = {"binary": "opencode", "model": "anthropic/claude-3-5-sonnet"}

    fake_stdout = json.dumps({"actions": [
        {"type": "update_status", "payload": {"task_id": "abc", "status": "in_progress"}}
    ]}).encode()

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.communicate = AsyncMock(return_value=(fake_stdout, b""))

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_proc):
        with patch("asyncio.wait_for", new_callable=AsyncMock, return_value=(fake_stdout, b"")):
            actions = await connector.run(make_context(), config)

    assert len(actions) == 1
    assert actions[0].type == "update_status"


@pytest.mark.asyncio
async def test_opencode_connector_raises_on_nonzero_exit():
    connector = OpenCodeConnector()
    config = {"binary": "opencode"}

    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.communicate = AsyncMock(return_value=(b"", b"error message"))

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_proc):
        with patch("asyncio.wait_for", new_callable=AsyncMock, return_value=(b"", b"error message")):
            with pytest.raises(RuntimeError, match="OpenCode exited 1"):
                await connector.run(make_context(), config)
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_opencode_connector.py -v
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: OpenCode headless CLI connector"
```

---

## Task 14: Agent execution worker

**Files:**
- Create: `graphait/modules/scheduler/worker.py`, `graphait/modules/scheduler/service.py`

- [ ] **Create `graphait/modules/scheduler/worker.py`**

```python
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from graphait.database import SessionLocal
from graphait.models.agent import Agent, AgentRelationship, RelationshipType
from graphait.models.task import Task, TaskStatus, Comment
from graphait.models.schedule import AgentSchedule
from graphait.connectors.base import AgentContext, Action
from graphait.connectors.http.connector import HTTPConnector
from graphait.connectors.opencode.connector import OpenCodeConnector
from graphait.modules.tasks.service import task_service
from graphait.modules.tasks.comment_service import comment_service
from graphait.schemas.task import TaskCreate
from graphait.schemas.comment import CommentCreate

logger = logging.getLogger(__name__)

CONNECTOR_MAP = {
    "http": HTTPConnector(),
    "opencode": OpenCodeConnector(),
}


def _build_context(db: Session, agent: Agent) -> AgentContext:
    tasks_q = db.query(Task).filter(
        Task.assignee_id == agent.id,
        Task.status.in_([TaskStatus.todo, TaskStatus.in_progress, TaskStatus.waiting_approval]),
    ).all()

    tasks_data = []
    for t in tasks_q:
        comments = db.query(Comment).filter(Comment.task_id == t.id).order_by(Comment.created_at).all()
        tasks_data.append({
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status.value,
            "priority": t.priority.value,
            "comments": [{"author": str(c.author_id), "content": c.content} for c in comments],
        })

    supervisor_rel = db.query(AgentRelationship).filter(
        AgentRelationship.from_agent_id == agent.id,
        AgentRelationship.type == RelationshipType.reports_to,
    ).first()
    supervisor_name = None
    if supervisor_rel:
        sup = db.get(Agent, supervisor_rel.to_agent_id)
        supervisor_name = sup.name if sup else None

    sub_rels = db.query(AgentRelationship).filter(
        AgentRelationship.to_agent_id == agent.id,
        AgentRelationship.type == RelationshipType.reports_to,
    ).all()
    subordinate_names = []
    for rel in sub_rels:
        sub = db.get(Agent, rel.from_agent_id)
        if sub:
            subordinate_names.append(sub.name)

    return AgentContext(
        agent_id=agent.id,
        agent_name=agent.name,
        role_title=agent.role_title,
        system_prompt=agent.system_prompt,
        authority_scope=agent.authority_scope,
        tasks=tasks_data,
        subordinate_names=subordinate_names,
        supervisor_name=supervisor_name,
    )


async def _execute_action(db: Session, agent: Agent, action: Action) -> None:
    try:
        if action.type == "comment":
            task = task_service.get(db, uuid.UUID(action.payload["task_id"]), agent.org_id)
            if task:
                comment_service.create(db, task.id, agent.id, CommentCreate(content=action.payload["content"]))

        elif action.type == "update_status":
            task = task_service.get(db, uuid.UUID(action.payload["task_id"]), agent.org_id)
            if task:
                from graphait.schemas.task import TaskUpdate
                task_service.update(db, task, TaskUpdate(status=action.payload["status"]))

        elif action.type == "create_task":
            task_service.create(db, agent.org_id, agent.id, TaskCreate(
                title=action.payload["title"],
                description=action.payload.get("description"),
                assignee_id=uuid.UUID(action.payload["assignee_id"]) if action.payload.get("assignee_id") else None,
            ))

        elif action.type == "escalate":
            from graphait.models.agent import AgentRelationship, RelationshipType
            rel = db.query(AgentRelationship).filter(
                AgentRelationship.from_agent_id == agent.id,
                AgentRelationship.type == RelationshipType.reports_to,
            ).first()
            if rel:
                task_service.create(db, agent.org_id, agent.id, TaskCreate(
                    title=f"[ESCALATION] from {agent.name}",
                    description=action.payload.get("message", ""),
                    assignee_id=rel.to_agent_id,
                    task_type="approval_request",
                ))
    except Exception as e:
        logger.error("Failed to execute action %s: %s", action.type, e)


async def run_agent_tick(agent_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        agent = db.get(Agent, agent_id)
        if not agent or not agent.is_active or agent.type != "ai":
            return
        if not agent.connector_type or agent.connector_type not in CONNECTOR_MAP:
            logger.warning("Agent %s has no valid connector", agent_id)
            return

        context = _build_context(db, agent)
        connector = CONNECTOR_MAP[agent.connector_type]
        actions = await connector.run(context, agent.connector_config or {})

        for action in actions:
            await _execute_action(db, agent, action)

        schedule = agent.schedule
        if schedule:
            schedule.last_run_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
```

- [ ] **Create `graphait/modules/scheduler/service.py`**

```python
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.redis import RedisJobStore
from graphait.config import settings
from graphait.modules.scheduler.worker import run_agent_tick

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        jobstores = {"default": RedisJobStore(jobs_key="graphait:jobs", run_times_key="graphait:run_times", url=settings.redis_url)}
        self._scheduler = BackgroundScheduler(jobstores=jobstores)

    def start(self) -> None:
        self._scheduler.start()
        logger.info("Scheduler started")

    def stop(self) -> None:
        self._scheduler.shutdown(wait=False)

    def schedule_agent(self, agent_id: uuid.UUID, interval_seconds: int) -> None:
        job_id = f"agent_{agent_id}"
        self._scheduler.add_job(
            _run_sync,
            "interval",
            seconds=interval_seconds,
            args=[agent_id],
            id=job_id,
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=interval_seconds),
        )

    def remove_agent(self, agent_id: uuid.UUID) -> None:
        job_id = f"agent_{agent_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)


def _run_sync(agent_id: uuid.UUID) -> None:
    asyncio.run(run_agent_tick(agent_id))


scheduler_service = SchedulerService()
```

- [ ] **Wire scheduler start/stop in `graphait/main.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from graphait.api.v1.router import router
from graphait.modules.scheduler.service import scheduler_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_service.start()
    yield
    scheduler_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Graphait", version="0.1.0", lifespan=lifespan)
    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
```

- [ ] **Write failing tests** — create `tests/test_worker.py`

```python
import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock
from graphait.modules.scheduler.worker import run_agent_tick, _execute_action
from graphait.connectors.base import Action


@pytest.mark.asyncio
async def test_run_agent_tick_skips_human_agents(db):
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent, AgentType

    org = Organization(name="Test", slug=f"test-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    human_agent = Agent(org_id=org.id, name="Bob", role_title="PM", type=AgentType.human)
    db.add(human_agent)
    db.commit()

    with patch("graphait.modules.scheduler.worker.CONNECTOR_MAP") as mock_map:
        await run_agent_tick(human_agent.id)
        mock_map.__getitem__.assert_not_called()


@pytest.mark.asyncio
async def test_run_agent_tick_calls_connector(db):
    from graphait.models.organization import Organization
    from graphait.models.agent import Agent, AgentType
    from graphait.models.schedule import AgentSchedule

    org = Organization(name="ConnOrg", slug=f"connorg-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    agent = Agent(org_id=org.id, name="Bot", role_title="Dev", type=AgentType.ai, connector_type="http", connector_config={"api_key": "k"})
    db.add(agent)
    db.flush()
    schedule = AgentSchedule(agent_id=agent.id)
    db.add(schedule)
    db.commit()

    mock_connector = AsyncMock()
    mock_connector.run.return_value = []

    with patch("graphait.modules.scheduler.worker.CONNECTOR_MAP", {"http": mock_connector}):
        with patch("graphait.modules.scheduler.worker.SessionLocal", return_value=db):
            await run_agent_tick(agent.id)

    mock_connector.run.assert_called_once()
```

- [ ] **Run — expect PASS**

```bash
pytest tests/test_worker.py -v
```

- [ ] **Run full test suite**

```bash
pytest tests/ -v --tb=short
# All tests should pass
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: agent execution worker + scheduler service"
```

---

## Task 15: Docker Compose finalization

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.override.yml` (dev overrides)

- [ ] **Update `docker-compose.yml`** (production-ready)

```yaml
version: "3.9"

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://graphait:graphait@db:5432/graphait
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY:-change-me-in-production}
      ACCESS_TOKEN_EXPIRE_MINUTES: ${ACCESS_TOKEN_EXPIRE_MINUTES:-1440}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: graphait
      POSTGRES_PASSWORD: graphait
      POSTGRES_DB: graphait
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U graphait"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Create `docker-compose.override.yml`** (dev: hot reload + exposed ports)

```yaml
version: "3.9"
services:
  api:
    volumes:
      - .:/app
    command: uvicorn graphait.main:app --host 0.0.0.0 --port 8000 --reload
  db:
    ports:
      - "5432:5432"
  redis:
    ports:
      - "6379:6379"
```

- [ ] **Add Alembic auto-migrate on startup** — update `Dockerfile`

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "alembic upgrade head && uvicorn graphait.main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Smoke test**

```bash
docker compose up --build
# Wait for: INFO: Application startup complete.
curl http://localhost:8000/api/v1/auth/me
# Expected: {"detail":"Not authenticated"} — 403
docker compose down
```

- [ ] **Commit**

```bash
git add .
git commit -m "feat: docker-compose finalization + alembic auto-migrate"
```

---

## Task 16: Full test suite + README

- [ ] **Run complete test suite**

```bash
pytest tests/ -v --tb=short --cov=graphait --cov-report=term-missing
# Aim: all tests pass, >70% coverage
```

- [ ] **Fix any failures** before proceeding

- [ ] **Create `README.md`**

```markdown
# Graphait

AI + human agent management platform. Agents form an organizational graph and synchronize work through a shared task board.

## Quick start

    cp .env.example .env
    docker compose up --build

API available at http://localhost:8000  
Docs at http://localhost:8000/docs

## Development

    pip install -r requirements.txt -r requirements-dev.txt
    createdb graphait graphait_test
    alembic upgrade head
    uvicorn graphait.main:app --reload

    pytest tests/ -v

## M1 Features

- Agent graph (CRUD + force-directed visualization data)
- Task board (create/assign/comment/status/subtasks)
- Connectors: HTTP/OpenRouter, OpenCode headless CLI
- Redis-backed agent scheduler
- JWT auth, single org
```

- [ ] **Final commit**

```bash
git add .
git commit -m "feat: complete M1 backend — all tests passing"
```

---

## Self-Review Notes

- `AgentUpdate.user_id` enables linking human agents to users — needed by task creator logic in Task 9
- OpenCode connector uses `--prompt-file` and `--no-tty` flags — verify against actual OpenCode docs before shipping; adjust flag names if needed
- `connector_config` is stored as plaintext jsonb in M1 — encryption (Fernet) is a M2 hardening task
- `Task.number` auto-increment uses `MAX(number) + 1` — not race-condition safe under concurrent creates; acceptable for M1, replace with DB sequence in M2
- Scheduler `_run_sync` uses `asyncio.run()` in a background thread — fine for APScheduler background threads, but monitor for event loop conflicts if uvicorn workers are increased
