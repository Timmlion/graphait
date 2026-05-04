# Task Orchestration Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a subtask closes, post a system comment on the parent task; once all siblings are resolved, either trigger the orchestrator agent or surface a review flag in the Inbox.

**Architecture:** Three new boolean/string columns on `tasks` + a new `TaskOrchestrationService` that is called from the PATCH `/tasks/{id}` endpoint after any terminal status update on a subtask. The Inbox gains an "Orchestration Review" section. TaskDrawer gains a collapsible Orchestration section.

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic, React/TypeScript, SQLite (test), pytest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `alembic/versions/v5_task_orchestration.py` | DB migration: 3 new columns on `tasks` |
| Modify | `graphait/models/task.py` | Add 3 mapped columns to `Task` |
| Modify | `graphait/schemas/task.py` | Add fields to `TaskRead`, `TaskUpdate`, `TaskCreate` |
| Modify | `graphait/modules/tasks/service.py` | Default `orchestrator_id` to `creator_id` on create |
| Create | `graphait/modules/tasks/orchestration.py` | `TaskOrchestrationService.on_subtask_closed()` |
| Modify | `graphait/api/v1/tasks.py` | Wire orchestration hook in `update_task` |
| Create | `tests/test_orchestration.py` | Unit tests for orchestration service |
| Modify | `frontend/src/api/tasks.ts` | New fields on `Task`, `Comment`; update `tasksApi.update` |
| Modify | `frontend/src/pages/BoardPage.tsx` | TaskDrawer orchestration section + `resolveAuthor` fix |
| Modify | `frontend/src/pages/InboxPage.tsx` | Orchestration review section |

---

## Task 1: DB Migration

**Files:**
- Create: `alembic/versions/v5_task_orchestration.py`

The existing migration chain ends at `v4_task_outcome.py` (revision `c3d4e5f6a7b8`). This migration appends to that chain.

- [ ] **Step 1: Write the migration file**

Create `alembic/versions/v5_task_orchestration.py`:

```python
"""v5: add orchestration columns to tasks

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('orchestrator_id', sa.String(100), nullable=True))
    op.add_column('tasks', sa.Column('human_review_required', sa.Boolean(),
                                     server_default=sa.text('0'), nullable=False))
    op.add_column('tasks', sa.Column('orchestration_review_pending', sa.Boolean(),
                                     server_default=sa.text('0'), nullable=False))


def downgrade() -> None:
    op.drop_column('tasks', 'orchestration_review_pending')
    op.drop_column('tasks', 'human_review_required')
    op.drop_column('tasks', 'orchestrator_id')
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/other/Projects/AI/graphait
alembic upgrade head
```

Expected: `Running upgrade c3d4e5f6a7b8 -> d4e5f6a7b8c9, v5: add orchestration columns to tasks`

- [ ] **Step 3: Commit**

```bash
git add alembic/versions/v5_task_orchestration.py
git commit -m "feat: migration v5 — orchestration columns on tasks"
```

---

## Task 2: Task Model + Schemas

**Files:**
- Modify: `graphait/models/task.py`
- Modify: `graphait/schemas/task.py`
- Modify: `graphait/modules/tasks/service.py`

- [ ] **Step 1: Write the failing test**

In `tests/test_tasks_api.py`, add at the end:

```python
def test_orchestration_fields_in_task_read(client, headers):
    resp = client.post("/api/v1/tasks", json={"title": "Orchestrated"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "orchestrator_id" in data
    assert "human_review_required" in data
    assert data["human_review_required"] is False
    assert "orchestration_review_pending" in data
    assert data["orchestration_review_pending"] is False


def test_orchestrator_id_patchable(client, headers):
    resp = client.post("/api/v1/tasks", json={"title": "Patch orchestrator"}, headers=headers)
    task_id = resp.json()["id"]
    resp = client.patch(f"/api/v1/tasks/{task_id}",
                        json={"orchestrator_id": "cto", "human_review_required": True},
                        headers=headers)
    assert resp.status_code == 200
    assert resp.json()["orchestrator_id"] == "cto"
    assert resp.json()["human_review_required"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_tasks_api.py::test_orchestration_fields_in_task_read tests/test_tasks_api.py::test_orchestrator_id_patchable -v
```

Expected: FAIL — `KeyError: 'orchestrator_id'` or validation error.

- [ ] **Step 3: Add columns to `graphait/models/task.py`**

Open `graphait/models/task.py`. After the `outcome` column (around line 32), add:

