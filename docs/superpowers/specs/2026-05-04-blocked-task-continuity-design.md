# Blocked Task Continuity Design

## Goal

When an agent blocks a task to ask a question, the flow must not stop there. The asked party answers, and work automatically resumes with the original agent — no human intervention required for the handoff.

## Background

This spec addresses TODO #17. Currently when an agent calls `update_status(blocked)`, the run closes and the task sits in the Blocked column indefinitely. No mechanism exists to route the question, detect the answer, or resume the original agent.

## Section 1: Data Model

One new field on `tasks`:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `blocked_by_agent_id` | `String(100)` nullable | `null` | ID of the agent waiting for an answer (the "original" agent). Set by `ask_agent`, cleared on return. |

**Rules:**
- When `blocked_by_agent_id` is set, the task is in "waiting for answer" state.
- If an agent calls `ask_agent` while `task.blocked_by_agent_id` is already set, the tool returns an error: `"Cannot ask while already waiting for an answer (v1 limitation: single-level only)."` No chaining.
- `blocked_by_agent_id` is always the string slug ID (same format as `assignee_id`, `creator_id`).

## Section 2: `ask_agent` Tool

New tool added to `ALWAYS_ON_TOOLS` in `graphait/modules/agent/tools.py`.

**Schema:**
```json
{
  "name": "ask_agent",
  "description": "Ask another agent or user a question. Reassigns this task to them so they can answer. Your run will close — the task automatically returns to you once they respond.",
  "parameters": {
    "type": "object",
    "properties": {
      "agent_id": {
        "type": "string",
        "description": "ID of the agent or user to ask (their slug, e.g. 'cto', 'backend-dev')"
      },
      "question": {
        "type": "string",
        "description": "The question to ask"
      }
    },
    "required": ["agent_id", "question"]
  }
}
```

**Execution — `_ask_agent(args, ctx)` — atomic sequence:**

1. Reload task from DB.
2. If `task.blocked_by_agent_id` is already set → return error (no chaining).
3. Post comment: `"@{agent_id}: {question}"` (author = current agent, `is_system=False`).
4. Set `task.blocked_by_agent_id = ctx.agent_id`.
5. Set `task.assignee_id = args["agent_id"]`.
6. Set `task.status = TaskStatus.in_progress` (so scheduler picks it up for the asked agent).
7. `db.commit()`.
8. Call `ctx.scheduler_trigger(args["agent_id"])` if available.
9. Return `"Question posted to @{agent_id}. Task reassigned. Your run will now close."`.

**Run termination in `loop.py`:**

`ask_agent` is treated as a terminal tool call — same pattern as `update_status(blocked)`. After the tool result is appended to messages, the run is closed with `RunStatus.blocked` and `run()` returns.

## Section 3: Return Trigger

All return logic lives in a new `TaskBlockingService` in `graphait/modules/tasks/blocking.py`. The service exposes one public method called from two places.

### `on_run_closed(db, task, agent_id) -> None`

Called from `loop.py` after every `_close()`. Handles the AI→AI case.

```
if task.blocked_by_agent_id is None:
    return                          # task is not in waiting state
if agent_id == task.blocked_by_agent_id:
    return                          # we ARE the original agent closing — no return needed
                                    # (this happens when original agent's run closes after ask_agent)

# We are the asked agent who just finished answering
orig = task.blocked_by_agent_id
responder = task.assignee_id
task.blocked_by_agent_id = None
task.assignee_id = orig
task.status = TaskStatus.in_progress
post system comment: "Answer received from @{responder}. Returning task to @{orig}."
db.commit()
trigger(orig)
```

**Caller in `loop.py`:** After the local `_close()` function is defined, wrap it so that `_maybe_return()` is called every time `_close()` is called. Concretely: replace each `_close(status); return` with a helper that does both.

### `on_comment_added(db, task, commenter_agent_id) -> bool`

Called from the `add_comment` HTTP endpoint in `graphait/api/v1/tasks.py`. Handles the AI→human case. Returns `True` if the unblock was triggered (so the caller skips the normal `_trigger`).

```
if task.blocked_by_agent_id is None:
    return False
if commenter_agent_id != task.assignee_id:
    return False                    # not the person we were waiting for

orig = task.blocked_by_agent_id
task.blocked_by_agent_id = None
task.assignee_id = orig
task.status = TaskStatus.in_progress
post system comment: "Answer received from @{commenter_agent_id}. Returning task to @{orig}."
db.commit()
trigger(orig)
return True
```

**Caller in `tasks.py`:**
```python
unblocked = blocking_service.on_comment_added(db, task, current_user.agent_id)
if not unblocked and task.assignee_id:
    _trigger(task.assignee_id)
```

## Section 4: Agent Context — Task Message

In `AgentLoop._task_message()` in `loop.py`, when `task.blocked_by_agent_id` is set (i.e., this agent is the *asked* agent):

```
## Important: You have been asked a question
@{blocked_by_agent_id} is waiting for your answer (see the latest comment above).
Post your answer using post_comment, then end your turn normally.
The task will automatically return to @{blocked_by_agent_id} after your run completes.
Do NOT call update_status(done) — you are not the owner of this task.
```

This block is appended to the existing task message only when `blocked_by_agent_id` is set and the current agent is not the blocked-by agent.

## Section 5: Migration

One Alembic migration (v6):
- Add `blocked_by_agent_id` (`String(100)`, nullable) to `tasks`

Follows existing migration chain.

## Section 6: Schema and Frontend Updates

**`TaskRead` and `TaskUpdate`** gain:
- `blocked_by_agent_id: Optional[str]`

**`TaskCreate`** — no change needed.

**Frontend `Task` interface** (`frontend/src/api/tasks.ts`):
- Add `blocked_by_agent_id: string | null`

**TaskDrawer in `BoardPage.tsx`:**
- When `task.blocked_by_agent_id` is set, show a badge below the status field:
  `"⏳ Waiting for answer from @{blocked_by_agent_id}"`
- Resolved automatically when `blocked_by_agent_id` returns to `null`.

## Out of Scope

- Multi-level chaining (A→B→C). Single-level only in v1.
- Frontend UI for the asked human to explicitly "accept" a question (comment is sufficient).
- `ask_agent` appearing on the Board as a separate task type.
- Timeout / stall detection for unanswered questions (future TODO).
