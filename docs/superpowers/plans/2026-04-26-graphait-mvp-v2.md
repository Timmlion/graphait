# Graphait MVP v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Graphait to agent-first, config-as-code architecture — agents as JSON files, skills as markdown, AgentLoop executing via OpenRouter.

**Architecture:** FastAPI + SQLite. Agents defined in `config/agents/*.json`, skills in `config/skills/*.md`. DB holds only tasks/comments/users. APScheduler fires AgentLoop per agent. OpenRouter via httpx.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, Alembic, APScheduler, httpx, React/TypeScript

---

## File Map

**New files:**
- `graphait/config/loader.py` — AgentConfig/OrgConfig dataclasses + file CRUD
- `graphait/modules/agent/loop.py` — AgentLoop class
- `graphait/modules/agent/tools.py` — tool schemas + implementations
- `alembic/versions/v2_config_as_code.py` — drop agent tables, string FKs
- `tests/test_config_loader.py`
- `tests/test_tools.py`
- `tests/test_agent_loop.py`
- `frontend/src/api/skills.ts`
- `frontend/src/pages/SkillsPage.tsx`

**Modified files:**
- `tests/conftest.py` — SQLite in-memory
- `graphait/models/task.py` — String FKs (no agent table refs)
- `graphait/models/user.py` — add `agent_id: String`
- `graphait/models/__init__.py` — remove agent imports
- `graphait/schemas/task.py` — String assignee_id/creator_id
- `graphait/schemas/comment.py` — String author_id
- `graphait/schemas/agent.py` — file-config-based types
- `graphait/modules/tasks/service.py` — String creator_id
- `graphait/modules/tasks/comment_service.py` — String author_id
- `graphait/api/v1/agents.py` — file-backed CRUD
- `graphait/api/v1/skills.py` — new file-backed CRUD
- `graphait/api/v1/org.py` — reads/writes org.json
- `graphait/api/v1/tasks.py` — use user.agent_id, trigger scheduler on assign
- `graphait/api/v1/graph.py` — read from config files
- `graphait/api/v1/auth.py` — create human agent JSON on register
- `graphait/api/v1/router.py` — add skills, remove schedules
- `graphait/modules/scheduler/service.py` — String agent IDs, trigger_agent
- `graphait/modules/scheduler/worker.py` — rewrite to use AgentLoop
- `graphait/main.py` — init config dir, schedule agents on startup
- `frontend/src/api/agents.ts` — new Agent interface
- `frontend/src/api/org.ts` — add system_prompt/search_api_key
- `frontend/src/pages/GraphPage.tsx` — rewrite config panel
- `frontend/src/pages/SettingsPage.tsx` — org prompt + search key
- `frontend/src/App.tsx` — add /skills route

**Deleted:** `graphait/api/v1/schedules.py`, `graphait/modules/agents/service.py`, `graphait/modules/graph/service.py`, `graphait/schemas/graph.py`

---

## Task 1: Switch tests to SQLite in-memory

**Files:**
- Modify: `tests/conftest.py`

- [ ] **Step 1: Replace conftest.py**

```python
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-minimum-32-chars!!")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from graphait.database import Base, get_db
from graphait.main import create_app


@pytest.fixture(scope="session")
def engine():
    e = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=e)
    yield e
    Base.metadata.drop_all(bind=e)


@pytest.fixture()
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 2: Run auth tests to verify**

Run: `python -m pytest tests/test_auth.py -v`
Expected: PASS (register + login work)

- [ ] **Step 3: Commit**

```bash
git add tests/conftest.py
git commit -m "test: switch to SQLite in-memory fixtures"
```

---

## Task 2: Config loader

**Files:**
- Create: `graphait/config/__init__.py`
- Create: `graphait/config/loader.py`
- Create: `tests/test_config_loader.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_config_loader.py
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture()
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()
    return tmp_path / "config"


def test_init_creates_dirs(cfg_dir):
    assert (cfg_dir / "agents").is_dir()
    assert (cfg_dir / "skills").is_dir()
    assert (cfg_dir / "org.json").exists()


