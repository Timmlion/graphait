# Graphait MVP v2 — Design Spec

**Date:** 2026-04-25  
**Status:** Approved  
**Approach:** Agent-first. The autonomous agent is the core unit — everything else (panel, board, graph) is scaffolding around self-operating agents.

---

## 1. Overview

Graphait is an AI agent orchestration platform. Users define autonomous AI agents with roles, skills, and tools. Agents pick up tasks from the Board, execute work in a loop (file ops, web search, subtask creation), and post results as comments. Human nodes participate identically — they just execute via the UI instead of an AI loop.

**MVP success criteria:**
1. Define agents via JSON config files
2. Assign task on Board
3. AI agent picks it up autonomously, does work with tools, posts comment "done + result"
4. Task status updates to `done`

---

## 2. Architecture

```
FastAPI (port 8000)
│
├── API v1: auth, agents, tasks, graph, org, skills
├── SQLite (graphait.db) — runtime state only
│
├── APScheduler
│     └── per agent: every interval_seconds → AgentLoop(agent_id)
│         + immediate trigger: POST /tasks with assignee_id calls scheduler.trigger(agent_id)
│
└── AgentLoop(agent_config, task, db)   ← CORE UNIT
      ├── compose_prompt()               org → agent → skills → task context
      ├── call_openrouter()              httpx, tool_choice="auto"
      ├── execute_tool()                 local tool implementations
      └── loop until: done | blocked | max_iterations
```

**Single process. One `make dev`.** Agents run as concurrent asyncio tasks — they don't block each other. Each agent loop has isolated try/except — one crash does not affect others.

---

## 3. Config as Code

Agent definitions and skills live on disk, not in the database. The DB stores only runtime state (tasks, comments, users).

### Directory structure

```
config/
  org.json                  ← org prompt, openrouter_api_key, default_model, search_api_key
  agents/
    cto.json
    frontend-dev.json
    backend-dev.json
  skills/
    python-senior.md
    react-expert.md
    ui-design.md

workspaces/
  cto/                      ← agent working directory (file tools scoped here)
  frontend-dev/
```

### Agent JSON (`config/agents/frontend-dev.json`)

```json
{
  "id": "frontend-dev",
  "name": "Frontend Developer",
  "role_title": "Frontend Engineer",
  "type": "ai",
  "model": "anthropic/claude-3-5-sonnet",
  "api_key": null,
  "working_dir": "./workspaces/frontend-dev",
  "reports_to": "cto",
  "schedule_interval": 300,
  "schedule_enabled": true,
  "tools": ["read_file", "write_file", "list_directory", "web_search"],
  "skills": ["react-expert", "ui-design"],
  "system_prompt": "You are a senior frontend engineer..."
}
```

`api_key: null` → falls back to `org.json.openrouter_api_key`.  
`reports_to` → agent slug; used for graph hierarchy rendering.  
`type: "human"` → agent appears in graph and board but has no execution loop.

### Org config (`config/org.json`)

```json
{
  "name": "Acme Corp",
  "system_prompt": "We build high-quality software. Always prioritize correctness over speed.",
  "openrouter_api_key": "sk-...",
  "default_model": "anthropic/claude-3-5-sonnet",
  "search_api_key": "..."
}
```

### Skills (`config/skills/python-senior.md`)

Plain markdown. Defines HOW the agent should approach its domain. Read from disk at runtime by AgentLoop — not cached. Compatible with Claude Code, Codex, and any tool that reads markdown skill files.

Filename slug = skill id (e.g. `python-senior.md` → id `python-senior`). Agent JSON references skills by slug in `skills[]` array. If a referenced skill file is missing, AgentLoop logs a warning and skips it.

**Startup:** If `config/` directory doesn't exist, the app creates it with an empty `org.json` and empty `agents/` and `skills/` subdirectories.

---

## 4. Database — Runtime State Only

Agent/skill tables removed. `assignee_id` and `author_id` are string slugs (agent id from config file), not UUID FKs.

| Table | Content |
|-------|---------|
| `users` | email, password_hash — auth only |
| `tasks` | title, description, status, assignee_id (string), creator_id (string), parent_task_id, priority |
| `comments` | task_id, author_id (string), content, is_system |

---

## 5. Agent Execution Loop

**File:** `graphait/modules/agent/loop.py`

### Prompt composition (per tick)

```
[1] org.json.system_prompt
[2] agent.system_prompt
[3] ## Skill: {name}
    {skill file content}      ← one section per assigned skill, read from disk
[4] ## Available tools
    {list of enabled tools with descriptions}
[5] ## Task #{number}: {title}
    {description}
    Priority: {priority} | Status: {status}
    ## Recent comments
    {last 10 comments}
    ---
    Work on this task. When done call update_status(done).
    If blocked call update_status(blocked) and explain why.
```

### Loop logic

```python
async def run(self):
    messages = [system_prompt, task_user_message]
    for _ in range(MAX_ITERATIONS):          # default 20
        response = await call_openrouter(messages)
        messages.append(response)

        if not response.tool_calls:
            post_comment(response.content)
            update_status("done")
            return

        for tc in response.tool_calls:
            result = execute_tool(tc.name, tc.args)
            messages.append(tool_result(tc.id, result))
            if tc.name == "update_status":
                return                       # agent set terminal status

    post_comment("⚠️ Reached iteration limit.")
```

---

## 6. Tools

### Always enabled (every AI agent)