```python
    orchestrator_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    human_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    orchestration_review_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

The `Boolean` import is already available (`from sqlalchemy import ... Boolean` — check; if not present, add it to the SQLAlchemy imports line).

- [ ] **Step 4: Update `graphait/schemas/task.py`**

Replace the full file content:

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

    model_config = {"from_attributes": True}

TaskRead.model_rebuild()
```

- [ ] **Step 5: Update `graphait/modules/tasks/service.py` — default orchestrator_id**

Replace the `create` method body so `orchestrator_id` defaults to `creator_id` when not supplied:

```python
    def create(self, db: Session, org_id: uuid.UUID, creator_id: str, data: TaskCreate) -> Task:
        sub_number = (
            self._next_sub_number(db, data.parent_task_id) if data.parent_task_id else None
        )
        task_data = data.model_dump()
        if not task_data.get('orchestrator_id'):
            task_data['orchestrator_id'] = creator_id
        task = Task(
            org_id=org_id,
            creator_id=creator_id,
            number=self._next_number(db, org_id),
            sub_number=sub_number,
            **task_data,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pytest tests/test_tasks_api.py::test_orchestration_fields_in_task_read tests/test_tasks_api.py::test_orchestrator_id_patchable -v
```

Expected: PASS (both tests green)

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
pytest tests/ -v --tb=short
```

Expected: all previously passing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add graphait/models/task.py graphait/schemas/task.py graphait/modules/tasks/service.py tests/test_tasks_api.py
git commit -m "feat: orchestration fields on Task model and schemas"
```

---

## Task 3: TaskOrchestrationService

**Files:**
- Create: `graphait/modules/tasks/orchestration.py`
- Create: `tests/test_orchestration.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_orchestration.py`:

```python
import uuid
import pytest
import graphait.config.loader as loader_mod
from graphait.models.task import Task, Comment, TaskStatus, TaskPriority, TaskType


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


@pytest.fixture()
def org_id():
    return uuid.uuid4()


@pytest.fixture()
def parent_task(db, org_id):
    t = Task(
        org_id=org_id,
        number=1,
        title="Parent",
        status=TaskStatus.in_progress,
        priority=TaskPriority.medium,
        creator_id="cto",
        orchestrator_id="cto",
        human_review_required=False,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _make_subtask(db, parent, number, status, sub_number=None):
    s = Task(
        org_id=parent.org_id,
        number=number,
        sub_number=sub_number or number,
        title=f"Sub {number}",
        status=status,
        priority=TaskPriority.medium,
        parent_task_id=parent.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_system_comment_posted_on_parent(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orchestration_service.on_subtask_closed(db, sub)
    comments = db.query(Comment).filter(Comment.task_id == parent_task.id).all()
    assert len(comments) == 1
    assert "Sub 2" in comments[0].content
    assert comments[0].is_system is True
    assert comments[0].author_id == "system"


def test_no_trigger_when_siblings_pending(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    _make_subtask(db, parent_task, 2, TaskStatus.in_progress, sub_number=1)
    sub2 = _make_subtask(db, parent_task, 3, TaskStatus.done, sub_number=2)
    orchestration_service.on_subtask_closed(db, sub2)
    # parent should NOT be reassigned or flagged
    db.refresh(parent_task)
    assert parent_task.orchestration_review_pending is False
    assert parent_task.assignee_id is None


def test_human_review_sets_pending_flag(db, parent_task):
    from graphait.modules.tasks.orchestration import orchestration_service
    parent_task.human_review_required = True
    db.commit()
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orchestration_service.on_subtask_closed(db, sub)
    db.refresh(parent_task)
    assert parent_task.orchestration_review_pending is True


def test_auto_trigger_reassigns_parent(db, parent_task, monkeypatch):
    from graphait.modules.tasks import orchestration as orch_mod
    triggered = []
    monkeypatch.setattr(orch_mod, "_trigger", lambda agent_id: triggered.append(agent_id))
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orch_mod.orchestration_service.on_subtask_closed(db, sub)
    db.refresh(parent_task)
    assert parent_task.assignee_id == "cto"
    assert triggered == ["cto"]


def test_auto_trigger_adds_context_comment(db, parent_task, monkeypatch):
    from graphait.modules.tasks import orchestration as orch_mod
    monkeypatch.setattr(orch_mod, "_trigger", lambda _: None)
    sub = _make_subtask(db, parent_task, 2, TaskStatus.done, sub_number=1)
    orch_mod.orchestration_service.on_subtask_closed(db, sub)
    comments = db.query(Comment).filter(Comment.task_id == parent_task.id).all()
    # Two comments: the subtask-closed comment + the context comment
    assert len(comments) == 2
    context_comment = next(c for c in comments if "Review outcomes" in c.content)
    assert context_comment.is_system is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_orchestration.py -v
```

