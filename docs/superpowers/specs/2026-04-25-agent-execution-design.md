# Agent Execution Design

**Date:** 2026-04-25  
**Status:** Draft — awaiting user review  
**Goal:** Define how Graphait agents pick up tasks, execute work, and communicate results — end to end.

---

## 1. Overview

Graphait is a local-first AI agent orchestration platform. Users define agents (nodes) with roles, skills, and tools. Agents pick up tasks from the Board, do real work (file read/write, code generation, analysis), and post results as comments. The system runs on a single host machine with no Docker required.

**MVP success criteria:**
1. Login → create 3 nodes (1 human + 2 AI agents)
2. Assign task on Board
3. AI agent picks it up, does work, posts comment "done + result"
4. Task status updates to `done`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FastAPI (port 8000)                │
│  /api/v1: auth, agents, tasks, graph, schedules, org │
│  SQLite: graphait.db                                 │
│  APScheduler: fires agent ticks                      │
└──────────────┬──────────────────────────────────────┘
               │ tick
               ▼
┌─────────────────────────────────────────────────────┐
│                   AgentLoop                          │
│  1. Load agent config + pending task                 │
│  2. Generate AGENTS.md in workspace                  │
│  3. Build messages (system + task context)           │
│  4. Tool calling loop → OpenRouter (httpx)           │
│  5. Execute tool calls locally                       │
│  6. Post comment + update status                     │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  OpenRouter       ./workspaces/
  (HTTPS)          {agent_id}/
                     AGENTS.md   ← generated
                     files/      ← working files
```

Single process. No Redis. No Docker. `make dev` starts everything.

---

## 3. Agent Model (DB)

```python
class Agent(Base):
    # existing fields: id, org_id, user_id, name, role_title, type, is_active
    
    # agent execution config (stored in connector_config JSON):
    # {
    #   "model": "anthropic/claude-3-5-sonnet",  # OpenRouter model ID
    #   "api_key": "sk-...",                      # optional, falls back to org key
    #   "api_url": "https://openrouter.ai/api/v1",
    #   "enabled_tools": ["read_file", "write_file", "list_directory"],
    #   "max_iterations": 20,
    #   "working_dir": "./workspaces/{agent_id}"  # auto-set if absent
    # }
    
    # skills: list of skill IDs (new relation, see §5)
    # system_prompt: free-form role prompt (existing field)
```

No new DB columns needed for MVP — `connector_config` JSON holds execution config. Skills get a new `Skill` model.

---

## 4. Agent Execution Loop

**File:** `graphait/modules/agent/loop.py`

```python
async def run_agent_tick(agent_id: UUID) -> None:
    """Entry point called by scheduler or /agents/{id}/run."""
    with SessionLocal() as db:
        agent = db.get(Agent, agent_id)
        task = get_oldest_pending_task(agent_id, db)
        # "pending" = status in (todo, in_progress) AND assignee_id == agent_id
        if not task:
            return

        loop = AgentLoop(agent, task, db)
        await loop.run()


class AgentLoop:
    MAX_ITERATIONS = 20

    async def run(self):
        self._prepare_workspace()          # write AGENTS.md
        messages = self._build_messages()  # system + task context
        tools = self._build_tool_schemas() # enabled tools as JSON schemas

        for _ in range(self.MAX_ITERATIONS):
            response = await self._call_openrouter(messages, tools)

            if not response.tool_calls:
                # Model returned text with no tool calls → final answer
                self._post_comment(response.content)
                self._update_status("done")
                return

            for tc in response.tool_calls:
                result = self._execute_tool(tc.name, tc.arguments)
                messages.append(assistant_tool_call_msg(tc))
                messages.append(tool_result_msg(tc.id, result))

                if tc.name == "mark_done":
                    self._post_comment(tc.arguments.get("summary", "Done."))
                    self._update_status("done")
                    return

        # hit max iterations
        self._post_comment("⚠️ Reached iteration limit without completing task.")
```

**System prompt structure:**
```
{agent.system_prompt}

## Your skills
{injected skill markdown for each assigned skill}

## Your tools
{list of enabled tools with descriptions}

## Working directory
{working_dir}
```

**Task context (user message):**
```
## Task #{task.number}: {task.title}

{task.description}

Priority: {task.priority}
Status: {task.status}

