# Agent Runs & Execution Logging — Design Spec

**Date:** 2026-04-28
**Status:** Approved

---

## 1. Overview

Add structured execution logging to Graphait so operators can see:

1. **Which agents are active right now** and what task each is working on.
2. **Full execution trace** for any run — every LLM message, tool call, and tool result, in order.

---

## 2. Data Model

Two new tables added via Alembic migration.

### `AgentRun`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `agent_id` | String(100) | Agent slug (from config) |
| `task_id` | UUID FK tasks | |
| `started_at` | DateTime | Server default now() |
| `finished_at` | DateTime nullable | NULL = still running |
| `status` | Enum | `running` \| `done` \| `blocked` \| `error` \| `limit_reached` |

`finished_at IS NULL` → agent is currently active.

### `RunEvent`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `run_id` | UUID FK agent_runs CASCADE | |
| `created_at` | DateTime | Server default now() |
| `role` | Enum | `system` \| `user` \| `assistant` \| `tool_call` \| `tool_result` |
| `content` | Text | Message body, tool args as JSON string, or tool result |
| `tool_name` | String(100) nullable | Set for `tool_call` and `tool_result` roles |

---

## 3. Backend Changes

### `graphait/models/run.py` (new)

Defines `AgentRun` and `RunEvent` SQLAlchemy models. `AgentRun` has a `events` relationship to `RunEvent`.

### `graphait/models/__init__.py`

Import `AgentRun` and `RunEvent` so `Base.metadata` includes them on `create_all`.

### `graphait/modules/agent/loop.py`

`AgentLoop.__init__` accepts an optional `run_id: UUID | None = None`. If `run_id` is provided, the loop logs events to `RunEvent` for that run. If not provided, the loop works exactly as before (backward compatible).

`AgentLoop.run()` changes:
- On start: create `AgentRun(agent_id, task_id, status=running)`, store `self._run_id`
- After each `_call_api`: log `role=assistant` event with `msg["content"]` or a summary of tool calls
- After each tool call: log `role=tool_call` + `role=tool_result` pair
- Log initial system prompt as `role=system` event (truncated to 2000 chars if needed)
- Log initial user task message as `role=user` event
- On finish (`done` / `blocked` / `error` / `limit_reached`): set `AgentRun.finished_at = now()` and `status`

### `graphait/api/v1/runs.py` (new)

```
GET  /runs                    → list[AgentRunRead]   active first, then recent 50
GET  /runs/{run_id}/events    → list[RunEventRead]   ordered by created_at ASC
```

Both require auth (`get_current_user`). Reads only — no POST/PATCH.

### `graphait/api/v1/router.py`

Add `runs` router with prefix `/runs`.

### Alembic migration

Single migration creating `agent_runs` and `run_events` tables.

---

## 4. API Schemas

```python
class AgentRunRead(BaseModel):
    id: str
    agent_id: str
    task_id: str
    task_title: str       # joined from Task
    started_at: datetime
    finished_at: datetime | None
    status: str
    duration_seconds: float | None   # computed: finished_at - started_at

class RunEventRead(BaseModel):
    id: str
    run_id: str
    created_at: datetime
    role: str
    content: str
    tool_name: str | None
```

---

## 5. Frontend

### `frontend/src/api/runs.ts` (new)

`AgentRun`, `RunEvent` interfaces. `runsApi.list()` and `runsApi.events(runId)`.

### `frontend/src/pages/RunsPage.tsx` (new)

**Layout:** two-panel — run list on left (300px), event log on right.

**Run list panel:**
- Each row: avatar + agent name, task number + title, duration or "running…" with pulsing green dot, status badge
- Active runs (`finished_at == null`) shown first, pinned at top
- Clicking a row loads events for that run in the right panel

**Event log panel:**
- Chronological list of `RunEvent` rows
- Color-coded by role:
  - `system` → grey background
  - `user` → blue-grey
  - `assistant` → blue
  - `tool_call` → amber, shows tool name as badge
  - `tool_result` → green
- Content rendered as `<pre>` (monospace, pre-wrap) for structured text/JSON
- Header shows agent name, task title, start time, duration

**Polling:**
- If any run has `finished_at == null`: poll `/runs` every 3 seconds
- If selected run has `finished_at == null`: poll `/runs/{id}/events` every 3 seconds
- Otherwise: no polling

### `frontend/src/App.tsx`

Add route `/runs` wrapped in `RequireAuth`.

### `frontend/src/components/Layout.tsx`

Add "Runs" nav link (icon: `terminal` or `activity`).

---

## 6. Out of Scope

- WebSocket real-time push (polling sufficient for MVP)
- Log retention / pruning policy
- Filtering runs by agent or date range
- Exporting logs
- Truncating very long system prompts in events (store full content)

---

## 7. File Map

| File | Change |
|------|--------|
| `graphait/models/run.py` | New — AgentRun + RunEvent models |
| `graphait/models/__init__.py` | Import new models |
| `alembic/versions/v3_agent_runs.py` | New migration |
| `graphait/schemas/run.py` | New — AgentRunRead, RunEventRead |
| `graphait/modules/agent/loop.py` | Add run creation + event logging |
| `graphait/api/v1/runs.py` | New — GET /runs, GET /runs/{id}/events |
| `graphait/api/v1/router.py` | Include runs router |
| `frontend/src/api/runs.ts` | New — runsApi client |
| `frontend/src/pages/RunsPage.tsx` | New — two-panel runs UI |
| `frontend/src/App.tsx` | Add /runs route |
| `frontend/src/components/Layout.tsx` | Add Runs nav link |