def test_save_and_load_agent(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, load_agent
    cfg = AgentConfig(id="test-dev", name="Test Dev", role_title="Developer",
                      type="ai", model="anthropic/claude-3-5-sonnet", api_key=None,
                      working_dir="./workspaces/test-dev", reports_to=None,
                      schedule_interval=300, schedule_enabled=True,
                      tools=["read_file"], skills=[], system_prompt="You are a dev.")
    save_agent(cfg)
    loaded = load_agent("test-dev")
    assert loaded is not None
    assert loaded.name == "Test Dev"
    assert loaded.tools == ["read_file"]


def test_load_missing_agent_returns_none(cfg_dir):
    from graphait.config.loader import load_agent
    assert load_agent("nonexistent") is None


def test_save_and_load_skill(cfg_dir):
    from graphait.config.loader import save_skill, load_skill
    save_skill("python-senior", "# Python\nBe excellent.")
    assert "Be excellent." in load_skill("python-senior")


def test_load_missing_skill_returns_none(cfg_dir):
    from graphait.config.loader import load_skill
    assert load_skill("nope") is None


def test_save_and_load_org(cfg_dir):
    from graphait.config.loader import OrgConfig, save_org, load_org
    save_org(OrgConfig(name="Acme", system_prompt="Build great.", openrouter_api_key="sk-test",
                       default_model="anthropic/claude-3-5-sonnet", search_api_key=None))
    assert load_org().openrouter_api_key == "sk-test"


def test_delete_agent(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, delete_agent, load_agent
    save_agent(AgentConfig(id="temp", name="Temp", role_title="R", type="ai",
                           model="x/y", api_key=None, working_dir="./w/temp",
                           reports_to=None, schedule_interval=300, schedule_enabled=True,
                           tools=[], skills=[], system_prompt=""))
    delete_agent("temp")
    assert load_agent("temp") is None


def test_list_agents(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, load_agents
    for slug in ["alpha", "beta"]:
        save_agent(AgentConfig(id=slug, name=slug.title(), role_title="R", type="ai",
                               model="x/y", api_key=None, working_dir=f"./w/{slug}",
                               reports_to=None, schedule_interval=300, schedule_enabled=True,
                               tools=[], skills=[], system_prompt=""))
    assert {a.id for a in load_agents()} == {"alpha", "beta"}
```

Run: `python -m pytest tests/test_config_loader.py -v`
Expected: FAIL with ImportError

- [ ] **Step 2: Create graphait/config/__init__.py**

```bash
mkdir -p graphait/config && touch graphait/config/__init__.py
```

- [ ] **Step 3: Create graphait/config/loader.py**

```python
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path("config")


@dataclass
class AgentConfig:
    id: str
    name: str
    role_title: str
    type: str               # "ai" | "human"
    model: str
    api_key: Optional[str]
    working_dir: str
    reports_to: Optional[str]
    schedule_interval: int
    schedule_enabled: bool
    tools: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    system_prompt: str = ""


@dataclass
class OrgConfig:
    name: str = ""
    system_prompt: str = ""
    openrouter_api_key: Optional[str] = None
    default_model: str = "anthropic/claude-sonnet-4-5"
    search_api_key: Optional[str] = None


def _agents_dir() -> Path:
    return CONFIG_DIR / "agents"


def _skills_dir() -> Path:
    return CONFIG_DIR / "skills"


def init_config_dir() -> None:
    _agents_dir().mkdir(parents=True, exist_ok=True)
    _skills_dir().mkdir(parents=True, exist_ok=True)
    org_file = CONFIG_DIR / "org.json"
    if not org_file.exists():
        org_file.write_text(json.dumps(asdict(OrgConfig()), indent=2))


def load_org() -> OrgConfig:
    p = CONFIG_DIR / "org.json"
    if not p.exists():
        return OrgConfig()
    data = json.loads(p.read_text())
    return OrgConfig(**{k: v for k, v in data.items() if k in OrgConfig.__dataclass_fields__})


def save_org(cfg: OrgConfig) -> None:
    (CONFIG_DIR / "org.json").write_text(json.dumps(asdict(cfg), indent=2))


def load_agents() -> list[AgentConfig]:
    if not _agents_dir().exists():
        return []
    result = []
    for p in sorted(_agents_dir().glob("*.json")):
        data = json.loads(p.read_text())
        result.append(AgentConfig(**{k: v for k, v in data.items()
                                     if k in AgentConfig.__dataclass_fields__}))
    return result


def load_agent(agent_id: str) -> Optional[AgentConfig]:
    p = _agents_dir() / f"{agent_id}.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    return AgentConfig(**{k: v for k, v in data.items()
                          if k in AgentConfig.__dataclass_fields__})


def save_agent(cfg: AgentConfig) -> None:
    _agents_dir().mkdir(parents=True, exist_ok=True)
    (_agents_dir() / f"{cfg.id}.json").write_text(json.dumps(asdict(cfg), indent=2))


def delete_agent(agent_id: str) -> None:
    p = _agents_dir() / f"{agent_id}.json"
    if p.exists():
        p.unlink()


def load_skill(slug: str) -> Optional[str]:
    p = _skills_dir() / f"{slug}.md"
    return p.read_text() if p.exists() else None


def save_skill(slug: str, content: str) -> None:
    _skills_dir().mkdir(parents=True, exist_ok=True)
    (_skills_dir() / f"{slug}.md").write_text(content)


def delete_skill(slug: str) -> None:
    p = _skills_dir() / f"{slug}.md"
    if p.exists():
        p.unlink()


def list_skills() -> list[dict]:
    if not _skills_dir().exists():
        return []
    return [
        {"id": p.stem, "name": p.stem.replace("-", " ").title(), "content": p.read_text()}
        for p in sorted(_skills_dir().glob("*.md"))
    ]
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_config_loader.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/config/ tests/test_config_loader.py
git commit -m "feat: config loader — agent/skill/org file CRUD"
```

---

## Task 3: Tools system

**Files:**
- Create: `graphait/modules/agent/__init__.py`
- Create: `graphait/modules/agent/tools.py`
- Create: `tests/test_tools.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_tools.py
from unittest.mock import MagicMock


def make_ctx(tmp_path):
    from graphait.modules.agent.tools import ToolContext
    return ToolContext(
        db=MagicMock(), org_id="00000000-0000-0000-0000-000000000001",
        task_id="00000000-0000-0000-0000-000000000002",
        agent_id="test-dev", working_dir=str(tmp_path / "workspace"),
    )


def test_get_tool_schemas_includes_always_on():
    from graphait.modules.agent.tools import get_tool_schemas, ALWAYS_ON_TOOLS
    names = [s["function"]["name"] for s in get_tool_schemas([])]
    for t in ALWAYS_ON_TOOLS:
        assert t in names


def test_get_tool_schemas_includes_optional():
    from graphait.modules.agent.tools import get_tool_schemas
    names = [s["function"]["name"] for s in get_tool_schemas(["read_file", "write_file"])]
    assert "read_file" in names and "write_file" in names


def test_write_and_read_file(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    result = execute_tool("write_file", {"path": "hello.txt", "content": "hello world"}, ctx)
    assert "hello.txt" in result or "written" in result.lower()
    assert "hello world" in execute_tool("read_file", {"path": "hello.txt"}, ctx)


def test_path_traversal_blocked(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    result = execute_tool("read_file", {"path": "../../etc/passwd"}, ctx)
    assert "error" in result.lower() or "not allowed" in result.lower()


def test_list_directory(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    execute_tool("write_file", {"path": "a.txt", "content": "a"}, ctx)
    execute_tool("write_file", {"path": "b.txt", "content": "b"}, ctx)
    result = execute_tool("list_directory", {}, ctx)
    assert "a.txt" in result and "b.txt" in result
```

Run: `python -m pytest tests/test_tools.py -v`
Expected: FAIL with ImportError

- [ ] **Step 2: Create module**

```bash
touch graphait/modules/agent/__init__.py
```

- [ ] **Step 3: Create graphait/modules/agent/tools.py**

```python
from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from sqlalchemy.orm import Session

ALWAYS_ON_TOOLS = ["post_comment", "update_status", "create_task", "assign_task"]

TOOL_SCHEMAS: dict[str, dict] = {
    "post_comment": {"type": "function", "function": {
        "name": "post_comment",
        "description": "Post a comment to the current task.",
        "parameters": {"type": "object",
                       "properties": {"content": {"type": "string"}},
                       "required": ["content"]}}},
    "update_status": {"type": "function", "function": {
        "name": "update_status",
        "description": "Set task status. Use 'done' when complete, 'blocked' when stuck.",
        "parameters": {"type": "object",
                       "properties": {
                           "status": {"type": "string",
                                      "enum": ["done", "blocked", "in_progress", "in_review", "cancelled"]},
                           "comment": {"type": "string"}},
                       "required": ["status"]}}},
    "create_task": {"type": "function", "function": {
        "name": "create_task",
        "description": "Create a new task, optionally assign to an agent by ID slug.",
        "parameters": {"type": "object",
                       "properties": {
                           "title": {"type": "string"},
                           "description": {"type": "string"},
                           "assignee_id": {"type": "string"},
                           "priority": {"type": "string",
                                        "enum": ["low", "medium", "high", "urgent"]}},
                       "required": ["title"]}}},
    "assign_task": {"type": "function", "function": {
        "name": "assign_task",
        "description": "Assign an existing task to an agent by ID slug.",
        "parameters": {"type": "object",
                       "properties": {
                           "task_id": {"type": "string"},
                           "assignee_id": {"type": "string"}},
                       "required": ["task_id", "assignee_id"]}}},
    "read_file": {"type": "function", "function": {
        "name": "read_file",
        "description": "Read a file from your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": ["path"]}}},
    "write_file": {"type": "function", "function": {
        "name": "write_file",
        "description": "Write or create a file in your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                       "required": ["path", "content"]}}},
    "list_directory": {"type": "function", "function": {
        "name": "list_directory",
        "description": "List files in your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": []}}},
    "web_search": {"type": "function", "function": {
        "name": "web_search",
        "description": "Search the web via Serper API.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]}}},
    "fetch_url": {"type": "function", "function": {
        "name": "fetch_url",
        "description": "HTTP GET a URL and return its text content.",
        "parameters": {"type": "object",
                       "properties": {"url": {"type": "string"}},
                       "required": ["url"]}}},
}


@dataclass
class ToolContext:
    db: Session
    org_id: str
    task_id: str
    agent_id: str
    working_dir: str
    search_api_key: str | None = None
    scheduler_trigger: Any = None


def get_tool_schemas(optional_tools: list[str]) -> list[dict]:
    schemas = [TOOL_SCHEMAS[n] for n in ALWAYS_ON_TOOLS if n in TOOL_SCHEMAS]
    for name in optional_tools:
        if name in TOOL_SCHEMAS and name not in ALWAYS_ON_TOOLS:
            schemas.append(TOOL_SCHEMAS[name])
    return schemas


def _safe_path(working_dir: str, relative: str) -> Path | None:
    base = Path(working_dir).resolve()
    target = (base / relative).resolve()
    return target if str(target).startswith(str(base)) else None


def execute_tool(name: str, args: dict, ctx: ToolContext) -> str:
    try:
        return _HANDLERS[name](args, ctx)
    except KeyError:
        return f"Error: unknown tool '{name}'"
    except Exception as e:
        return f"Error executing {name}: {e}"


def _post_comment(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Comment
    ctx.db.add(Comment(task_id=uuid.UUID(ctx.task_id), author_id=ctx.agent_id,
                       content=args["content"], is_system=False))
    ctx.db.commit()
    return "Comment posted."


def _update_status(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Task, Comment
    task = ctx.db.query(Task).filter(Task.id == uuid.UUID(ctx.task_id)).first()
    if not task:
        return "Error: task not found"
    task.status = args["status"]
    if args.get("comment"):
        ctx.db.add(Comment(task_id=task.id, author_id=ctx.agent_id,
                           content=args["comment"], is_system=False))
    ctx.db.commit()
    return f"Status updated to '{args['status']}'."


def _create_task(args: dict, ctx: ToolContext) -> str:
    import uuid
    from sqlalchemy import func
    from graphait.models.task import Task, TaskStatus, TaskPriority
    org_id = uuid.UUID(ctx.org_id)
    num = (ctx.db.query(func.max(Task.number)).filter(Task.org_id == org_id).scalar() or 0) + 1
    task = Task(org_id=org_id, title=args["title"], description=args.get("description"),
                creator_id=ctx.agent_id, assignee_id=args.get("assignee_id"),
                priority=TaskPriority(args.get("priority", "medium")),
                status=TaskStatus.todo, number=num)
    ctx.db.add(task)
    ctx.db.commit()
    ctx.db.refresh(task)
    if task.assignee_id and ctx.scheduler_trigger:
        ctx.scheduler_trigger(task.assignee_id)
    return f"Task #{task.number} created: '{task.title}'."


def _assign_task(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Task
    task = ctx.db.query(Task).filter(Task.id == uuid.UUID(args["task_id"])).first()
    if not task:
        return "Error: task not found"
    task.assignee_id = args["assignee_id"]
    ctx.db.commit()
    if ctx.scheduler_trigger:
        ctx.scheduler_trigger(args["assignee_id"])
    return f"Task assigned to '{args['assignee_id']}'."


def _read_file(args: dict, ctx: ToolContext) -> str:
    p = _safe_path(ctx.working_dir, args["path"])
    if p is None:
        return "Error: path traversal not allowed"
    return p.read_text(errors="replace") if p.exists() else f"Error: file not found: {args['path']}"


def _write_file(args: dict, ctx: ToolContext) -> str:
    p = _safe_path(ctx.working_dir, args["path"])
    if p is None:
        return "Error: path traversal not allowed"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(args["content"])
    return f"Written: {args['path']}"


def _list_directory(args: dict, ctx: ToolContext) -> str:
    sub = args.get("path", "")
    target = _safe_path(ctx.working_dir, sub) if sub else Path(ctx.working_dir).resolve()
    if target is None:
        return "Error: path traversal not allowed"
    if not target.exists():
        return f"Directory not found: {sub or '.'}"
    entries = sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name))
    return "\n".join(f"{'[dir] ' if e.is_dir() else '      '}{e.name}" for e in entries) or "(empty)"


def _web_search(args: dict, ctx: ToolContext) -> str:
    import httpx
    if not ctx.search_api_key:
        return "Error: search_api_key not configured in org.json"
    resp = httpx.post("https://google.serper.dev/search",
                      headers={"X-API-KEY": ctx.search_api_key, "Content-Type": "application/json"},
                      json={"q": args["query"], "num": 5}, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("organic", [])
    return "\n\n".join(
        f"{r.get('title')}\n{r.get('link')}\n{r.get('snippet', '')}" for r in results[:5]
    ) or "No results."


def _fetch_url(args: dict, ctx: ToolContext) -> str:
    import httpx
    resp = httpx.get(args["url"], timeout=15, follow_redirects=True,
                     headers={"User-Agent": "Graphait-Agent/1.0"})
    resp.raise_for_status()
    return resp.text[:8000]


_HANDLERS = {
    "post_comment": _post_comment, "update_status": _update_status,
    "create_task": _create_task, "assign_task": _assign_task,
    "read_file": _read_file, "write_file": _write_file,
    "list_directory": _list_directory, "web_search": _web_search,
    "fetch_url": _fetch_url,
}
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_tools.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/agent/ tests/test_tools.py
git commit -m "feat: tools system — always-on + optional tool implementations"
```

---

## Task 4: AgentLoop

**Files:**
- Create: `graphait/modules/agent/loop.py`
- Create: `tests/test_agent_loop.py`

- [ ] **Step 1: Install pytest-asyncio**

```bash
pip show pytest-asyncio || pip install pytest-asyncio
```

Add to `pytest.ini` or `pyproject.toml`:
```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 2: Write failing tests**

```python
# tests/test_agent_loop.py
import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_agent():
    from graphait.config.loader import AgentConfig
    return AgentConfig(id="test-dev", name="Test Dev", role_title="Developer",
                       type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
                       working_dir="/tmp/test-dev-loop", reports_to=None,
                       schedule_interval=300, schedule_enabled=True,
                       tools=["read_file"], skills=[], system_prompt="You are a dev.")


def make_org():
    from graphait.config.loader import OrgConfig
    return OrgConfig(name="Acme", system_prompt="Build quality software.",
                     openrouter_api_key="sk-org", default_model="anthropic/claude-3-5-sonnet")


def make_task(db):
    from graphait.models.task import Task, TaskStatus, TaskPriority
    task = Task(id=uuid.uuid4(), org_id=uuid.uuid4(), number=1, title="Write tests",
                description="Add unit tests.", status=TaskStatus.todo,
                priority=TaskPriority.high, creator_id="cto", assignee_id="test-dev")
    db.add(task)
    db.flush()
    return task


def mock_response(content=None, tool_calls=None):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
        msg["content"] = None
    return {"choices": [{"message": msg}]}


@pytest.mark.asyncio
async def test_loop_completes_on_text_response(db):
    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)
    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.return_value = AsyncMock(
            status_code=200,
            json=MagicMock(return_value=mock_response(content="Tests are done!")))
        await AgentLoop(make_agent(), make_org(), task, db).run()
    db.refresh(task)
    assert task.status.value == "done"


@pytest.mark.asyncio
async def test_loop_executes_tool_then_completes(db):
    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)
    tool_call = {"id": "call_1", "type": "function",
                 "function": {"name": "post_comment",
                              "arguments": json.dumps({"content": "Working on it."})}}
    responses = [mock_response(tool_calls=[tool_call]), mock_response(content="All done.")]
    idx = [0]

    async def fake_post(*a, **kw):
        r = AsyncMock()
        r.status_code = 200
        r.json = MagicMock(return_value=responses[min(idx[0], len(responses)-1)])
        idx[0] += 1
        return r

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post.side_effect = fake_post
        await AgentLoop(make_agent(), make_org(), task, db).run()

    db.refresh(task)
    assert task.status.value == "done"
    from graphait.models.task import Comment
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert any("Working on it." in c.content for c in comments)
```

Run: `python -m pytest tests/test_agent_loop.py -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Create graphait/modules/agent/loop.py**

```python
from __future__ import annotations
import json
import logging
import uuid
from typing import Any

import httpx
from sqlalchemy.orm import Session

from graphait.config.loader import AgentConfig, OrgConfig, load_skill
from graphait.models.task import Task, Comment, TaskStatus
from graphait.modules.agent.tools import ToolContext, get_tool_schemas, execute_tool

logger = logging.getLogger(__name__)
MAX_ITERATIONS = 20
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class AgentLoop:
    def __init__(self, agent: AgentConfig, org: OrgConfig, task: Task,
                 db: Session, scheduler_trigger: Any = None):
        self.agent = agent
        self.org = org
        self.task = task
        self.db = db
        self.scheduler_trigger = scheduler_trigger

    def _system_prompt(self) -> str:
        parts = []
        if self.org.system_prompt:
            parts.append(self.org.system_prompt)
        if self.agent.system_prompt:
            parts.append(self.agent.system_prompt)
        for slug in self.agent.skills:
            content = load_skill(slug)
            if content:
                parts.append(f"## Skill: {slug.replace('-', ' ').title()}\n{content}")
            else:
                logger.warning("Skill not found: %s (agent=%s)", slug, self.agent.id)
        return "\n\n".join(parts)

    def _task_message(self) -> str:
        comments = (self.db.query(Comment)
                    .filter(Comment.task_id == self.task.id)
                    .order_by(Comment.created_at.desc())
                    .limit(10).all())
        comments_text = "\n".join(
            f"[{c.author_id}]: {c.content}" for c in reversed(comments)
        ) or "(no comments yet)"
        return (
            f"## Task #{self.task.number}: {self.task.title}\n\n"
            f"{self.task.description or '(no description)'}\n\n"
            f"Priority: {self.task.priority.value} | Status: {self.task.status.value}\n\n"
            f"## Recent comments\n{comments_text}\n\n---\n"
            f"Work on this task. Call update_status(done) when complete, "
            f"update_status(blocked) if you need more information."
        )

    async def _call_api(self, messages: list[dict], tools: list[dict]) -> dict:
        api_key = self.agent.api_key or self.org.openrouter_api_key or ""
        model = self.agent.model or self.org.default_model
        payload: dict = {"model": model, "messages": messages}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def run(self) -> None:
        tools = get_tool_schemas(self.agent.tools)
        ctx = ToolContext(db=self.db, org_id=str(self.task.org_id),
                         task_id=str(self.task.id), agent_id=self.agent.id,
                         working_dir=self.agent.working_dir,
                         search_api_key=self.org.search_api_key,
                         scheduler_trigger=self.scheduler_trigger)
        messages: list[dict] = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": self._task_message()},
        ]

        for iteration in range(MAX_ITERATIONS):
            try:
                data = await self._call_api(messages, tools)
            except Exception as e:
                logger.error("API error (agent=%s iter=%d): %s", self.agent.id, iteration, e)
                self._system_comment(f"API error: {e}")
                break

            msg = data["choices"][0]["message"]
            messages.append(msg)
            tool_calls = msg.get("tool_calls") or []

            if not tool_calls:
                if msg.get("content"):
                    self._system_comment(msg["content"])
                self._set_status("done")
                return

            for tc in tool_calls:
                fn = tc["function"]
                try:
                    args = json.loads(fn["arguments"])
                except json.JSONDecodeError:
                    args = {}
                result = execute_tool(fn["name"], args, ctx)
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
                if fn["name"] == "update_status":
                    return

        self._system_comment("Reached iteration limit without completing task.")

    def _system_comment(self, content: str) -> None:
        self.db.add(Comment(task_id=self.task.id, author_id=self.agent.id,
                            content=content, is_system=True))
        self.db.commit()

    def _set_status(self, status: str) -> None:
        self.task.status = TaskStatus(status)
        self.db.commit()
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_agent_loop.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/agent/loop.py tests/test_agent_loop.py
git commit -m "feat: AgentLoop — httpx OpenRouter execution with tool calling"
```


---

## Task 5: DB migration + model updates

**Files:**
- Create: `alembic/versions/v2_config_as_code.py`
- Modify: `graphait/models/task.py`
- Modify: `graphait/models/user.py`
- Modify: `graphait/models/__init__.py`
- Modify: `graphait/schemas/task.py`
- Modify: `graphait/schemas/comment.py`
- Modify: `graphait/modules/tasks/service.py`
- Modify: `graphait/modules/tasks/comment_service.py`

- [ ] **Step 1: Create Alembic migration**

```bash
# Get the latest revision ID first:
cd /path/to/graphait && alembic history | head -1
# Should show: 3263943a1511 -> ... (head)
```

Create `alembic/versions/v2_config_as_code.py`:

```python
"""v2: config-as-code — drop agent tables, string FKs, add user.agent_id

Revision ID: a1b2c3d4e5f6
Revises: 3263943a1511
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '3263943a1511'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop tables that depend on agents first
    op.drop_table('agent_schedules')
    op.drop_table('agent_relationships')

    # Change tasks.assignee_id and creator_id from UUID FK to String(100)
    with op.batch_alter_table('tasks', recreate='always') as batch_op:
        batch_op.alter_column('assignee_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=True, nullable=True)
        batch_op.alter_column('creator_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=False, nullable=True)

    # Change comments.author_id from UUID FK to String(100)
    with op.batch_alter_table('comments', recreate='always') as batch_op:
        batch_op.alter_column('author_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=False, nullable=True)

    # Drop agents table (no more FK dependents)
    op.drop_table('agents')

    # Add agent_id to users
    op.add_column('users', sa.Column('agent_id', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'agent_id')
    # Restoring FK constraints after downgrade is not supported
    # Re-run previous migrations from scratch if needed
```

- [ ] **Step 2: Update graphait/models/task.py**

Replace `assignee_id`, `creator_id` and `author_id` FK columns, remove agent relationships:

```python
from __future__ import annotations
import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Boolean, Text, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"
    cancelled = "cancelled"
    waiting_approval = "waiting_approval"
    approved = "approved"
    rejected = "rejected"
    blocked = "blocked"


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
    __table_args__ = (UniqueConstraint("org_id", "number", name="uq_tasks_org_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True),
                                              ForeignKey("organizations.id", ondelete="CASCADE"),
                                              nullable=False)
    number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), nullable=False,
                                               default=TaskStatus.todo)
    priority: Mapped[TaskPriority] = mapped_column(Enum(TaskPriority), nullable=False,
                                                   default=TaskPriority.medium)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), nullable=False,
                                                default=TaskType.task)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    creator_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())

    subtasks: Mapped[list[Task]] = relationship("Task", foreign_keys=[parent_task_id])
    comments: Mapped[list[Comment]] = relationship("Comment", back_populates="task",
                                                   cascade="all, delete-orphan")
    attachments: Mapped[list[Attachment]] = relationship("Attachment", back_populates="task",
                                                         cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True),
                                               ForeignKey("tasks.id", ondelete="CASCADE"),
                                               nullable=False)
    author_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="comments")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True),
                                               ForeignKey("tasks.id", ondelete="CASCADE"),
                                               nullable=False)
    comment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="attachments")
```

Note: Added `blocked` to `TaskStatus` enum — agents will use it.

- [ ] **Step 3: Update graphait/models/user.py**

Add `agent_id: Optional[str]` column, remove Agent relationship:

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
import enum
from sqlalchemy import String, DateTime, func, Enum, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from graphait.database import Base

if TYPE_CHECKING:
    from graphait.models.organization import Organization


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True),
                                              ForeignKey("organizations.id", ondelete="CASCADE"),
                                              nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.member)
    agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship("Organization", back_populates="users")
```

- [ ] **Step 4: Update graphait/models/organization.py**

Remove `agents` relationship (no more Agent model):

```python
# In Organization class, remove:
#   agents: Mapped[list[Agent]] = relationship("Agent", back_populates="organization")
# Keep everything else as-is
```

- [ ] **Step 5: Update graphait/models/__init__.py**

```python
from graphait.models.organization import Organization
from graphait.models.user import User
from graphait.models.task import Task, Comment, Attachment
```

- [ ] **Step 6: Update graphait/schemas/task.py**

```python
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from graphait.models.task import TaskStatus, TaskPriority, TaskType


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    task_type: TaskType = TaskType.task
    assignee_id: Optional[str] = None
    parent_task_id: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[str] = None


class TaskRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    number: Optional[int]
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    task_type: TaskType
    assignee_id: Optional[str]
    creator_id: Optional[str]
    parent_task_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 7: Update graphait/schemas/comment.py**

```python
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
```

- [ ] **Step 8: Update graphait/modules/tasks/service.py**

Change `creator_id` parameter from `uuid.UUID` to `str`:

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

    def create(self, db: Session, org_id: uuid.UUID, creator_id: str, data: TaskCreate) -> Task:
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

    def list(self, db: Session, org_id: uuid.UUID,
             assignee_id: Optional[str] = None) -> list[Task]:
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

- [ ] **Step 9: Update graphait/modules/tasks/comment_service.py**

```python
import uuid
from sqlalchemy.orm import Session
from graphait.models.task import Comment
from graphait.schemas.comment import CommentCreate


class CommentService:
    def create(self, db: Session, task_id: uuid.UUID, author_id: str,
               data: CommentCreate, is_system: bool = False) -> Comment:
        comment = Comment(task_id=task_id, author_id=author_id,
                          content=data.content, is_system=is_system)
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return comment

    def list(self, db: Session, task_id: uuid.UUID) -> list[Comment]:
        return (db.query(Comment).filter(Comment.task_id == task_id)
                .order_by(Comment.created_at).all())


comment_service = CommentService()
```

- [ ] **Step 10: Run app startup to verify models**

Run: `python -m pytest tests/test_auth.py -v`
Expected: PASS (models load correctly with SQLite)

- [ ] **Step 11: Apply migration to dev DB (if graphait.db exists)**

```bash
alembic upgrade head
```

If clean start: `rm -f graphait.db && alembic upgrade head`

- [ ] **Step 12: Commit**

```bash
git add alembic/versions/v2_config_as_code.py \
        graphait/models/task.py graphait/models/user.py \
        graphait/models/organization.py graphait/models/__init__.py \
        graphait/schemas/task.py graphait/schemas/comment.py \
        graphait/modules/tasks/service.py graphait/modules/tasks/comment_service.py
git commit -m "feat: DB migration v2 — drop agent tables, string FKs, add user.agent_id"
```

---

## Task 6: Agents API refactor (file-backed)

**Files:**
- Modify: `graphait/schemas/agent.py`
- Modify: `graphait/api/v1/agents.py`
- Create: `tests/test_agents.py` (rewrite)

- [ ] **Step 1: Write new agent tests**

```python
# tests/test_agents.py
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Test Org", "org_slug": "testorg",
        "email": "test@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "test@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_agent(client, auth_headers):
    resp = client.post("/api/v1/agents", json={
        "id": "cto", "name": "CTO", "role_title": "Chief Technology Officer",
        "type": "ai", "model": "anthropic/claude-3-5-sonnet",
        "working_dir": "./workspaces/cto", "schedule_interval": 300
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["id"] == "cto"


def test_list_agents(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "dev1", "name": "Dev", "role_title": "Dev", "type": "ai",
        "model": "x/y", "working_dir": "./w/dev1", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.get("/api/v1/agents", headers=auth_headers)
    assert resp.status_code == 200
    assert any(a["id"] == "dev1" for a in resp.json())


def test_update_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "dev2", "name": "Dev2", "role_title": "Dev", "type": "ai",
        "model": "x/y", "working_dir": "./w/dev2", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.patch("/api/v1/agents/dev2", json={"name": "Dev2 Updated"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Dev2 Updated"


def test_delete_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "temp", "name": "Temp", "role_title": "T", "type": "ai",
        "model": "x/y", "working_dir": "./w/temp", "schedule_interval": 300
    }, headers=auth_headers)
    assert client.delete("/api/v1/agents/temp", headers=auth_headers).status_code == 204
    assert client.get("/api/v1/agents/temp", headers=auth_headers).status_code == 404


def test_run_agent(client, auth_headers):
    client.post("/api/v1/agents", json={
        "id": "runner", "name": "Runner", "role_title": "R", "type": "ai",
        "model": "x/y", "working_dir": "./w/runner", "schedule_interval": 300
    }, headers=auth_headers)
    resp = client.post("/api/v1/agents/runner/run", headers=auth_headers)
    assert resp.status_code == 202
```

Run: `python -m pytest tests/test_agents.py -v`
Expected: FAIL (old API doesn't match)

- [ ] **Step 2: Rewrite graphait/schemas/agent.py**

```python
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
```

- [ ] **Step 3: Rewrite graphait/api/v1/agents.py**

```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from graphait.api.deps import get_current_user
from graphait.config.loader import AgentConfig, load_agent, load_agents, save_agent, delete_agent
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
        scheduler_service.schedule_agent(cfg.id, cfg.schedule_interval)
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
            scheduler_service.schedule_agent(cfg.id, cfg.schedule_interval)
        else:
            scheduler_service.remove_agent(cfg.id)
    return AgentRead(**vars(cfg))


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_endpoint(agent_id: str, _: User = Depends(get_current_user)):
    _get_or_404(agent_id)
    delete_agent(agent_id)
    scheduler_service.remove_agent(agent_id)


@router.post("/{agent_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_agent_now(agent_id: str, background_tasks: BackgroundTasks,
                        _: User = Depends(get_current_user)):
    cfg = _get_or_404(agent_id)
    if cfg.type != "ai":
        raise HTTPException(status_code=400, detail="Only AI agents can be triggered")
    from graphait.modules.scheduler.worker import run_agent_tick
    background_tasks.add_task(run_agent_tick, agent_id)
    return {"status": "triggered", "agent_id": agent_id}
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_agents.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/schemas/agent.py graphait/api/v1/agents.py tests/test_agents.py
git commit -m "feat: agents API — file-backed CRUD replacing DB-backed"
```

---

## Task 7: Skills API (new)

**Files:**
- Create: `graphait/schemas/skill.py`
- Create: `graphait/api/v1/skills.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_agents.py` or create `tests/test_skills.py`:

```python
# tests/test_skills.py
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Skill Org", "org_slug": "skillorg",
        "email": "skill@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "skill@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_and_list_skills(client, auth_headers):
    resp = client.post("/api/v1/skills", json={
        "id": "python-senior", "name": "Python Senior", "content": "# Python\nBe excellent."
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["id"] == "python-senior"
    listed = client.get("/api/v1/skills", headers=auth_headers).json()
    assert any(s["id"] == "python-senior" for s in listed)


def test_get_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "react-expert", "name": "React Expert",
                                         "content": "Use hooks."}, headers=auth_headers)
    resp = client.get("/api/v1/skills/react-expert", headers=auth_headers)
    assert resp.status_code == 200
    assert "Use hooks." in resp.json()["content"]


def test_patch_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "ts-dev", "name": "TS Dev",
                                         "content": "Old content."}, headers=auth_headers)
    resp = client.patch("/api/v1/skills/ts-dev", json={"content": "New content."},
                        headers=auth_headers)
    assert resp.status_code == 200
    assert "New content." in resp.json()["content"]


def test_delete_skill(client, auth_headers):
    client.post("/api/v1/skills", json={"id": "gone", "name": "Gone",
                                         "content": "bye"}, headers=auth_headers)
    assert client.delete("/api/v1/skills/gone", headers=auth_headers).status_code == 204
    assert client.get("/api/v1/skills/gone", headers=auth_headers).status_code == 404
```

Run: `python -m pytest tests/test_skills.py -v`
Expected: FAIL (route not registered)

- [ ] **Step 2: Create graphait/schemas/skill.py**

```python
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
```

- [ ] **Step 3: Create graphait/api/v1/skills.py**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from graphait.api.deps import get_current_user
from graphait.config.loader import load_skill, save_skill, delete_skill, list_skills
from graphait.models.user import User
from graphait.schemas.skill import SkillCreate, SkillUpdate, SkillRead

router = APIRouter()


def _get_or_404(skill_id: str) -> SkillRead:
    content = load_skill(skill_id)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return SkillRead(id=skill_id, name=skill_id.replace("-", " ").title(), content=content)


@router.get("", response_model=list[SkillRead])
def list_skills_endpoint(_: User = Depends(get_current_user)):
    return [SkillRead(**s) for s in list_skills()]


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def create_skill(body: SkillCreate, _: User = Depends(get_current_user)):
    if load_skill(body.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Skill '{body.id}' already exists")
    save_skill(body.id, body.content)
    return SkillRead(id=body.id, name=body.name, content=body.content)


@router.get("/{skill_id}", response_model=SkillRead)
def get_skill(skill_id: str, _: User = Depends(get_current_user)):
    return _get_or_404(skill_id)


@router.patch("/{skill_id}", response_model=SkillRead)
def update_skill(skill_id: str, body: SkillUpdate, _: User = Depends(get_current_user)):
    existing = _get_or_404(skill_id)
    new_content = body.content if body.content is not None else existing.content
    new_name = body.name if body.name is not None else existing.name
    save_skill(skill_id, new_content)
    return SkillRead(id=skill_id, name=new_name, content=new_content)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill_endpoint(skill_id: str, _: User = Depends(get_current_user)):
    _get_or_404(skill_id)
    delete_skill(skill_id)
```

- [ ] **Step 4: Register in router**

In `graphait/api/v1/router.py`:

```python
from fastapi import APIRouter
from graphait.api.v1 import auth, agents, tasks, graph, org, skills

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(graph.router, prefix="/graph", tags=["graph"])
router.include_router(org.router, prefix="/org", tags=["org"])
router.include_router(skills.router, prefix="/skills", tags=["skills"])
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_skills.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add graphait/schemas/skill.py graphait/api/v1/skills.py \
        graphait/api/v1/router.py tests/test_skills.py
git commit -m "feat: skills API — file-backed CRUD for markdown skill files"
```

---

## Task 8: Org API update

**Files:**
- Modify: `graphait/api/v1/org.py`

- [ ] **Step 1: Write failing test**

```python
# Add to tests/test_agents.py or run inline
# tests/test_org.py
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Org Test", "org_slug": "orgtest",
        "email": "org@test.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "org@test.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_get_org_settings(client, auth_headers):
    resp = client.get("/api/v1/org", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "system_prompt" in data
    assert "search_api_key" in data


def test_patch_org_settings(client, auth_headers):
    resp = client.patch("/api/v1/org", json={
        "system_prompt": "Build quality software.",
        "openrouter_api_key": "sk-test-123",
        "search_api_key": "search-key-abc",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["system_prompt"] == "Build quality software."
    assert data["openrouter_api_key"] == "sk-test-123"
    assert data["search_api_key"] == "search-key-abc"
```

Run: `python -m pytest tests/test_org.py -v`
Expected: FAIL (org returns old shape without system_prompt)

- [ ] **Step 2: Rewrite graphait/api/v1/org.py**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.config.loader import load_org, save_org, OrgConfig
from graphait.models.user import User

router = APIRouter()


class OrgSettingsRead(BaseModel):
    org_id: str
    org_name: str
    org_slug: str
    system_prompt: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None
    search_api_key: Optional[str] = None


class OrgSettingsPatch(BaseModel):
    system_prompt: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None
    search_api_key: Optional[str] = None


def _read_response(user: User, cfg: OrgConfig) -> OrgSettingsRead:
    return OrgSettingsRead(
        org_id=str(user.org_id),
        org_name=user.organization.name,
        org_slug=user.organization.slug,
        system_prompt=cfg.system_prompt,
        openrouter_api_key=cfg.openrouter_api_key,
        default_model=cfg.default_model,
        search_api_key=cfg.search_api_key,
    )


@router.get("", response_model=OrgSettingsRead)
def get_org_settings(db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    return _read_response(current_user, load_org())


@router.patch("", response_model=OrgSettingsRead)
def patch_org_settings(body: OrgSettingsPatch, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    cfg = load_org()
    if body.system_prompt is not None:
        cfg.system_prompt = body.system_prompt
    if body.openrouter_api_key is not None:
        cfg.openrouter_api_key = body.openrouter_api_key
    if body.default_model is not None:
        cfg.default_model = body.default_model
    if body.search_api_key is not None:
        cfg.search_api_key = body.search_api_key
    save_org(cfg)
    return _read_response(current_user, cfg)
```

- [ ] **Step 3: Run tests**

Run: `python -m pytest tests/test_org.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add graphait/api/v1/org.py tests/test_org.py
git commit -m "feat: org API — reads/writes org.json with system_prompt and search_api_key"
```

---

## Task 9: Tasks API update + auth update

**Files:**
- Modify: `graphait/api/v1/tasks.py`
- Modify: `graphait/api/v1/auth.py`
- Modify: `tests/test_tasks.py`
- Modify: `tests/test_auth.py`

- [ ] **Step 1: Rewrite test_tasks.py**

After Task 5 the old setup fixture (which manually linked agent to user) is gone. Register creates a human agent automatically (Task 9 implements this). Update tests:

```python
# tests/test_tasks.py
import pytest
import graphait.config.loader as loader_mod


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Task Org", "org_slug": "taskorg2",
        "email": "tasks2@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "tasks2@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_create_task(client, headers):
    resp = client.post("/api/v1/tasks", json={"title": "Fix bug #1", "priority": "high"},
                       headers=headers)
    assert resp.status_code == 201
    assert resp.json()["number"] == 1


def test_list_tasks(client, headers):
    client.post("/api/v1/tasks", json={"title": "A"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "B"}, headers=headers)
    assert len(client.get("/api/v1/tasks", headers=headers).json()) == 2


def test_filter_tasks_by_assignee(client, headers):
    client.post("/api/v1/tasks", json={"title": "Assigned", "assignee_id": "cto"}, headers=headers)
    client.post("/api/v1/tasks", json={"title": "Unassigned"}, headers=headers)
    resp = client.get("/api/v1/tasks?assignee_id=cto", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["assignee_id"] == "cto"


def test_update_task_status(client, headers):
    task = client.post("/api/v1/tasks", json={"title": "Do thing"}, headers=headers).json()
    resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "in_progress"},
                        headers=headers)
    assert resp.json()["status"] == "in_progress"


def test_add_and_list_comments(client, headers):
    task = client.post("/api/v1/tasks", json={"title": "With comments"}, headers=headers).json()
    post = client.post(f"/api/v1/tasks/{task['id']}/comments",
                       json={"content": "First comment"}, headers=headers)
    assert post.status_code == 201
    comments = client.get(f"/api/v1/tasks/{task['id']}/comments", headers=headers).json()
    assert comments[0]["content"] == "First comment"
```

Run: `python -m pytest tests/test_tasks.py -v`
Expected: FAIL (auth register doesn't create agent_id yet)

- [ ] **Step 2: Update graphait/api/v1/auth.py**

On register: create human agent JSON file + set user.agent_id:

```python
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.models.organization import Organization
from graphait.models.user import User, UserRole
from graphait.modules.auth.service import hash_password, verify_password, create_access_token
from graphait.schemas.user import RegisterRequest, LoginRequest, TokenResponse, UserRead
from graphait.api.deps import get_current_user
from graphait.config.loader import AgentConfig, save_agent, init_config_dir

router = APIRouter()


def _email_to_slug(email: str) -> str:
    prefix = email.split("@")[0]
    slug = re.sub(r"[^a-z0-9]+", "-", prefix.lower()).strip("-")
    return slug or "user"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(Organization).filter(Organization.slug == body.org_slug).first():
        raise HTTPException(status_code=400, detail="Org slug already taken")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    org = Organization(name=body.org_name, slug=body.org_slug)
    db.add(org)
    db.flush()

    agent_id = _email_to_slug(body.email)
    user = User(org_id=org.id, email=body.email,
                password_hash=hash_password(body.password),
                role=UserRole.admin, agent_id=agent_id)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create human agent config file
    init_config_dir()
    name = body.email.split("@")[0].replace(".", " ").replace("-", " ").title()
    save_agent(AgentConfig(
        id=agent_id, name=name, role_title="Team Member", type="human",
        model="", api_key=None, working_dir=f"./workspaces/{agent_id}",
        reports_to=None, schedule_interval=0, schedule_enabled=False,
        tools=[], skills=[], system_prompt="",
    ))

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

- [ ] **Step 3: Rewrite graphait/api/v1/tasks.py**

Replace `_require_agent_id` DB query with `user.agent_id`. Add immediate scheduler trigger on assignment:

```python
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.modules.tasks.service import task_service
from graphait.schemas.task import TaskCreate, TaskUpdate, TaskRead
from graphait.modules.tasks.comment_service import comment_service
from graphait.schemas.comment import CommentCreate, CommentRead

router = APIRouter()


def _get_creator_id(user: User) -> str:
    if not user.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no linked agent — register creates one automatically",
        )
    return user.agent_id


def _get_task_or_404(task_id: uuid.UUID, user: User, db: Session):
    task = task_service.get(db, task_id, user.org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    creator_id = _get_creator_id(current_user)
    task = task_service.create(db, current_user.org_id, creator_id, body)
    if task.assignee_id:
        from graphait.modules.scheduler.service import scheduler_service
        scheduler_service.trigger_agent(task.assignee_id)
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(assignee_id: Optional[str] = Query(None),
               db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    return task_service.list(db, current_user.org_id, assignee_id)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: uuid.UUID, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    return _get_task_or_404(task_id, current_user, db)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    updated = task_service.update(db, task, body)
    if body.assignee_id:
        from graphait.modules.scheduler.service import scheduler_service
        scheduler_service.trigger_agent(body.assignee_id)
    return updated


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    task_service.delete(db, _get_task_or_404(task_id, current_user, db))


@router.get("/{task_id}/comments", response_model=list[CommentRead])
def list_comments(task_id: uuid.UUID, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    return comment_service.list(db, task_id)


@router.post("/{task_id}/comments", response_model=CommentRead,
             status_code=status.HTTP_201_CREATED)
def add_comment(task_id: uuid.UUID, body: CommentCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    author_id = _get_creator_id(current_user)
    return comment_service.create(db, task_id, author_id, body)
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_tasks.py tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/api/v1/tasks.py graphait/api/v1/auth.py \
        tests/test_tasks.py tests/test_auth.py
git commit -m "feat: tasks API + auth — string IDs, human agent on register, scheduler trigger on assign"
```


---

## Task 10: Graph API refactor

**Files:**
- Modify: `graphait/api/v1/graph.py`
- Delete: `graphait/modules/graph/service.py` (no longer needed)
- Delete: `graphait/schemas/graph.py` (replaced inline)

- [ ] **Step 1: Write failing test**

```python
# tests/test_graph.py — rewrite
import pytest
import graphait.config.loader as loader_mod
from graphait.config.loader import AgentConfig, save_agent


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


def _save(id, reports_to=None):
    save_agent(AgentConfig(id=id, name=id.title(), role_title="R", type="ai",
                           model="x/y", api_key=None, working_dir=f"./w/{id}",
                           reports_to=reports_to, schedule_interval=300,
                           schedule_enabled=True, tools=[], skills=[], system_prompt=""))


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Graph Org", "org_slug": "graphorg2",
        "email": "graph2@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "graph2@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_graph_returns_nodes_and_edges(client, auth_headers):
    _save("cto")
    _save("dev", reports_to="cto")
    resp = client.get("/api/v1/graph", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    node_ids = [n["id"] for n in data["nodes"]]
    assert "cto" in node_ids and "dev" in node_ids
    assert len(data["edges"]) == 1
    edge = data["edges"][0]
    assert edge["from_agent_id"] == "dev"
    assert edge["to_agent_id"] == "cto"
```

Run: `python -m pytest tests/test_graph.py -v`
Expected: FAIL (old graph reads from DB)

- [ ] **Step 2: Rewrite graphait/api/v1/graph.py**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from graphait.api.deps import get_current_user
from graphait.config.loader import load_agents
from graphait.models.user import User
from graphait.schemas.agent import AgentRead

router = APIRouter()


class GraphEdge(BaseModel):
    id: str
    from_agent_id: str
    to_agent_id: str
    type: str = "reports_to"


class GraphData(BaseModel):
    nodes: list[AgentRead]
    edges: list[GraphEdge]


@router.get("", response_model=GraphData)
def get_graph(_: User = Depends(get_current_user)):
    agents = load_agents()
    nodes = [AgentRead(**vars(a)) for a in agents]
    edges = [
        GraphEdge(
            id=f"{a.id}->reports_to->{a.reports_to}",
            from_agent_id=a.id,
            to_agent_id=a.reports_to,
            type="reports_to",
        )
        for a in agents
        if a.reports_to
    ]
    return GraphData(nodes=nodes, edges=edges)
```

- [ ] **Step 3: Remove dead files**

```bash
rm -f graphait/modules/graph/service.py graphait/schemas/graph.py
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_graph.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add graphait/api/v1/graph.py tests/test_graph.py
git rm graphait/modules/graph/service.py graphait/schemas/graph.py 2>/dev/null || true
git commit -m "feat: graph API — reads from config files, edges from reports_to"
```

---

## Task 11: Scheduler refactor

**Files:**
- Modify: `graphait/modules/scheduler/worker.py`
- Modify: `graphait/modules/scheduler/service.py`
- Modify: `graphait/main.py`

- [ ] **Step 1: Rewrite graphait/modules/scheduler/worker.py**

```python
import asyncio
import logging
from graphait.database import SessionLocal
from graphait.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


async def run_agent_tick(agent_id: str) -> None:
    from graphait.config.loader import load_agent, load_org
    from graphait.modules.agent.loop import AgentLoop
    from graphait.modules.scheduler.service import scheduler_service

    agent_cfg = load_agent(agent_id)
    if not agent_cfg or agent_cfg.type != "ai":
        return

    with SessionLocal() as db:
        task = (
            db.query(Task)
            .filter(
                Task.assignee_id == agent_id,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
            )
            .order_by(Task.created_at)
            .first()
        )
        if not task:
            return

        org_cfg = load_org()
        loop = AgentLoop(
            agent=agent_cfg,
            org=org_cfg,
            task=task,
            db=db,
            scheduler_trigger=scheduler_service.trigger_agent,
        )
        try:
            await loop.run()
        except Exception as e:
            logger.error("AgentLoop error (agent=%s task=%s): %s", agent_id, task.id, e)
```

- [ ] **Step 2: Rewrite graphait/modules/scheduler/service.py**

```python
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self._scheduler = None

    def start(self) -> None:
        self._scheduler = BackgroundScheduler()
        self._scheduler.start()
        logger.info("Scheduler started")

    def stop(self) -> None:
        if self._scheduler:
            self._scheduler.shutdown(wait=False)

    def schedule_agent(self, agent_id: str, interval_seconds: int) -> None:
        if not self._scheduler:
            return
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

    def remove_agent(self, agent_id: str) -> None:
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

    def trigger_agent(self, agent_id: str) -> None:
        """Fire agent immediately (called when task is assigned)."""
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        job = self._scheduler.get_job(job_id)
        if job:
            job.modify(next_run_time=datetime.now(timezone.utc))
        else:
            # Agent has no regular schedule — fire once
            self._scheduler.add_job(
                _run_sync,
                "date",
                run_date=datetime.now(timezone.utc),
                args=[agent_id],
                id=f"trigger_{agent_id}",
                replace_existing=True,
            )


def _run_sync(agent_id: str) -> None:
    from graphait.modules.scheduler.worker import run_agent_tick
    asyncio.run(run_agent_tick(agent_id))


scheduler_service = SchedulerService()
```

- [ ] **Step 3: Update graphait/main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from graphait.api.v1.router import router
from graphait.modules.scheduler.service import scheduler_service
from graphait.database import engine, Base
import graphait.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    from graphait.config.loader import init_config_dir, load_agents
    init_config_dir()
    try:
        scheduler_service.start()
        for agent in load_agents():
            if agent.type == "ai" and agent.schedule_enabled and agent.schedule_interval > 0:
                scheduler_service.schedule_agent(agent.id, agent.schedule_interval)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Scheduler failed to start: %s", e)
    yield
    scheduler_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Graphait", version="2.0.0", lifespan=lifespan)
    app.include_router(router, prefix="/api/v1")

    @app.get("/api/v1/health", tags=["health"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 4: Delete old dead files**

```bash
rm -f graphait/api/v1/schedules.py graphait/modules/agents/service.py
```

Check if any imports remain:

```bash
grep -r "from graphait.modules.agents" graphait/ || echo "clean"
grep -r "from graphait.api.v1 import.*schedules" graphait/ || echo "clean"
```

Fix any remaining imports found.

- [ ] **Step 5: Run full test suite**

Run: `python -m pytest tests/ -v --ignore=tests/test_http_connector.py --ignore=tests/test_opencode_connector.py --ignore=tests/test_worker.py --ignore=tests/test_schedules.py`

Expected: all PASS (connector and old worker tests can be deleted)

- [ ] **Step 6: Delete obsolete tests**

```bash
rm -f tests/test_http_connector.py tests/test_opencode_connector.py \
       tests/test_worker.py tests/test_schedules.py
```

- [ ] **Step 7: Run full suite again**

Run: `python -m pytest tests/ -v`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add graphait/modules/scheduler/ graphait/main.py
git rm graphait/api/v1/schedules.py graphait/modules/agents/service.py \
        tests/test_http_connector.py tests/test_opencode_connector.py \
        tests/test_worker.py tests/test_schedules.py 2>/dev/null || true
git commit -m "feat: scheduler refactor — AgentLoop integration, config-based scheduling"
```

---

## Task 12: Frontend — update agent types and graph

**Files:**
- Modify: `frontend/src/api/agents.ts`
- Modify: `frontend/src/api/graph.ts`
- Modify: `frontend/src/pages/GraphPage.tsx`

- [ ] **Step 1: Update frontend/src/api/agents.ts**

```typescript
import { apiFetch } from './client'

export interface Agent {
  id: string
  name: string
  role_title: string
  type: 'ai' | 'human'
  model: string
  api_key: string | null
  working_dir: string
  reports_to: string | null
  schedule_interval: number
  schedule_enabled: boolean
  tools: string[]
  skills: string[]
  system_prompt: string
}

export const agentsApi = {
  list: () => apiFetch<Agent[]>('/agents'),
  get: (id: string) => apiFetch<Agent>(`/agents/${id}`),
  create: (body: Partial<Agent> & { id: string; name: string; role_title: string; working_dir: string }) =>
    apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Agent>) =>
    apiFetch<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/agents/${id}`, { method: 'DELETE' }),
  run: (id: string) => apiFetch<{ status: string; agent_id: string }>(`/agents/${id}/run`, { method: 'POST' }),
}
```

- [ ] **Step 2: Update frontend/src/api/graph.ts**

```typescript
import { apiFetch } from './client'
import type { Agent } from './agents'

export interface GraphEdge {
  id: string
  from_agent_id: string
  to_agent_id: string
  type: string
}

export interface GraphData {
  nodes: Agent[]
  edges: GraphEdge[]
}

export const graphApi = {
  get: () => apiFetch<GraphData>('/graph'),
}
```

- [ ] **Step 3: Update computeLayout in GraphPage.tsx**

Find `computeLayout` and update to use `GraphEdge` instead of `AgentRelationship`:

```typescript
function computeLayout(agents: Agent[], edges: GraphEdge[]) {
  const parent: Record<string, string> = {}
  edges.forEach(e => {
    if (e.type === 'reports_to' && !parent[e.from_agent_id]) parent[e.from_agent_id] = e.to_agent_id
  })
  // ... rest unchanged
  const edgeData = edges.map(e => ({ id: e.id, from: e.from_agent_id, to: e.to_agent_id, type: e.type }))
  return { nodes, edgeData, width, height }
}
```

- [ ] **Step 4: Replace AgentConfig panel in GraphPage.tsx**

The existing panel has tabs: general, connector, prompt, scope, schedule, relations.
Replace with new tabs: general, model, tools, skills, schedule.

The AgentConfig component signature changes to:

```typescript
function AgentConfig({ agent, agents, skills, onUpdate, onDelete, onClose }: {
  agent: Agent
  agents: Agent[]
  skills: SkillRead[]
  onUpdate: (patch: Partial<Agent>) => void
  onDelete: () => void
  onClose: () => void
})
```

New panel content (replaces the entire AgentConfig function body):

```typescript
const AVAILABLE_TOOLS = [
  'read_file', 'write_file', 'list_directory', 'web_search', 'fetch_url'
]

function AgentConfig({ agent, agents, skills, onUpdate, onDelete, onClose }: {
  agent: Agent; agents: Agent[]; skills: SkillRead[]
  onUpdate: (patch: Partial<Agent>) => void
  onDelete: () => void; onClose: () => void
}) {
  const [tab, setTab] = useState<'general' | 'model' | 'tools' | 'skills' | 'schedule'>('general')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<'ok' | 'err' | null>(null)

  useEffect(() => { setConfirmDelete(false); setRunResult(null) }, [agent.id])

  const isAI = agent.type === 'ai'
  const save = (patch: Partial<Agent>) => onUpdate(patch)

  const runNow = async () => {
    setRunning(true)
    try { await agentsApi.run(agent.id); setRunResult('ok') }
    catch { setRunResult('err') }
    finally { setRunning(false); setTimeout(() => setRunResult(null), 3000) }
  }

  const tabs = ['general', ...(isAI ? ['model', 'tools', 'skills', 'schedule'] : [])] as const

  return (
    <aside className="agent-cfg">
      <header className="agent-cfg__head">
        <div className="agent-cfg__identity">
          <div className={`avatar${isAI ? ' avatar--ai' : ' avatar--human'} avatar--xl`}>{initials(agent.name)}</div>
          <div className="agent-cfg__id-text">
            <input className="agent-cfg__name" value={agent.name}
              onChange={e => onUpdate({ name: e.target.value })}
              onBlur={e => save({ name: e.target.value })} />
            <input className="agent-cfg__role" value={agent.role_title}
              onChange={e => onUpdate({ role_title: e.target.value })}
              onBlur={e => save({ role_title: e.target.value })} />
            <span className={`tag-type tag-type--${agent.type}`}>{agent.type}</span>
          </div>
          <button className="btn btn--ghost btn--icon btn--sm agent-cfg__close" onClick={onClose}>
            <Icon name="close" size={14}/>
          </button>
        </div>
        <nav className="agent-cfg__tabs">
          {tabs.map(t => (
            <button key={t} className={`agent-cfg__tab${tab === t ? ' agent-cfg__tab--active' : ''}`}
              onClick={() => setTab(t as any)}>{t}</button>
          ))}
        </nav>
      </header>

      <div className="agent-cfg__body">
        {tab === 'general' && (
          <>
            <div className="field">
              <span className="label">ID</span>
              <code className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-2)',
                background:'var(--bg-inset)',border:'1px solid var(--line-1)',
                padding:'5px 8px',borderRadius:3,display:'inline-block'}}>{agent.id}</code>
            </div>
            <div className="field">
              <label className="label">System prompt</label>
              <textarea className="agent-cfg__prompt" rows={10}
                value={agent.system_prompt}
                onChange={e => onUpdate({ system_prompt: e.target.value })}
                onBlur={e => save({ system_prompt: e.target.value })}
                placeholder="Describe this agent's role, personality, constraints…"/>
            </div>
            <div className="field">
              <label className="label">Reports to</label>
              <select className="select"
                value={agent.reports_to ?? ''}
                onChange={e => save({ reports_to: e.target.value || null })}>
                <option value="">— None (top-level)</option>
                {agents.filter(a => a.id !== agent.id).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {tab === 'model' && isAI && (
          <>
            <div className="field">
              <label className="label">Model</label>
              <input className="input mono" value={agent.model}
                onChange={e => onUpdate({ model: e.target.value })}
                onBlur={e => save({ model: e.target.value })}
                placeholder="anthropic/claude-sonnet-4-5"/>
              <p className="settings__hint">OpenRouter model ID. Leave blank to use org default.</p>
            </div>
            <div className="field">
              <label className="label">API Key (optional)</label>
              <input className="input" type="password"
                value={agent.api_key ?? ''}
                onChange={e => onUpdate({ api_key: e.target.value || null })}
                onBlur={e => save({ api_key: e.target.value || null })}
                placeholder="Overrides org key if set" autoComplete="off"/>
            </div>
            <div className="field">
              <label className="label">Working directory</label>
              <input className="input mono" value={agent.working_dir}
                onChange={e => onUpdate({ working_dir: e.target.value })}
                onBlur={e => save({ working_dir: e.target.value })}
                placeholder="./workspaces/agent-id"/>
            </div>
          </>
        )}

        {tab === 'tools' && isAI && (
          <div className="field">
            <label className="label">Optional tools</label>
            <p className="settings__hint">Always-on: post_comment, update_status, create_task, assign_task</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {AVAILABLE_TOOLS.map(tool => (
                <label key={tool} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={agent.tools.includes(tool)}
                    onChange={e => {
                      const tools = e.target.checked
                        ? [...agent.tools, tool]
                        : agent.tools.filter(t => t !== tool)
                      save({ tools })
                    }}/>
                  <span className="mono" style={{ fontSize: 'var(--fs-sm)' }}>{tool}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === 'skills' && isAI && (
          <div className="field">
            <label className="label">Assigned skills</label>
            {skills.length === 0
              ? <p className="settings__hint">No skills defined yet. Add skills on the Skills page.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {skills.map(skill => (
                    <label key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox"
                        checked={agent.skills.includes(skill.id)}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...agent.skills, skill.id]
                            : agent.skills.filter(s => s !== skill.id)
                          save({ skills: updated })
                        }}/>
                      <span>{skill.name}</span>
                    </label>
                  ))}
                </div>
              )}
          </div>
        )}

        {tab === 'schedule' && isAI && (
          <>
            <div className="field">
              <label className="label">Schedule enabled</label>
              <span className="toggle" data-on={agent.schedule_enabled ? 'true' : 'false'}
                onClick={() => save({ schedule_enabled: !agent.schedule_enabled })}/>
            </div>
            <div className="field">
              <label className="label">Interval (seconds)</label>
              <input type="number" min={30} className="input"
                value={agent.schedule_interval}
                onChange={e => onUpdate({ schedule_interval: Number(e.target.value) })}
                onBlur={e => save({ schedule_interval: Number(e.target.value) })}/>
              <p className="settings__hint">How often the agent checks for pending tasks.</p>
            </div>
          </>
        )}
      </div>

      <footer className="agent-cfg__foot">
        {isAI && (
          <button className="btn btn--primary btn--sm" onClick={runNow} disabled={running}>
            <Icon name={running ? 'pause' : 'play'} size={12}/>
            {running ? 'Running…' : runResult === 'ok' ? 'Triggered ✓' : runResult === 'err' ? 'Error ✗' : 'Run now'}
          </button>
        )}
        {confirmDelete ? (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>Delete?</span>
            <button className="btn btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>Delete</button>
          </div>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={12}/>Delete
          </button>
        )}
      </footer>
    </aside>
  )
}
```

- [ ] **Step 5: Update main GraphPage component**

Update the top-level GraphPage to:
1. Remove `relationships` state — edges come from `graphApi.get().edges`
2. Add `skills` state from `skillsApi.list()`
3. Remove relationship CRUD handlers
4. Pass `skills` to AgentConfig

Find the main `export default function GraphPage()` and update state/data fetching:

```typescript
// Replace relationship-related state and fetching with:
const [skills, setSkills] = useState<SkillRead[]>([])

// In useEffect / data loading, add:
skillsApi.list().then(setSkills).catch(() => {})

// Remove: onCreateRelation, onDeleteRelation handlers that call graphApi relationship endpoints
// Update AgentConfig usage:
<AgentConfig
  agent={selectedAgent}
  agents={agents}
  skills={skills}
  onUpdate={handleUpdate}
  onDelete={handleDelete}
  onClose={() => setSelectedId(null)}
/>
```

Also update the AgentListView to use `agent.reports_to` directly instead of looking up through relationships:

```typescript
// In AgentListView, replace:
// const reportsTo = relationships.find(r => r.from_agent_id === a.id && r.type === 'reports_to')
// const parent = reportsTo ? agents.find(x => x.id === reportsTo.to_agent_id) : null
// With:
const parent = a.reports_to ? agents.find(x => x.id === a.reports_to) : null
```

- [ ] **Step 6: Import SkillRead in GraphPage**

Add at top of GraphPage.tsx:
```typescript
import { skillsApi, type SkillRead } from '../api/skills'
```

- [ ] **Step 7: Update CreateAgentModal**

Add `id` and `working_dir` fields (required by new API):

```typescript
function CreateAgentModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: Partial<Agent> & { id: string; name: string; role_title: string; working_dir: string }) => void
}) {
  const [form, setForm] = useState({
    id: '', name: '', role_title: '', type: 'ai' as 'ai' | 'human',
    working_dir: '', model: 'anthropic/claude-sonnet-4-5'
  })
  // Add id and working_dir fields to the form JSX
  // Auto-fill working_dir when id changes: setForm(f => ({ ...f, working_dir: `./workspaces/${v}` }))
```

- [ ] **Step 8: Start dev server and test manually**

```bash
make dev
# or: cd frontend && npm run dev & cd .. && uvicorn graphait.main:app --reload
```

Open http://localhost:5173/agents:
- Graph loads with nodes and edges
- Clicking a node opens panel with general/model/tools/skills/schedule tabs
- Reports-to dropdown works
- Tools checkboxes save
- Run now button works

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/agents.ts frontend/src/api/graph.ts \
        frontend/src/pages/GraphPage.tsx
git commit -m "feat: frontend graph page — new agent config panel with tools/skills/schedule"
```

---

## Task 13: Frontend — Skills page

**Files:**
- Create: `frontend/src/api/skills.ts`
- Create: `frontend/src/pages/SkillsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx` (add nav item)

- [ ] **Step 1: Create frontend/src/api/skills.ts**

```typescript
import { apiFetch } from './client'

export interface SkillRead {
  id: string
  name: string
  content: string
}

export const skillsApi = {
  list: () => apiFetch<SkillRead[]>('/skills'),
  get: (id: string) => apiFetch<SkillRead>(`/skills/${id}`),
  create: (body: { id: string; name: string; content: string }) =>
    apiFetch<SkillRead>('/skills', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { content?: string; name?: string }) =>
    apiFetch<SkillRead>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/skills/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Create frontend/src/pages/SkillsPage.tsx**

```typescript
import { useState, useEffect } from 'react'
import { skillsApi, type SkillRead } from '../api/skills'
import Icon from '../components/Icon'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRead[]>([])
  const [selected, setSelected] = useState<SkillRead | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    skillsApi.list().then(s => { setSkills(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const selectSkill = (skill: SkillRead) => {
    setSelected(skill)
    setDraft(skill.content)
    setShowNew(false)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await skillsApi.update(selected.id, { content: draft })
      setSkills(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelected(updated)
    } finally {
      setSaving(false)
    }
  }

  const createSkill = async () => {
    const id = slugify(newName)
    if (!id) return
    const skill = await skillsApi.create({ id, name: newName, content: '' })
    setSkills(prev => [...prev, skill])
    selectSkill(skill)
    setShowNew(false)
    setNewName('')
  }

  const deleteSkill = async (id: string) => {
    await skillsApi.delete(id)
    setSkills(prev => prev.filter(s => s.id !== id))
    if (selected?.id === id) { setSelected(null); setDraft('') }
  }

  if (loading) return <div className="settings"><div style={{color:'var(--ink-3)'}}>Loading…</div></div>

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 240, borderRight: '1px solid var(--line-1)', padding: '16px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow">Skills</span>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setShowNew(true)} title="New skill">
            <Icon name="plus" size={13}/>
          </button>
        </div>
        {showNew && (
          <div style={{ padding: '0 16px 12px' }}>
            <input className="input" placeholder="Skill name…" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createSkill() }}
              autoFocus/>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <button className="btn btn--primary btn--sm" onClick={createSkill}>Create</button>
              <button className="btn btn--sm" onClick={() => { setShowNew(false); setNewName('') }}>Cancel</button>
            </div>
          </div>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {skills.map(s => (
            <li key={s.id}
              className={`alist__row${selected?.id === s.id ? ' alist__row--active' : ''}`}
              style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex',
                       justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => selectSkill(s)}>
              <span style={{ fontSize: 'var(--fs-sm)' }}>{s.name}</span>
              <button className="btn btn--ghost btn--icon btn--sm"
                onClick={e => { e.stopPropagation(); deleteSkill(s.id) }}
                title="Delete">
                <Icon name="trash" size={11}/>
              </button>
            </li>
          ))}
          {skills.length === 0 && (
            <li style={{ padding: '8px 16px', color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
              No skills yet
            </li>
          )}
        </ul>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>{selected.name}</h2>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-xs)' }}>{selected.id}.md</span>
              </div>
              <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)',
                       background: 'var(--bg-inset)', border: '1px solid var(--line-2)',
                       borderRadius: 4, padding: 16, resize: 'none', color: 'var(--ink-1)' }}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="# Skill Title&#10;&#10;Describe how the agent should approach work…"
              spellCheck={false}
            />
          </>
        ) : (
          <div style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
            Select a skill to edit, or create a new one.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add route in App.tsx**

```typescript
// Add import:
import SkillsPage from './pages/SkillsPage'

// Add route:
<Route path="/skills" element={<RequireAuth><SkillsPage /></RequireAuth>} />
```

- [ ] **Step 4: Add nav item in Layout.tsx**

Find the Sidebar nav links and add:
```typescript
{ to: '/skills', icon: 'spark', label: 'Skills' }
```
(Use whatever icon makes sense — 'spark', 'book', or similar from your Icon set)

- [ ] **Step 5: Test manually**

Open http://localhost:5173/skills:
- Sidebar shows skill list
- Clicking skill opens editor
- Saving updates content
- Create new skill works
- Delete works

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/skills.ts frontend/src/pages/SkillsPage.tsx \
        frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: skills page — markdown editor for skill files"
```

---

## Task 14: Frontend — Settings update

**Files:**
- Modify: `frontend/src/api/org.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Update frontend/src/api/org.ts**

```typescript
import { apiFetch } from './client'

export interface OrgSettings {
  org_id: string
  org_name: string
  org_slug: string
  system_prompt: string | null
  openrouter_api_key: string | null
  default_model: string | null
  search_api_key: string | null
}

export const orgApi = {
  getSettings: () => apiFetch<OrgSettings>('/org'),
  patchSettings: (body: Partial<Pick<OrgSettings,
    'system_prompt' | 'openrouter_api_key' | 'default_model' | 'search_api_key'>>) =>
    apiFetch<OrgSettings>('/org', { method: 'PATCH', body: JSON.stringify(body) }),
}
```

- [ ] **Step 2: Update SettingsPage.tsx**

Add `orgPrompt` and `searchApiKey` state + fields.

After the existing `const [model, setModel]` state declarations, add:
```typescript
const [orgPrompt, setOrgPrompt] = useState('')
const [searchApiKey, setSearchApiKey] = useState('')
```

In the `useEffect` loading block, add:
```typescript
setOrgPrompt(s.system_prompt ?? '')
setSearchApiKey(s.search_api_key ?? '')
```

In `handleSave`, add to the patch body:
```typescript
system_prompt: orgPrompt,
search_api_key: searchApiKey,
```

Add a new section after the AI Provider section:

```tsx
<section className="settings__section">
  <div className="settings__section-head">
    <Icon name="spark" size={14} />
    <span className="settings__section-title">Organization Context</span>
  </div>
  <div className="settings__fields">
    <div className="field">
      <label className="label" htmlFor="org-prompt">Org system prompt</label>
      <textarea
        id="org-prompt"
        className="agent-cfg__prompt"
        rows={5}
        value={orgPrompt}
        onChange={e => setOrgPrompt(e.target.value)}
        placeholder="Instructions injected into every agent's context…"
      />
      <p className="settings__hint">Injected at the top of every agent's system prompt.</p>
    </div>
    <div className="field">
      <label className="label" htmlFor="search-key">Search API Key (Serper)</label>
      <input
        id="search-key"
        className="input"
        type="password"
        placeholder="serper.dev API key"
        value={searchApiKey}
        onChange={e => setSearchApiKey(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <p className="settings__hint">
        Required for web_search tool. Get at <span className="mono" style={{color:'var(--accent)'}}>serper.dev</span>
      </p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Test manually**

Open http://localhost:5173/settings:
- Org system prompt field appears and saves
- Search API key field appears and saves
- Existing OpenRouter key and model still work

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/org.ts frontend/src/pages/SettingsPage.tsx
git commit -m "feat: settings page — org system prompt and search API key fields"
```

---

## Task 15: End-to-end verification

- [ ] **Step 1: Run full backend test suite**

```bash
python -m pytest tests/ -v
```
Expected: all PASS

- [ ] **Step 2: Start the app**

```bash
make dev
# or: uvicorn graphait.main:app --reload & cd frontend && npm run dev
```

- [ ] **Step 3: Manual end-to-end test**

1. Register at http://localhost:5173
2. Go to Settings — set OpenRouter API key + org prompt
3. Go to Skills — create skill "Python Senior" with content `# Python\nWrite clean, tested Python.`
4. Go to Agents — create AI agent:
   - ID: `backend-dev`
   - Name: Backend Developer
   - Role: Backend Engineer
   - Model: `anthropic/claude-sonnet-4-5`
   - Working dir: `./workspaces/backend-dev`
   - Tools: check `read_file`, `write_file`
   - Skills: check `python-senior`
   - Schedule: 120 seconds
5. Go to Board — create task "Write hello.py", assign to `backend-dev`
6. Wait for agent to pick up (or click "Run now" in agent panel)
7. Refresh board — task status should change to `done`
8. Click task — comments should show agent's work

- [ ] **Step 4: Verify graph renders correctly**

Go to /agents — graph should show backend-dev node with edge to any agent it reports_to.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: end-to-end verification complete — Graphait MVP v2"
```

