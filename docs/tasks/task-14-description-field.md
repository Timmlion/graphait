# Task: Add description field to Create Task form

**Difficulty:** Junior  
**Scope:** Frontend only — 1 file  
**Estimated time:** 30–60 min

---

## What to build

The Create Task modal currently only has a title field, priority, status, and assignee. The backend `TaskCreate` schema already supports a `description` field, but it's never sent from the UI. Add a `description` textarea to the modal so users can provide context for the agent picking up the task.

---

## File to modify

`frontend/src/pages/BoardPage.tsx` — `CreateTaskModal` component, lines 185–267.

---

## Step-by-step

### 1. Add `description` to form state

Find this block (around line 188):

```tsx
const [title, setTitle]         = useState('')
const [priority, setPriority]   = useState<TaskPriority>('medium')
const [status, setStatus]       = useState<TaskStatus>(defaultStatus ?? 'todo')
const [assigneeId, setAssigneeId] = useState<string>('')
const [error, setError]         = useState<string | null>(null)
const [loading, setLoading]     = useState(false)
```

Add one line after `assigneeId`:

```tsx
const [description, setDescription] = useState('')
```

### 2. Pass `description` to the API call

Find the `handleSubmit` function (around line 195). The `tasksApi.create()` call looks like:

```tsx
const task = await tasksApi.create({ title: title.trim(), priority, assignee_id: assigneeId || null })
```

Change it to:

```tsx
const task = await tasksApi.create({
  title: title.trim(),
  priority,
  assignee_id: assigneeId || null,
  description: description.trim() || null,
})
```

### 3. Add the textarea to the form UI

Find the title input in the form (around line 232). It looks like:

```tsx
<input className="input" autoFocus … />
```

Add the description textarea **below** the title input, inside the same form body:

```tsx
<div className="field">
  <label className="label">Description</label>
  <textarea
    className="input"
    rows={4}
    value={description}
    onChange={e => setDescription(e.target.value)}
    placeholder="What does the agent need to know to complete this task?"
    style={{ resize: 'vertical' }}
  />
</div>
```

### 4. Reset on close

Find where the modal state is reset when the form is submitted or cancelled. The `handleSubmit` function calls `onCreated(task)` at the end which closes the modal — this is fine because the component unmounts. No extra reset needed.

---

## How to test

1. Start the dev server: `NODE_OPTIONS="" npm run dev` from the `frontend/` directory.
2. Open the app, go to Board.
3. Click "New task".
4. The modal should now have a Description textarea below the title.
5. Fill in title + description, click Create.
6. Open the created task — the description should appear in the task drawer (it already renders `task.description` if present — check `BoardPage.tsx` around the drawer section to confirm, or look for a `description` render block).
7. Create a task with no description — it should work fine (description is optional).

---

## What NOT to change

- Do not modify the backend — it already accepts `description`.
- Do not modify `frontend/src/api/tasks.ts` — the `TaskCreate` type already has `description?: string | null`.
- Do not change the modal's overall layout or other fields.
