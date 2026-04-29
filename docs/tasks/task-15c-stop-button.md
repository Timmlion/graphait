# Task: Stop button for running agent

**Difficulty:** Junior  
**Scope:** Backend (model, migration, new endpoint, loop check) + Frontend (button in agent config panel)  
**Estimated time:** 90–120 min

---

## What to build

When an agent is running a task, there is currently no way to stop it. Add a Stop mechanism:

1. A `stop_requested` flag on `AgentRun` in the database.
2. A `POST /agents/{agent_id}/stop` endpoint that sets the flag.
3. The agent loop checks the flag at the start of each iteration and exits cleanly if set.
4. A Stop button in the Agent config panel (right sidebar in the Agents page).

---

## Files to modify / create

| File | Change |
|------|--------|
| `graphait/models/run.py` | Add `stop_requested` column |
| `alembic/versions/v5_stop_requested.py` | New migration |
| `graphait/api/v1/agents.py` | New stop endpoint |
| `graphait/modules/agent/loop.py` | Check flag in loop |
| `frontend/src/api/agents.ts` | Add `stop()` method |
| `frontend/src/pages/GraphPage.tsx` | Stop button in AgentConfig footer |

---

## Step-by-step

### 1. Add `stop_requested` to AgentRun model

File: `graphait/models/run.py`

Find the `AgentRun` class (around line 26). It has fields like `id`, `agent_id`, `task_id`, `status`, etc. Add one line after `status`:

```python
stop_requested: Mapped[bool] = mapped_column(default=False)
```

The full updated class will look like:

```python
class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[uuid.UUID] = ...
    agent_id: Mapped[str] = ...
    task_id: Mapped[uuid.UUID] = ...
    started_at: Mapped[datetime] = ...
    finished_at: Mapped[Optional[datetime]] = ...
    status: Mapped[RunStatus] = ...
    stop_requested: Mapped[bool] = mapped_column(default=False)   # ← add this
    events: Mapped[list["RunEvent"]] = ...
```

---

### 2. Create the Alembic migration

Create a new file: `alembic/versions/v5_stop_requested.py`

Look at the previous migration file `alembic/versions/v4_task_outcome.py` to understand the pattern. Your new file should look like this:

```python
"""add stop_requested to agent_runs

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('agent_runs', sa.Column('stop_requested', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('agent_runs', 'stop_requested')
```

**Important:** `down_revision` must match the `revision` value of the previous migration. Check `alembic/versions/v4_task_outcome.py` to confirm the revision ID is `c3d4e5f6a7b8`. If it differs, use the correct one.

Run the migration to apply it:
```bash
alembic upgrade head
```

---

### 3. Add the stop endpoint

File: `graphait/api/v1/agents.py`

Find the existing `POST /{agent_id}/run` endpoint (around line 74). Add a new endpoint after it:

```python
@router.post("/{agent_id}/stop")
def stop_agent(agent_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    run = (db.query(AgentRun)
           .filter(AgentRun.agent_id == agent_id, AgentRun.status == RunStatus.running)
           .first())
    if not run:
        raise HTTPException(status_code=404, detail="No active run found for this agent")
    run.stop_requested = True
    db.commit()
    return {"status": "stop_requested", "run_id": str(run.id)}
```

Make sure `AgentRun` and `RunStatus` are already imported at the top of the file. If not, add:

```python
from graphait.models.run import AgentRun, RunStatus
```

---

### 4. Check the flag in the agent loop

File: `graphait/modules/agent/loop.py`

Find the main `for iteration in range(MAX_ITERATIONS):` loop (around line 170). At the start of each iteration, just before `data = await self._call_api(messages, tools)`, add a stop check:

```python
for iteration in range(MAX_ITERATIONS):
    # Check if stop was requested between iterations
    self.db.refresh(run)
    if run.stop_requested:
        self._system_comment("Run stopped by user request.")
        _close(RunStatus.error)
        return

    try:
        data = await self._call_api(messages, tools)
    ...
```

`self.db.refresh(run)` reloads the run object from the DB so we pick up the `stop_requested` flag set by the endpoint. The `_close` and `_system_comment` functions are already defined in the same `run()` method.

---

### 5. Add `stop()` to the frontend agents API

File: `frontend/src/api/agents.ts`

Find the `agentsApi` object and add one method:

```typescript
stop: (id: string) => apiFetch<{ status: string; run_id: string }>(`/agents/${id}/stop`, { method: 'POST' }),
```

---

### 6. Add Stop button to the AgentConfig footer

File: `frontend/src/pages/GraphPage.tsx` — `AgentConfig` component.

Find the component's state declarations (near the top of `AgentConfig`, around line 196). Add:

```tsx
const [stopping, setStopping] = useState(false)
const [stopResult, setStopResult] = useState<'ok' | 'none' | null>(null)
```

Add the `handleStop` function next to `handleSave` and `runNow`:

```tsx
const handleStop = async () => {
  setStopping(true)
  try {
    await agentsApi.stop(agent.id)
    setStopResult('ok')
  } catch {
    setStopResult('none')
  } finally {
    setStopping(false)
    setTimeout(() => setStopResult(null), 3000)
  }
}
```

Find the footer section (the `<footer className="agent-cfg__foot">` block). In the left button group — where the Save and Run now buttons are — add a Stop button after Run now. Only show it for AI agents:

```tsx
{isAI && (
  <button className="btn btn--sm" onClick={handleStop} disabled={stopping}>
    <Icon name="pause" size={12}/>
    {stopping ? 'Stopping…' : stopResult === 'ok' ? 'Stopped ✓' : stopResult === 'none' ? 'Not running' : 'Stop'}
  </button>
)}
```

---

## How to test

1. Restart the backend server.
2. Run the migration: `alembic upgrade head`.
3. Start the frontend: `NODE_OPTIONS="" npm run dev` from `frontend/`.
4. Open the Agents page, select an AI agent.
5. The footer should now show a Stop button.
6. Assign a task to the agent and trigger a run ("Run now").
7. Click Stop while the agent is running.
8. The run should finish with `error` status and a "Run stopped by user request." comment on the task.
9. Clicking Stop when no run is active should briefly show "Not running".

---

## What NOT to change

- Do not modify `RunStatus` enum or add new enum values — `error` is used for stopped runs (acceptable for now).
- Do not add a new DB table or change existing columns other than `agent_runs.stop_requested`.
- Do not change how `run()` handles the normal completion path.
- Do not add any UI outside the `AgentConfig` footer.
