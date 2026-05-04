# Task: Show commenter identity in task comments

**Difficulty:** Junior  
**Scope:** Backend (1 file, 2 lines) + Frontend (1 file, comment rendering)  
**Estimated time:** 45–90 min

---

## What to build

Task comments show no readable author — the UI currently shows the first 8 characters of an internal ID string, which is unreadable. Fix the backend to store consistent author IDs, then update the frontend to display the author name clearly and distinguish agent comments from system notifications.

---

## Current state

- `Comment` model in `graphait/models/task.py` already has `author_id: Optional[str]` (line 64).
- `CommentRead` schema in `graphait/schemas/comment.py` already returns `author_id`.
- The frontend shows `c.author_id.slice(0, 8)` as the label — ugly for UUIDs, okay for agent slugs.
- Two places in `graphait/api/v1/tasks.py` (lines 104 and 120) store `str(current_user.id)` as `author_id` — this stores a UUID string instead of the agent slug, making those comments unreadable.

---

## Files to modify

- **Backend:** `graphait/api/v1/tasks.py` — 2 small fixes
- **Frontend:** `frontend/src/pages/BoardPage.tsx` — comment rendering section

---

## Step-by-step

### Backend fix

Open `graphait/api/v1/tasks.py`. Find lines 104 and 120 (they're in the `approve_task` and `reject_task` endpoints). Both look like:

```python
db.add(Comment(task_id=task.id, author_id=str(current_user.id), content=…, is_system=True))
```

Change both to use `_get_creator_id(current_user)` instead of `str(current_user.id)`:

```python
db.add(Comment(task_id=task.id, author_id=_get_creator_id(current_user), content=…, is_system=True))
```

`_get_creator_id` is already defined at line 17 of the same file and returns the agent slug linked to the user (e.g. `"manager"` instead of a UUID like `"a3f2b1c4-…"`).

**Why:** Makes all author IDs consistent — always a short human-readable slug, never a raw UUID.

---

### Frontend fix

Open `frontend/src/pages/BoardPage.tsx`. Find the comment rendering block (around line 449). Currently it looks like:

```tsx
{comments.map(c => (
  <div key={c.id} className="comment">
    <div className="avatar avatar--human avatar--sm">{c.author_id.slice(0,1).toUpperCase()}</div>
    <div className="comment__body">
        <span className="comment__author">{c.author_id.slice(0,8)}</span>
        <span className="comment__time">{timeAgo(c.created_at)}</span>
      <div className="comment__text">{c.content}</div>
    </div>
  </div>
))}
```

Replace it with:

```tsx
{comments.map(c => {
  const isSystem = c.is_system
  const authorLabel = isSystem ? 'System' : (c.author_id ?? 'Unknown')
  const avatarLetter = authorLabel.slice(0, 1).toUpperCase()
  return (
    <div key={c.id} className={`comment${isSystem ? ' comment--system' : ''}`}>
      <div className={`avatar avatar--sm ${isSystem ? 'avatar--system' : 'avatar--ai'}`}>
        {avatarLetter}
      </div>
      <div className="comment__body">
        <div className="comment__meta">
          <span className="comment__author">{authorLabel}</span>
          <span className="comment__time">{timeAgo(c.created_at)}</span>
        </div>
        <div className="comment__text">{c.content}</div>
      </div>
    </div>
  )
})}
```

**What changed:**
- System comments (`is_system: true`) show "System" as author instead of the internal ID.
- Non-system comments show the full `author_id` slug (e.g. `backend-dev`, `cto`, `manager`) — these are already short and human-readable.
- Avatar uses `avatar--ai` class for agent/user comments, `avatar--system` for system messages.
- The `comment--system` class on the wrapper lets you style system messages differently in CSS if desired (dimmer, italic, etc.).

---

### Optional: Add a small CSS rule for system comments

If you want system comments to look visually different, find `frontend/src/index.css` and add:

```css
.comment--system .comment__author {
  color: var(--ink-3);
  font-style: italic;
}
.avatar--system {
  background: var(--bg-inset);
  color: var(--ink-3);
  border: 1px solid var(--line-2);
}
```

This is optional — the task is complete without it.

---

## How to test

1. Open the app, go to Board, open any task that has comments.
2. Agent-posted comments (posted by a running agent) should show the agent's slug as author (e.g. `backend-dev`).
3. System comments (task status changes, approval requests) should show `System` as author.
4. Human-posted comments (you posted via the comment box) should show your agent slug.
5. No comment should show a UUID string or a truncated 8-char ID.

If you don't have existing comments: create a task, assign it to an agent, run the agent, then open the task — the agent will post comments that you can verify.

---

## What NOT to change

- Do not modify the Comment model or database schema — `author_id` already exists.
- Do not modify `graphait/schemas/comment.py` — `author_id` is already in `CommentRead`.
- Do not add new API endpoints.
- Do not touch the comment submission form — only the comment display list.
