# Task: Active agent indicator on the graph

**Difficulty:** Junior  
**Scope:** Frontend only — 2 files  
**Estimated time:** 60–90 min

---

## What to build

The Agents graph currently shows all agents as static nodes. When an agent is running a task, there's no visual indication. Add a pulsing dot (or "active" ring) to agent nodes that currently have a run with `status === "running"`. Poll the runs API every 5 seconds to keep the indicator up-to-date.

---

## Files to modify

| File | Change |
|------|--------|
| `frontend/src/pages/GraphPage.tsx` | Add polling + pass active set to graph |
| `frontend/src/index.css` (or wherever global CSS lives) | Add pulse animation |

---

## How it works

The `/runs` API endpoint already returns all recent runs, each with `agent_id` and `status`. We poll this endpoint every 5 seconds, extract the `agent_id` values of runs with `status === "running"`, and pass them as a `Set<string>` to the `AgentGraph` component. The graph component uses this set to conditionally apply an "active" class to the relevant SVG node.

---

## Step-by-step

### 1. Import the runs API

File: `frontend/src/pages/GraphPage.tsx`

At the top of the file, find the existing imports. Add:

```tsx
import { runsApi } from '../api/runs'
```

The `runsApi.list()` function already exists and returns `AgentRun[]` where each run has `agent_id: string` and `status: 'running' | 'done' | ...`.

---

### 2. Add polling state to `GraphPage`

Inside the `GraphPage` component function, find where the other state variables are declared (around line 465). Add:

```tsx
const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
```

Then add a polling effect. Place it after the existing `useEffect` that loads agents/edges/skills:

```tsx
useEffect(() => {
  const poll = () => {
    runsApi.list()
      .then(runs => {
        const active = new Set(
          runs.filter(r => r.status === 'running').map(r => r.agent_id)
        )
        setActiveAgents(active)
      })
      .catch(() => {})
  }
  poll()
  const interval = setInterval(poll, 5000)
  return () => clearInterval(interval)
}, [])
```

This runs once immediately and then every 5 seconds. On unmount (component removed from DOM) the interval is cleared.

---

### 3. Pass `activeAgents` to `AgentGraph`

Find where `AgentGraph` is rendered (around line 577):

```tsx
<AgentGraph agents={agents} edges={edges} selectedId={selectedId} onSelect={…} />
```

Add the `activeAgents` prop:

```tsx
<AgentGraph agents={agents} edges={edges} selectedId={selectedId} onSelect={…} activeAgents={activeAgents} />
```

---

### 4. Update `AgentGraph` to accept and use `activeAgents`

Find the `AgentGraph` function signature (around line 72):

```tsx
function AgentGraph({ agents, edges, selectedId, onSelect }: {
  agents: Agent[]; edges: GraphEdge[]; selectedId: string | null
  onSelect: (id: string) => void
}) {
```

Add `activeAgents` to the props:

```tsx
function AgentGraph({ agents, edges, selectedId, onSelect, activeAgents }: {
  agents: Agent[]; edges: GraphEdge[]; selectedId: string | null
  onSelect: (id: string) => void
  activeAgents: Set<string>
}) {
```

---

### 5. Add the active indicator to each node

Inside `AgentGraph`, find the node rendering section — the `{agents.map(a => { ... })}` block (around line 116). Each node is a `<g>` element with a `gnode` class.

Find the line where the `<g>` element is opened:

```tsx
<g key={a.id}
  className={`gnode${a.type === 'ai' ? ' gnode--ai' : ' gnode--human'}${isSel ? ' gnode--selected' : ''}`}
  ...
>
```

Add `gnode--active` to the className when the agent is active:

```tsx
const isActive = activeAgents.has(a.id)

<g key={a.id}
  className={`gnode${a.type === 'ai' ? ' gnode--ai' : ' gnode--human'}${isSel ? ' gnode--selected' : ''}${isActive ? ' gnode--active' : ''}`}
  ...
>
```

Then add a pulsing indicator dot inside the `<g>`, just before the closing `</g>`. Place it after the existing content (after the `<text>` elements):

```tsx
{isActive && (
  <circle
    cx={152 - 8}
    cy={8}
    r={5}
    className="gnode__pulse"
    fill="var(--accent)"
  />
)}
```

This places a small dot in the top-right corner of the node rectangle (the node is 152px wide, 52px tall).

---

### 6. Add the pulse animation CSS

Open `frontend/src/index.css`. Add the following at the end of the file (or near other animation definitions):

```css
.gnode__pulse {
  animation: pulse-ring 1.4s ease-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes pulse-ring {
  0%   { opacity: 1; r: 5; }
  70%  { opacity: 0; r: 9; }
  100% { opacity: 0; r: 9; }
}
```

This makes the dot expand and fade in a loop, like a radar ping.

---

## How to test

1. Start the frontend: `NODE_OPTIONS="" npm run dev` from `frontend/`.
2. Open the Agents page, make sure the graph view is selected.
3. Assign a task to an agent and click "Run now" in the agent config panel.
4. Within 5 seconds, a pulsing dot should appear on that agent's node in the graph.
5. Once the run finishes (status changes from `running`), the dot should disappear within 5 seconds.
6. Open the browser dev tools Network tab and confirm a request to `/runs` goes out every ~5 seconds.

---

## What NOT to change

- Do not modify the backend — the `/runs` endpoint already returns what we need.
- Do not change the `AgentListView` component — the indicator is graph-only.
- Do not add the indicator to the left-rail agent list (out of scope).
- The polling interval must be `setInterval` — do not use a recursive `setTimeout` pattern.
