# Blocked Task Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an agent calls `ask_agent(agent_id, question)`, the task is reassigned to the asked party and automatically returns to the original agent once they respond.

**Architecture:** New `ask_agent` tool atomically posts a question comment, sets `task.blocked_by_agent_id`, and reassigns the task. A `TaskBlockingService` handles the return trigger — called from `loop.py`'s `_close()` (AI→AI path) and the `add_comment` HTTP endpoint (human→AI path). The `_close()` local function in `loop.py` is extended to always call a `_maybe_unblock_return()` closure after committing.

**Tech Stack:** Python/FastAPI/SQLAlchemy, SQLite, React/TypeScript, Alembic for migrations.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `alembic/versions/v6_blocked_task_continuity.py` | Create | Migration adding `blocked_by_agent_id` to tasks |
| `graphait/models/task.py` | Modify | Add `blocked_by_agent_id` mapped column |
| `graphait/schemas/task.py` | Modify | Add `blocked_by_agent_id` to TaskRead, TaskUpdate |
| `graphait/modules/agent/tools.py` | Modify | Add `ask_agent` schema + handler + register |
| `graphait/modules/tasks/blocking.py` | Create | `TaskBlockingService` with `on_run_closed` + `on_comment_added` |
| `graphait/modules/agent/loop.py` | Modify | Terminal handler for `ask_agent`; `_maybe_unblock_return` in `_close`; context note in `_task_message` |
| `graphait/api/v1/tasks.py` | Modify | `add_comment` wires blocking service + fallback trigger |
| `frontend/src/api/tasks.ts` | Modify | Add `blocked_by_agent_id: string \| null` to Task interface |
| `frontend/src/pages/BoardPage.tsx` | Modify | Badge in TaskDrawer when `blocked_by_agent_id` set |
| `tests/test_blocking.py` | Create | Unit tests for tool + service |

---

### Task 1: Migration — add `blocked_by_agent_id` column

**Files:**
- Create: `alembic/versions/v6_blocked_task_continuity.py`

- [ ] **Step 1: Create the migration file**

```python
# alembic/versions/v6_blocked_task_continuity.py
"""v6: add blocked_by_agent_id to tasks

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('blocked_by_agent_id', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'blocked_by_agent_id')
```

- [ ] **Step 2: Apply to the live dev SQLite DB directly**

Alembic migrations use JSONB elsewhere and can't run end-to-end on SQLite. Add the column manually:

```bash
.venv/bin/python -c "
import sqlite3
conn = sqlite3.connect('graphait.db')
try:
    conn.execute('ALTER TABLE tasks ADD COLUMN blocked_by_agent_id TEXT')
    conn.commit()
    print('Column added')
except Exception as e:
    print(f'Skip (likely exists): {e}')
conn.close()
"
```

Expected: `Column added`

- [ ] **Step 3: Commit**

```bash
git add alembic/versions/v6_blocked_task_continuity.py
git commit -m "feat: migration v6 — blocked_by_agent_id on tasks"
```

---

### Task 2: Task model + schemas + frontend types

**Files:**
- Modify: `graphait/models/task.py`
- Modify: `graphait/schemas/task.py`
- Modify: `frontend/src/api/tasks.ts`

- [ ] **Step 1: Add field to Task model**

In `graphait/models/task.py`, after line 56 (`orchestration_review_pending`), add:

```python
    blocked_by_agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
```

Full context — the block of orchestration fields should now read:
```python
    orchestrator_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    human_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    orchestration_review_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_by_agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
```

- [ ] **Step 2: Add to TaskRead and TaskUpdate schemas**

Replace `graphait/schemas/task.py` contents with:

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
    orchestrator_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[str] = None
    outcome: Optional[str] = None
    orchestrator_id: Optional[str] = None
    human_review_required: Optional[bool] = None
    orchestration_review_pending: Optional[bool] = None
    blocked_by_agent_id: Optional[str] = None


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
    sub_number: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    outcome: Optional[str] = None
    subtasks: list['TaskRead'] = []
    orchestrator_id: Optional[str] = None
    human_review_required: bool = False
    orchestration_review_pending: bool = False
    blocked_by_agent_id: Optional[str] = None

    model_config = {"from_attributes": True}

TaskRead.model_rebuild()
```

- [ ] **Step 3: Add to frontend Task interface**

In `frontend/src/api/tasks.ts`, in the `Task` interface after `orchestration_review_pending: boolean`, add:

```typescript
  blocked_by_agent_id: string | null