| Tool | Action |
|------|--------|
| `post_comment` | Post comment to current task, status unchanged |
| `update_status` | Set task status: `done`, `blocked`, `in_progress`, `in_review`, `cancelled` |
| `create_task` | Create new task in org, optionally assign to agent |
| `assign_task` | Assign existing task to an agent by id |

### Optional (configured per agent in `tools[]`)

| Tool | Action |
|------|--------|
| `read_file` | Read file from `working_dir` |
| `write_file` | Write/create file in `working_dir` (creates parent dirs) |
| `list_directory` | List files and subdirectories in `working_dir` |
| `web_search` | Search the web via Serper/Brave API (key in org.json) |
| `fetch_url` | HTTP GET a URL, return text content (no JS) |

All file tools path-traversal-blocked to `working_dir`. `web_search` requires `search_api_key` in `org.json`.

---

## 7. Config Loader

**File:** `graphait/config/loader.py`

Reads config files from disk into Python dataclasses on startup and on-demand (not cached to stay in sync with file edits).

```python
@dataclass
class AgentConfig:
    id: str
    name: str
    role_title: str
    type: str               # "ai" | "human"
    model: str
    api_key: str | None
    working_dir: str
    reports_to: str | None
    schedule_interval: int
    schedule_enabled: bool
    tools: list[str]
    skills: list[str]       # slugs → resolved to file paths
    system_prompt: str

def load_org() -> OrgConfig: ...
def load_agents() -> list[AgentConfig]: ...
def load_skill(slug: str) -> str: ...    # returns markdown content
def save_agent(config: AgentConfig) -> None: ...
def save_org(config: OrgConfig) -> None: ...
def save_skill(slug: str, content: str) -> None: ...
def delete_agent(agent_id: str) -> None: ...
def delete_skill(slug: str) -> None: ...
```

---

## 8. API Changes

All agent and skill endpoints become file CRUD (no DB queries for config).

| Endpoint | Change |
|----------|--------|
| `GET /agents` | Reads all `config/agents/*.json` |
| `POST /agents` | Creates new JSON file |
| `PATCH /agents/{id}` | Updates JSON file |
| `DELETE /agents/{id}` | Deletes JSON file |
| `GET /skills` | Reads all `config/skills/*.md` (returns id + name + content) |
| `POST /skills` | Creates new `.md` file; `id` = slugified name (e.g. `python-senior`) |
| `PATCH /skills/{id}` | Updates `.md` file; `id` = slug = filename without `.md` |
| `DELETE /skills/{id}` | Deletes `.md` file |
| `GET /org` | Reads `config/org.json` |
| `PATCH /org` | Updates `config/org.json` |
| `GET /graph` | Reads agents, maps `reports_to` to edges |

Task/comment/auth endpoints unchanged (still DB-backed).

---

## 9. Frontend Changes

No structural changes to existing pages. Data sources change:

| Page | Change |
|------|--------|
| Graph | Agent data from file-backed API — same shape, hierarchy from `reports_to` field |
| Board | Unchanged — tasks from DB |
| Agent panel (Graph) | Edit fields map to JSON file: model, system_prompt, tools (checkboxes), skills (checkboxes), schedule_interval |
| Skills page | File CRUD — textarea editor for markdown content |
| Settings | Edits `org.json`: org prompt, OpenRouter key, default model, search API key |
| Inbox | Unchanged — human agent tasks from DB |

---

## 10. DB Migration

Single Alembic migration (skills/agent_skills tables do not exist in current DB — they were never implemented from the archived plan):
- Drop: `agents`, `agent_relationships`, `agent_schedules`
- Keep: `organizations`, `users` (auth unchanged — users still have org_id for single-org auth)
- Alter: `tasks.assignee_id` → `String(100)` nullable, drop FK constraint
- Alter: `tasks.creator_id` → `String(100)` nullable, drop FK constraint
- Alter: `comments.author_id` → `String(100)`, drop FK constraint

`org.json` is the source of truth for execution config (prompts, API keys). The DB `organizations` row is only used for user auth scoping.

---

## 11. What to Build

### Backend (new)
- `graphait/config/loader.py` — config file CRUD dataclasses
- `graphait/modules/agent/loop.py` — AgentLoop
- `graphait/modules/agent/tools.py` — tool definitions + implementations
- Alembic migration removing agent/skill tables, changing FKs to strings

### Backend (modify)
- `graphait/api/v1/agents.py` — file CRUD instead of DB CRUD
- `graphait/api/v1/skills.py` — file CRUD
- `graphait/api/v1/org.py` — file CRUD for org.json
- `graphait/api/v1/graph.py` — build edges from `reports_to`
- `graphait/api/v1/tasks.py` — assignee_id as string
- `graphait/modules/scheduler/worker.py` — load agent configs, trigger AgentLoop
- `graphait/api/v1/auth.py` — auto-create `config/agents/{email-slug}.json` (human type) on register

### Frontend (modify)
- `GraphPage.tsx` — agent panel uses tools checkboxes + skills checkboxes
- `SkillsPage.tsx` — file-backed CRUD, markdown textarea editor
- `SettingsPage.tsx` — org.json fields: org prompt, search API key

---

## 12. Out of Scope (MVP)

- Multi-org / multi-user tenancy (one instance = one org)
- `run_shell` tool (security risk — post-MVP)
- Streaming agent responses to UI
- WebSocket real-time updates (polling sufficient for MVP)
- Department hierarchy and department prompts
- Authority scope / approval flow
- MCP support
- Claude Code / Codex / Gemini CLI connectors
- Agent-to-agent sync consult
- Cost/token tracking