Expected: ImportError or all tests FAIL — `orchestration.py` does not exist yet.

- [ ] **Step 3: Create `graphait/modules/tasks/orchestration.py`**

```python
from sqlalchemy.orm import Session
from graphait.models.task import Task, Comment, TaskStatus

TERMINAL_STATUSES = {TaskStatus.done, TaskStatus.cancelled}


class TaskOrchestrationService:

    def on_subtask_closed(self, db: Session, task: Task) -> None:
        parent = db.query(Task).filter(Task.id == task.parent_task_id).first()
        if not parent:
            return

        # Step 1: system comment on parent
        label = task.sub_number if task.sub_number is not None else task.number
        db.add(Comment(
            task_id=parent.id,
            author_id="system",
            content=f"Subtask #{parent.number}.{label} '{task.title}' marked {task.status.value}.",
            is_system=True,
        ))
        db.commit()

        # Step 2: check siblings
        siblings = db.query(Task).filter(Task.parent_task_id == parent.id).all()
        if not all(s.status in TERMINAL_STATUSES for s in siblings):
            return

        # Step 3: all resolved — human review or auto-trigger
        orchestrator_id = parent.orchestrator_id or parent.creator_id
        if not orchestrator_id:
            return

        if parent.human_review_required:
            parent.orchestration_review_pending = True
            db.commit()
        else:
            db.add(Comment(
                task_id=parent.id,
                author_id="system",
                content=(
                    "All subtasks complete. Reassigning to orchestrator for review. "
                    "Review outcomes and decide: close this task with a summary outcome, "
                    "or create new subtasks for follow-up work."
                ),
                is_system=True,
            ))
            parent.assignee_id = orchestrator_id
            if parent.status not in {TaskStatus.todo, TaskStatus.in_progress}:
                parent.status = TaskStatus.in_progress
            db.commit()
            db.refresh(parent)
            _trigger(orchestrator_id)


def _trigger(agent_id: str) -> None:
    try:
        from graphait.modules.scheduler.service import scheduler_service
        if hasattr(scheduler_service, "trigger_agent"):
            scheduler_service.trigger_agent(agent_id)
    except Exception:
        pass


orchestration_service = TaskOrchestrationService()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_orchestration.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/ -v --tb=short
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add graphait/modules/tasks/orchestration.py tests/test_orchestration.py
git commit -m "feat: TaskOrchestrationService with on_subtask_closed"
```

---

## Task 4: Wire Orchestration Hook Into Router

**Files:**
- Modify: `graphait/api/v1/tasks.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_tasks_api.py` (which already has a `headers` fixture and `import uuid`):

```python
def test_api_patch_to_done_triggers_orchestration(client, headers, db):
    parent_resp = client.post("/api/v1/tasks", json={"title": "Parent API"}, headers=headers)
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    sub_resp = client.post("/api/v1/tasks",
                            json={"title": "Sub API", "parent_task_id": parent_id},
                            headers=headers)
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    resp = client.patch(f"/api/v1/tasks/{sub_id}", json={"status": "done"}, headers=headers)
    assert resp.status_code == 200

    from graphait.models.task import Comment
    comments = db.query(Comment).filter(
        Comment.task_id == uuid.UUID(parent_id)
    ).all()
    assert any("Sub API" in c.content for c in comments)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_tasks_api.py::test_api_patch_to_done_triggers_orchestration -v
```

Expected: FAIL — no comment posted (orchestration not wired yet).

- [ ] **Step 3: Update `update_task` in `graphait/api/v1/tasks.py`**

Replace the `update_task` function:

```python
@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    task = _get_task_or_404(task_id, current_user, db)
    updated = task_service.update(db, task, body)
    if body.assignee_id:
        _trigger(body.assignee_id)
    if body.status in (TaskStatus.done, TaskStatus.cancelled) and updated.parent_task_id:
        from graphait.modules.tasks.orchestration import orchestration_service
        orchestration_service.on_subtask_closed(db, updated)
    return updated
```