```

Also add `blocked_by_agent_id?: string | null` to the `tasksApi.update` body type, after `orchestration_review_pending?: boolean`:

```typescript
  update: (id: string, body: {
    title?: string
    description?: string
    status?: TaskStatus
    priority?: TaskPriority
    assignee_id?: string
    outcome?: string
    orchestrator_id?: string | null
    human_review_required?: boolean
    orchestration_review_pending?: boolean
    blocked_by_agent_id?: string | null
  }) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
```

- [ ] **Step 4: Verify app still imports cleanly**

```bash
.venv/bin/python -c "from graphait.schemas.task import TaskRead; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add graphait/models/task.py graphait/schemas/task.py frontend/src/api/tasks.ts
git commit -m "feat: blocked_by_agent_id field on task model, schemas, frontend types"
```

---

### Task 3: `ask_agent` tool

**Files:**
- Modify: `graphait/modules/agent/tools.py`
- Test: `tests/test_blocking.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_blocking.py`:

```python
import uuid
import pytest
import graphait.config.loader as loader_mod
from graphait.models.task import Task, Comment, TaskStatus, TaskPriority
from graphait.modules.agent.tools import ToolContext, execute_tool


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def org_id():
    return uuid.uuid4()


def _task(db, org_id, *, number=1, assignee="agent-a", blocked_by=None,
          status=TaskStatus.in_progress):
    t = Task(
        org_id=org_id, number=number, title="T",
        status=status, priority=TaskPriority.medium,
        assignee_id=assignee, blocked_by_agent_id=blocked_by,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _ctx(db, org_id, task, agent_id="agent-a"):
    return ToolContext(
        db=db, org_id=str(org_id), task_id=str(task.id),
        agent_id=agent_id, working_dir="/tmp",
    )


# --- ask_agent tool tests ---

def test_ask_agent_sets_fields(db, org_id):
    task = _task(db, org_id)
    ctx = _ctx(db, org_id, task, agent_id="agent-a")

    result = execute_tool("ask_agent", {"agent_id": "agent-b", "question": "What is X?"}, ctx)

    assert "agent-b" in result
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"
    assert task.assignee_id == "agent-b"
    assert task.status == TaskStatus.in_progress
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert len(comments) == 1
    assert "@agent-b: What is X?" in comments[0].content
    assert comments[0].is_system is False


def test_ask_agent_rejects_chaining(db, org_id):
    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    ctx = _ctx(db, org_id, task, agent_id="agent-b")

    result = execute_tool("ask_agent", {"agent_id": "agent-c", "question": "And?"}, ctx)

    assert "Error" in result
    assert "single-level" in result
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
.venv/bin/python -m pytest tests/test_blocking.py::test_ask_agent_sets_fields tests/test_blocking.py::test_ask_agent_rejects_chaining -v
```

Expected: FAIL — `KeyError: 'ask_agent'`

- [ ] **Step 3: Add `ask_agent` schema to `TOOL_SCHEMAS`**

In `graphait/modules/agent/tools.py`, after the `"request_approval"` entry (line 54), add:

```python
    "ask_agent": {"type": "function", "function": {
        "name": "ask_agent",
        "description": (
            "Ask another agent or user a question. Reassigns this task to them so they can answer. "
            "Your run will close automatically — the task returns to you once they respond."
        ),
        "parameters": {"type": "object",
                       "properties": {
                           "agent_id": {"type": "string",
                                        "description": "ID slug of the agent or user to ask (e.g. 'cto', 'backend-dev')"},
                           "question": {"type": "string",
                                        "description": "The question to ask"}},
                       "required": ["agent_id", "question"]}}},
```

- [ ] **Step 4: Add `"ask_agent"` to `ALWAYS_ON_TOOLS`**

Replace line 9:
```python
ALWAYS_ON_TOOLS = ["post_comment", "update_status", "create_task", "assign_task", "request_approval", "ask_agent"]
```

- [ ] **Step 5: Add `_ask_agent` handler function**

After `_request_approval` (before `_HANDLERS`), add:

```python
def _ask_agent(args: dict, ctx: ToolContext) -> str:
    import uuid as uuid_mod
    from graphait.models.task import Task, Comment, TaskStatus
    task = ctx.db.query(Task).filter(Task.id == uuid_mod.UUID(ctx.task_id)).first()
    if not task:
        return "Error: task not found"
    if task.blocked_by_agent_id:
        return "Error: cannot ask while already waiting for an answer (v1: single-level only)."
    agent_id = args["agent_id"]
    question = args["question"]
    ctx.db.add(Comment(task_id=task.id, author_id=ctx.agent_id,
                       content=f"@{agent_id}: {question}", is_system=False))
    task.blocked_by_agent_id = ctx.agent_id
    task.assignee_id = agent_id
    task.status = TaskStatus.in_progress
    ctx.db.commit()
    if ctx.scheduler_trigger:
        ctx.scheduler_trigger(agent_id)
    return f"Question posted to @{agent_id}. Task reassigned. Your run will now close."
```

- [ ] **Step 6: Register in `_HANDLERS`**

Replace the `_HANDLERS` dict at the bottom of the file:

```python
_HANDLERS = {
    "post_comment": _post_comment, "update_status": _update_status,
    "create_task": _create_task, "assign_task": _assign_task,
    "request_approval": _request_approval, "ask_agent": _ask_agent,
    "read_file": _read_file, "write_file": _write_file,
    "list_directory": _list_directory, "web_search": _web_search,
    "fetch_url": _fetch_url,
}
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
.venv/bin/python -m pytest tests/test_blocking.py::test_ask_agent_sets_fields tests/test_blocking.py::test_ask_agent_rejects_chaining -v
```

Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add graphait/modules/agent/tools.py tests/test_blocking.py
git commit -m "feat: ask_agent tool — post question, reassign task, single-level guard"
```

---

### Task 4: `TaskBlockingService`

**Files:**
- Create: `graphait/modules/tasks/blocking.py`
- Modify: `tests/test_blocking.py` (append tests)

- [ ] **Step 1: Write failing tests — append to `tests/test_blocking.py`**

```python
# --- TaskBlockingService tests ---

def test_on_run_closed_returns_to_original(db, org_id, monkeypatch):
    from graphait.modules.tasks import blocking as bl_mod
    triggered = []
    monkeypatch.setattr(bl_mod, "_trigger", lambda aid: triggered.append(aid))

    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-b")

    db.refresh(task)
    assert task.assignee_id == "agent-a"
    assert task.blocked_by_agent_id is None
    assert task.status == TaskStatus.in_progress
    assert triggered == ["agent-a"]
    comments = db.query(Comment).filter(Comment.task_id == task.id).all()
    assert len(comments) == 1
    assert "agent-a" in comments[0].content
    assert comments[0].is_system is True


def test_on_run_closed_skips_when_original_closes(db, org_id):
    task = _task(db, org_id, assignee="agent-b", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-a")  # original closing

    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged
    assert task.assignee_id == "agent-b"           # unchanged


def test_on_run_closed_noop_when_no_blocked_by(db, org_id):
    task = _task(db, org_id)
    from graphait.modules.tasks.blocking import blocking_service
    blocking_service.on_run_closed(db, task, "agent-a")  # no-op
    db.refresh(task)
    assert task.blocked_by_agent_id is None


def test_on_comment_added_triggers_return(db, org_id, monkeypatch):
    from graphait.modules.tasks import blocking as bl_mod
    triggered = []
    monkeypatch.setattr(bl_mod, "_trigger", lambda aid: triggered.append(aid))

    task = _task(db, org_id, assignee="human-user", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "human-user")

    assert result is True
    db.refresh(task)
    assert task.assignee_id == "agent-a"
    assert task.blocked_by_agent_id is None
    assert task.status == TaskStatus.in_progress
    assert triggered == ["agent-a"]


def test_on_comment_added_ignores_wrong_commenter(db, org_id):
    task = _task(db, org_id, assignee="human-user", blocked_by="agent-a")
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "someone-else")

    assert result is False
    db.refresh(task)
    assert task.blocked_by_agent_id == "agent-a"  # unchanged


def test_on_comment_added_noop_when_no_blocked_by(db, org_id):
    task = _task(db, org_id)
    from graphait.modules.tasks.blocking import blocking_service
    result = blocking_service.on_comment_added(db, task, "agent-a")
    assert result is False
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
.venv/bin/python -m pytest tests/test_blocking.py -k "on_run_closed or on_comment_added" -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'graphait.modules.tasks.blocking'`

- [ ] **Step 3: Create `graphait/modules/tasks/blocking.py`**

```python
import logging
from sqlalchemy.orm import Session
from graphait.models.task import Task, Comment, TaskStatus

logger = logging.getLogger(__name__)


class TaskBlockingService:

    def on_run_closed(self, db: Session, task: Task, agent_id: str) -> None:
        """Called when an agent's run closes. If agent_id is the asked agent
        (not the original), return the task to the original agent."""
        db.refresh(task)
        orig = task.blocked_by_agent_id
        if not orig:
            return
        if agent_id == orig:
            # Original agent's run closing (after ask_agent) — not a return signal
            return
        responder = task.assignee_id
        task.blocked_by_agent_id = None
        task.assignee_id = orig
        task.status = TaskStatus.in_progress
        db.add(Comment(
            task_id=task.id,
            author_id="system",
            content=f"Answer received from @{responder}. Returning task to @{orig}.",
            is_system=True,
        ))
        db.commit()
        _trigger(orig)

    def on_comment_added(self, db: Session, task: Task, commenter_agent_id: str) -> bool:
        """Called when a human posts a comment via the HTTP endpoint.
        Returns True if the unblock was triggered (caller should skip normal trigger)."""
        if not task.blocked_by_agent_id:
            return False
        if commenter_agent_id != task.assignee_id:
            return False
        orig = task.blocked_by_agent_id
        task.blocked_by_agent_id = None
        task.assignee_id = orig
        task.status = TaskStatus.in_progress
        db.add(Comment(
            task_id=task.id,
            author_id="system",
            content=f"Answer received from @{commenter_agent_id}. Returning task to @{orig}.",
            is_system=True,
        ))
        db.commit()
        _trigger(orig)
        return True


def _trigger(agent_id: str) -> None:
    try:
        from graphait.modules.scheduler.service import scheduler_service
        if hasattr(scheduler_service, "trigger_agent"):
            scheduler_service.trigger_agent(agent_id)
    except Exception as exc:
        logger.warning("Failed to trigger agent %s: %s", agent_id, exc)


blocking_service = TaskBlockingService()
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
.venv/bin/python -m pytest tests/test_blocking.py -v
```

Expected: All tests PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/tasks/blocking.py tests/test_blocking.py
git commit -m "feat: TaskBlockingService — on_run_closed and on_comment_added"
```

---

### Task 5: Wire `loop.py` — terminal handler, unblock return, task message

**Files:**
- Modify: `graphait/modules/agent/loop.py`

- [ ] **Step 1: Add `_maybe_unblock_return` closure and extend `_close` inside `run()`**

In `loop.py`, the `run()` method has local functions `_log` and `_close`. After the `_close` function definition (currently ending at line 167), add `_maybe_unblock_return` and modify `_close` to call it.

Replace the `_close` definition (lines 164–167):

```python
        def _close(status: RunStatus) -> None:
            run.finished_at = datetime.utcnow()
            run.status = status
            self.db.commit()
```

With:

```python
        def _maybe_unblock_return() -> None:
            self.db.refresh(self.task)
            orig = self.task.blocked_by_agent_id
            if not orig:
                return
            if self.agent.id == orig:
                return
            from graphait.modules.tasks.blocking import blocking_service
            blocking_service.on_run_closed(self.db, self.task, self.agent.id)

        def _close(status: RunStatus) -> None:
            run.finished_at = datetime.utcnow()
            run.status = status
            self.db.commit()
            _maybe_unblock_return()
```

- [ ] **Step 2: Add `ask_agent` as a terminal tool in the tool-call loop**

In `run()`, after the `request_approval` terminal handler (currently lines 231–233):

```python
                if fn["name"] == "request_approval":
                    _close(RunStatus.blocked)
                    return
```

Add immediately after:

```python
                if fn["name"] == "ask_agent":
                    _close(RunStatus.blocked)
                    return
```

- [ ] **Step 3: Add context note in `_task_message()` when agent is the asked party**

Replace `_task_message` (lines 80–107) with:

```python
    def _task_message(self) -> str:
        comments = (self.db.query(Comment)
                    .filter(Comment.task_id == self.task.id)
                    .order_by(Comment.created_at.desc())
                    .limit(10).all())
        comments_text = "\n".join(
            f"[{c.author_id}]: {c.content}" for c in reversed(comments)
        ) or "(no comments yet)"

        subtasks = getattr(self.task, "subtasks", []) or []
        if subtasks:
            subtasks_text = "\n".join(
                f"  - #{s.number} [{s.status.value}] {s.title}" for s in subtasks
            )
        else:
            subtasks_text = "  (none)"

        if (self.task.blocked_by_agent_id
                and self.task.blocked_by_agent_id != self.agent.id):
            footer = (
                f"## Important: You have been asked a question\n"
                f"@{self.task.blocked_by_agent_id} is waiting for your answer "
                f"(see the latest comment above).\n"
                f"Post your answer using post_comment, then end your turn normally.\n"
                f"The task will automatically return to "
                f"@{self.task.blocked_by_agent_id} after your run completes.\n"
                f"Do NOT call update_status(done) — you are not the owner of this task."
            )
        else:
            footer = (
                "Read the existing subtasks and comments above before starting any work. "
                "Do not create subtasks that already exist. "
                "Call update_status(done) when complete, "
                "update_status(blocked) if you need more information."
            )

        return (
            f"## Task #{self.task.number}: {self.task.title}\n\n"
            f"{self.task.description or '(no description)'}\n\n"
            f"Priority: {self.task.priority.value} | Status: {self.task.status.value}\n\n"
            f"## Existing subtasks (do NOT recreate these)\n{subtasks_text}\n\n"
            f"## Recent comments\n{comments_text}\n\n---\n"
            f"{footer}"
        )
```

- [ ] **Step 4: Verify import cleanly**

```bash
.venv/bin/python -c "from graphait.modules.agent.loop import AgentLoop; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add graphait/modules/agent/loop.py
git commit -m "feat: loop.py — ask_agent terminal handler, _maybe_unblock_return, asked-agent context note"
```

---

### Task 6: Wire `add_comment` endpoint

**Files:**
- Modify: `graphait/api/v1/tasks.py`

- [ ] **Step 1: Update `add_comment` to capture task, call blocking service, add fallback trigger**

Replace lines 91–97 in `graphait/api/v1/tasks.py`:

```python
@router.post("/{task_id}/comments", response_model=CommentRead,
             status_code=status.HTTP_201_CREATED)
def add_comment(task_id: uuid.UUID, body: CommentCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _get_task_or_404(task_id, current_user, db)
    author_id = _get_creator_id(current_user)
    return comment_service.create(db, task_id, author_id, body)
```

With:

```python
@router.post("/{task_id}/comments", response_model=CommentRead,
             status_code=status.HTTP_201_CREATED)
def add_comment(task_id: uuid.UUID, body: CommentCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    author_id = _get_creator_id(current_user)
    comment = comment_service.create(db, task_id, author_id, body)
    from graphait.modules.tasks.blocking import blocking_service
    unblocked = blocking_service.on_comment_added(db, task, author_id)
    if not unblocked and task.assignee_id:
        _trigger(task.assignee_id)
    return comment
```

- [ ] **Step 2: Verify no import errors**

```bash
.venv/bin/python -c "from graphait.api.v1.tasks import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run the full test suite to check nothing is broken**

```bash
.venv/bin/python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: test_blocking tests all pass; pre-existing failures unchanged.

- [ ] **Step 4: Commit**

```bash
git add graphait/api/v1/tasks.py
git commit -m "feat: wire blocking service in add_comment — detects human answer, triggers return"
```

---

### Task 7: Frontend — TaskDrawer badge

**Files:**
- Modify: `frontend/src/pages/BoardPage.tsx`

- [ ] **Step 1: Add badge in TaskDrawer header**

In `BoardPage.tsx`, find the `drawer__crumbs` div inside `TaskDrawer` (around line 348):

```tsx
          <div className="drawer__crumbs">
            <span className="mono">#{task.number}</span>
            <span style={{color:'var(--ink-4)'}}>·</span>
            <span className="badge badge--dot" style={{'--dot': STATUS_META[task.status].dot} as React.CSSProperties}>
              {STATUS_META[task.status].label}
            </span>
          </div>
```

Replace with:

```tsx
          <div className="drawer__crumbs">
            <span className="mono">#{task.number}</span>
            <span style={{color:'var(--ink-4)'}}>·</span>
            <span className="badge badge--dot" style={{'--dot': STATUS_META[task.status].dot} as React.CSSProperties}>
              {STATUS_META[task.status].label}
            </span>
            {task.blocked_by_agent_id && (
              <span className="badge" style={{background:'var(--accent-warn,#f59e0b)',color:'#fff',fontSize:'var(--fs-xs)',padding:'2px 7px'}}>
                ⏳ Waiting for @{task.blocked_by_agent_id}
              </span>
            )}
          </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
env -u NODE_OPTIONS npm --prefix frontend run build 2>&1 | grep -E "error|Error|warning" | head -10
```

Expected: No TypeScript errors (warnings about unused vars are OK).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BoardPage.tsx
git commit -m "feat: TaskDrawer badge shows waiting-for-agent when blocked_by_agent_id set"
```

---

## Final Verification

- [ ] Run full test suite:

```bash
.venv/bin/python -m pytest tests/test_blocking.py tests/test_orchestration.py -v
```

Expected: All blocking tests pass (8), all orchestration tests pass (5).

- [ ] Verify `ask_agent` appears in tool schemas:

```bash
.venv/bin/python -c "
from graphait.modules.agent.tools import get_tool_schemas
schemas = get_tool_schemas([])
names = [s['function']['name'] for s in schemas]
print(names)
assert 'ask_agent' in names
"
```

Expected: `['post_comment', 'update_status', 'create_task', 'assign_task', 'request_approval', 'ask_agent']`
