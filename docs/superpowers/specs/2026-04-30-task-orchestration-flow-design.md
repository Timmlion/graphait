# Task Orchestration Flow Design

## Goal

When a subtask closes, automatically post a comment on the parent task and — once all subtasks are resolved — either trigger the orchestrator agent to decide next steps or surface the parent in the Inbox for human review.

## Background

This spec addresses TODOs #17, #21, and #23:
- **#17** — agent question/blocking flow (partial: orchestrator as the blocked-task owner)
- **#21** — parent task lifecycle: parent stays open until all subtasks complete, then rollup
- **#23** — agent task-completion discipline: agents should not close tasks arbitrarily

## Section 1: Data Model

Two new fields on `tasks`:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `orchestrator_id` | `String` nullable | `creator_id` at creation time | Entity (agent or user) triggered when all subtasks complete |
| `human_review_required` | `Boolean` | `False` | If true, skip agent trigger and send Inbox notification instead |

Rules:
- If `orchestrator_id` resolves to a human user, `human_review_required` is forced true (cannot auto-trigger a human as an agent).
- `orchestrator_id` defaults to `creator_id` on task creation — no schema change needed at creation time, just default logic in the service.

## Section 2: Propagation Logic

Triggered whenever a task status changes to `done` or `cancelled` **and** `parent_task_id` is not null.

**Step-by-step:**

1. **Post system comment on parent task**
   Insert a `Comment` with `author_id = "system"`:
   > `"Subtask #N.M '{title}' marked {status} by {agent_name|user_name}."`
   This is unconditional — always fires.

2. **Check if all siblings are resolved**
   Query all tasks where `parent_task_id = <parent_id>`.
   If any sibling has status outside `{done, cancelled}` → stop. No further action.

3. **Check `human_review_required` on the parent task**
   - **True** → create an Inbox notification for `orchestrator_id` (see Section 4). Parent stays open. Return.
   - **False** → proceed to step 4.

4. **Trigger orchestrator agent run**
   Start a new `AgentRun` for `orchestrator_id` with `task_id = parent.id` and trigger message:
   > `"All subtasks of task #N are complete. Review outcomes and decide: close the parent with a summary outcome, or create new subtasks for follow-up work."`

   The orchestrator agent can then call `update_task`, `create_subtask`, `add_comment`, or close the parent task.

**Stall detection** (TODO #21 remainder) is out of scope for this spec — a future background job that surfaces stalled parents in the Inbox.

## Section 3: UI — TaskDrawer Changes

A collapsible **"Orchestration"** section appears in TaskDrawer below the description, visible only on tasks (not subtasks).

**Orchestrator field** — dropdown of org members + agents. Shows avatar + name. Defaults to creator. Editable by creator and admins.
Label: `"Orchestrator — triggered when all subtasks complete"`

**Requires human review** — checkbox. When checked, orchestrator receives an Inbox notification instead of being auto-triggered.
- If `orchestrator_id` resolves to a human, the checkbox is forced on and disabled with tooltip: `"Always requires human review when orchestrator is a person."`

The section is collapsed by default and expands on click. Only rendered when `task.subtasks.length > 0` or when the user explicitly expands it (so it doesn't clutter leaf tasks with no subtasks).

## Section 4: Inbox Notifications

**Trigger:** `human_review_required = true` and all siblings resolved.

**Notification shape** (fits existing Inbox schema, new `event_type` value):
```
event_type:  orchestration_review
target_id:   orchestrator_id
task_id:     parent.id
message:     "All subtasks of #N '{parent title}' are complete. Review outcomes and decide next steps."
```

Action: clicking the notification opens the parent task drawer.

The notification persists in the Inbox until the user dismisses it or the parent task is closed.

**Future stall notification** (TODO #21): same shape with `event_type: orchestration_stall`, fired by a background job.

## Section 5: Backend Implementation

### New file: `graphait/modules/tasks/orchestration.py`

`TaskOrchestrationService` with one public method:

```python
def on_subtask_closed(self, db: Session, task: Task) -> None
```

Called from the task update endpoint after any status change where `new_status in {done, cancelled}` and `task.parent_task_id is not None`.

Internal sequence matches Section 2 exactly.

### Trigger point

`graphait/api/v1/tasks.py` — after `task_service.update(...)` returns, call:

```python
if data.status in (TaskStatus.done, TaskStatus.cancelled) and task.parent_task_id:
    orchestration_service.on_subtask_closed(db, task)
```

### Migration

One Alembic migration:
- Add `orchestrator_id` (`String`, nullable) to `tasks`
- Add `human_review_required` (`Boolean`, server default `false`, not null) to `tasks`

`orchestrator_id` is a soft reference (String, not FK) matching the existing pattern for `assignee_id` and `creator_id` — supports both user IDs and agent IDs.

### System comments

`author_id = "system"` is a reserved string. The frontend resolves it as a special "System" avatar (no user lookup). Add handling in `resolveAuthor()` in BoardPage.

### Schemas

`TaskRead` and `TaskUpdate` gain:
- `orchestrator_id: Optional[str]`
- `human_review_required: bool`

`TaskCreate` gains `orchestrator_id: Optional[str]` (defaults to `creator_id` in service).

## Out of Scope

- Stall detection / background job (TODO #21 remainder)
- Agent question/blocking flow UI (TODO #17) — orchestrator concept is the foundation but the ask_agent tool is a separate spec
- Prompt improvements for agent task-completion discipline (TODO #23) — separate spec targeting `loop.py` system prompt