Also add `TaskStatus` to the imports at the top of the file (it is already imported via `from graphait.models.task import Task, Comment, TaskStatus`).

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_tasks_api.py::test_api_patch_to_done_triggers_orchestration -v
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/ -v --tb=short
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add graphait/api/v1/tasks.py tests/test_tasks_api.py
git commit -m "feat: wire orchestration hook in task update endpoint"
```

---

## Task 5: Frontend — Update Task and Comment Types

**Files:**
- Modify: `frontend/src/api/tasks.ts`

- [ ] **Step 1: Update `frontend/src/api/tasks.ts`**

Replace the full file:

```typescript
import { apiFetch } from './client'

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'waiting_approval' | 'approved' | 'rejected' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  org_id: string
  number: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  creator_id: string
  parent_task_id: string | null
  sub_number: number | null
  created_at: string
  updated_at: string
  outcome: string | null
  subtasks: Task[]
  orchestrator_id: string | null
  human_review_required: boolean
  orchestration_review_pending: boolean
}

export interface Comment {
  id: string
  task_id: string
  author_id: string | null
  content: string
  is_system: boolean
  created_at: string
}

export const tasksApi = {
  list: () => apiFetch<Task[]>('/tasks'),
  create: (body: { title: string; description?: string; priority?: TaskPriority; assignee_id?: string }) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
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
  }) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
  listComments: (id: string) => apiFetch<Comment[]>(`/tasks/${id}/comments`),
  addComment: (id: string, content: string) =>
    apiFetch<Comment>(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  approve: (id: string) => apiFetch<Task>(`/tasks/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => apiFetch<Task>(`/tasks/${id}/reject`, { method: 'POST' }),
  createSubtask: (parentId: string, body: { title: string; description?: string; priority?: TaskPriority; assignee_id?: string }) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify({ ...body, parent_task_id: parentId }) }),
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/other/Projects/AI/graphait/frontend
npm run build 2>&1 | head -40
```

Expected: build succeeds (or only pre-existing errors — no new type errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/tasks.ts
git commit -m "feat: Task and Comment types updated with orchestration fields"
```

---

## Task 6: Frontend — TaskDrawer Orchestration Section

**Files:**
- Modify: `frontend/src/pages/BoardPage.tsx`

This task adds a collapsible "Orchestration" section to TaskDrawer (shown when `task.subtasks.length > 0`), updates `resolveAuthor` to handle `is_system` comments, and passes `is_system` to the comment renderer.

- [ ] **Step 1: Update `resolveAuthor` in `TaskDrawer`**

Find the `resolveAuthor` function (around line 293 in BoardPage.tsx):

```typescript
  const resolveAuthor = (authorId: string | null): { name: string; isAgent: boolean } => {
    if (!authorId) return { name: 'System', isAgent: false }
    const agent = agents.find(a => a.id === authorId)
    if (agent) return { name: agent.name, isAgent: true }
    return { name: 'You', isAgent: false }
  }
```

Replace it with:

```typescript
  const resolveAuthor = (authorId: string | null, isSystem?: boolean): { name: string; isAgent: boolean } => {
    if (isSystem || authorId === 'system' || !authorId) return { name: 'System', isAgent: false }
    const agent = agents.find(a => a.id === authorId)
    if (agent) return { name: agent.name, isAgent: agent.type === 'ai' }
    return { name: 'You', isAgent: false }
  }
```

- [ ] **Step 2: Update comment rendering to pass `is_system`**

Find the comment render block inside `TaskDrawer` (around line 474):

```typescript
              {comments.map(c => {
                const { name, isAgent } = resolveAuthor(c.author_id)
```

Replace with:

```typescript
              {comments.map(c => {
                const { name, isAgent } = resolveAuthor(c.author_id, c.is_system)
```

- [ ] **Step 3: Add `orchestrationOpen` state to TaskDrawer**

Add after the existing `useState` declarations in `TaskDrawer` (after line 300):

```typescript
  const [orchestrationOpen, setOrchestrationOpen] = useState(false)
```

- [ ] **Step 4: Add the Orchestration section in the JSX**

Find the end of the Subtasks section (the closing `</div>` of the subtasks `drawer__section`, around line 465). Add the Orchestration section immediately after it:

```typescript
          {task.subtasks.length > 0 && (
            <div className="drawer__section">
              <button
                className="drawer__subhead"
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setOrchestrationOpen(o => !o)}
              >
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-4)', transition: 'transform 0.15s', display: 'inline-block', transform: orchestrationOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                <div className="eyebrow">Orchestration</div>
              </button>
              {orchestrationOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  <div className="metafield">
                    <div className="label" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginBottom: 4 }}>
                      Orchestrator — triggered when all subtasks complete
                    </div>
                    <AgentPicker
                      value={task.orchestrator_id}
                      agents={agents}
                      onChange={id => update({ orchestrator_id: id ?? null })}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={task.human_review_required}
                      onChange={e => update({ human_review_required: e.target.checked })}
                    />
                    Requires human review (Inbox notification instead of auto-trigger)
                  </label>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 5: Start the dev server and verify manually**

```bash
cd /Users/other/Projects/AI/graphait/frontend
npm run dev
```

Open the board page, open a task with subtasks, and verify:
- The Orchestration section appears with a `▶` toggle
- Clicking it expands to show the orchestrator dropdown and checkbox
- Selecting an orchestrator calls the update API (check network tab)
- Comments from system authors display as "System" in the activity feed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BoardPage.tsx
git commit -m "feat: TaskDrawer orchestration section and resolveAuthor system support"
```

---

## Task 7: Frontend — Inbox Orchestration Review Section

**Files:**
- Modify: `frontend/src/pages/InboxPage.tsx`

When a parent task has `orchestration_review_pending = true`, it appears in the Inbox under a new "Needs Orchestration Review" section. A "Dismiss" button clears the flag.

- [ ] **Step 1: Add `actionLoadingOrch` state and `handleDismissOrchestration` handler**

In `InboxPage`, after the existing `actionLoading` state declaration (around line 48), add:

```typescript
  const [actionLoadingOrch, setActionLoadingOrch] = useState<string | null>(null)

  async function handleDismissOrchestration(taskId: string) {
    setActionLoadingOrch(taskId)
    try {
      const updated = await tasksApi.update(taskId, { orchestration_review_pending: false })
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } finally {
      setActionLoadingOrch(null)
    }
  }
```

- [ ] **Step 2: Compute `orchReviewTasks`**

After the `pendingApprovals` declaration (around line 80), add:

```typescript
  const orchReviewTasks = tasks.filter(t => t.orchestration_review_pending)
```

- [ ] **Step 3: Add the Orchestration Review section to the JSX**

Find the `pendingApprovals` section in the JSX (around line 150). Add the new section immediately **before** it:

```typescript
          {orchReviewTasks.length > 0 && (
            <section className="inbox__approvals">
              <div className="inbox__section-label eyebrow" style={{ padding: '0 0 8px 0' }}>
                Needs Orchestration Review
              </div>
              <div className="inbox__list">
                {orchReviewTasks.map(t => {
                  const isLoading = actionLoadingOrch === t.id
                  return (
                    <article key={t.id} className="inbox__item inbox__item--approval">
                      <div className="inbox__item-left">
                        <span className="inbox__num mono">#{t.number}</span>
                        <span className="inbox__dot" style={{ background: STATUS_DOT['done'] }} />
                      </div>
                      <div className="inbox__item-body">
                        <div className="inbox__item-title">{t.title}</div>
                        <div className="inbox__item-meta">
                          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
                            All subtasks complete — review and decide next steps
                          </span>
                        </div>
                      </div>
                      <div className="inbox__item-right" style={{ gap: 6, display: 'flex' }}>
                        <button
                          className="btn btn--sm btn--accent"
                          onClick={() => handleDismissOrchestration(t.id)}
                          disabled={isLoading}
                        >
                          {isLoading ? '…' : 'Dismiss'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/other/Projects/AI/graphait/frontend
npm run build 2>&1 | head -40
```

Expected: build succeeds with no new type errors.

- [ ] **Step 5: Verify manually**

With the dev server running, set `orchestration_review_pending = true` on a task directly in the DB:

```bash
sqlite3 /Users/other/Projects/AI/graphait/graphait.db "UPDATE tasks SET orchestration_review_pending=1 LIMIT 1;"
```

Reload the Inbox page and verify:
- "Needs Orchestration Review" section appears at the top
- The task title and "All subtasks complete" message are visible
- Clicking "Dismiss" removes the item (network call returns updated task with flag=false)

Reset after testing:

```bash
sqlite3 /Users/other/Projects/AI/graphait/graphait.db "UPDATE tasks SET orchestration_review_pending=0;"
```

- [ ] **Step 6: Run backend test suite one final time**

```bash
cd /Users/other/Projects/AI/graphait
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/InboxPage.tsx
git commit -m "feat: Inbox orchestration review section with dismiss action"
```