## Recent comments
{last 10 comments}
```

---

## 5. Skills System

**What:** Markdown documents injected into the system prompt. Define HOW the agent should approach its work.

**Storage:** `Skill` table in DB (name + content). Assigned to agents via `agent_skills` join table.

**Filesystem sync:** On each tick, the full effective prompt (system_prompt + all skills) is written to `{working_dir}/AGENTS.md`. This makes the workspace compatible with Claude Code, Cursor, Codex, and any tool that reads AGENTS.md.

```python
# New models:
class Skill(Base):
    __tablename__ = "skills"
    id: UUID
    org_id: UUID
    name: str           # "React Testing", "Python Senior Dev"
    content: str        # markdown
    created_at: datetime

class AgentSkill(Base):
    __tablename__ = "agent_skills"
    agent_id: UUID
    skill_id: UUID
```

**AGENTS.md generated content:**
```markdown
# {agent.name} — {agent.role_title}

{agent.system_prompt}

---

## Skills

### {skill.name}
{skill.content}

---

## Tools available
- read_file: Read a file from the workspace
- write_file: Write content to a file
- ...
```

---

## 6. Tool System

**Available tools (MVP):**

| Tool | Always on | Description |
|------|-----------|-------------|
| `read_file` | no | Read file from working_dir |
| `write_file` | no | Write/create file in working_dir |
| `list_directory` | no | List files in working_dir |
| `run_shell` | no | Run shell command in working_dir |
| `post_comment` | yes | Post interim comment (status stays as-is) |
| `mark_done` | yes | Post final comment + set status → done |
| `create_task` | yes | Create new task in Graphait |
| `assign_task` | yes | Assign existing task to agent |

Tools are defined as Python functions decorated with `@tool`. Each tool has: name, description, JSON schema for parameters.

**Security:** All file tools are scoped to `working_dir`. Paths are normalized and checked to prevent traversal. `run_shell` is opt-in.

**Implementation:** `graphait/modules/agent/tools.py` — plain Python functions, ~20 lines each.

---

## 7. Workspace Model

Each AI agent gets a persistent workspace on disk:

```
./workspaces/
  {agent_id}/
    AGENTS.md          ← generated on each tick from DB
    files/             ← agent's working files (code, docs, etc.)
```

**Working directory rules:**
- Auto-created on first tick if absent
- Path stored in `connector_config.working_dir` (default: `./workspaces/{agent_id}`, relative to app root where uvicorn runs)
- All file tools resolve paths relative to `working_dir`
- AGENTS.md regenerated fresh on every tick (source of truth = DB)

---

## 8. Communication Model (MVP)

**Primary: async via tasks**
- Agent A needs something from Agent B → creates task, assigns to B
- B picks up on next tick, posts result as comment
- A sees result on its next tick
- All communication visible on Board

**Sync consult (post-MVP):** Direct `ask_agent(agent_id, question)` tool that fires a sub-loop with the target agent and returns the answer inline. Logged as system comment. Not in MVP scope.

---

## 9. Human Agent

A human node is a user linked to an agent record. It:
- Receives tasks on the Inbox page
- Can post comments manually
- Does NOT run through AgentLoop
- Triggers: manual action only (no scheduler)

On register, a human agent is auto-created and linked to the new user. This eliminates the manual step of creating a human node.

---

## 10. What Needs to Be Built

### Backend

| Component | File | Status |
|-----------|------|--------|
| `Skill` + `AgentSkill` models | `models/skill.py` | New |
| Skill CRUD API | `api/v1/skills.py` | New |
| `AgentLoop` class | `modules/agent/loop.py` | New (replaces worker.py logic) |
| Tool implementations | `modules/agent/tools.py` | New |
| Workspace generation (AGENTS.md) | `modules/agent/workspace.py` | New |
| Auto-create human agent on register | `api/v1/auth.py` | Update |
| `run_agent_tick` wiring | `modules/scheduler/worker.py` | Update |

### Frontend

| Component | Status |
|-----------|--------|
| Skills tab in agent config (Graph page) | New |
| Tools checkbox list in agent config | New |
| Skills management page | New (or modal) |
| Auto-created human node (no manual step) | Update register flow |

### Makefile
`make dev` = API + frontend. README documents `openrouter` API key setup in `.env`.

---

## 11. Out of Scope (MVP)

- Sync agent-to-agent consult
- `run_shell` tool (add post-MVP)
- Department hierarchy
- Budget/cost tracking
- Authority scope enforcement
- Multi-workspace / project isolation
- Streaming responses to UI
