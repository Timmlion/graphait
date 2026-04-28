# Agent Context Docs — Design Spec

**Date:** 2026-04-28
**Status:** Approved

---

## 1. Overview

Add a first-class **context doc** mechanism so agents automatically receive the project knowledge they need — tech stack, architecture, conventions — without that information being duplicated across every agent's `system_prompt`.

Context docs are project-specific markdown files that agents opt into via their config. They are distinct from skills (which carry reusable technical expertise) and from the agent's own `system_prompt` (which carries behavioral identity).

---

## 2. Design Decisions

### Context docs vs. skills

| | Skills | Context docs |
|---|---|---|
| Folder | `config/skills/` | `config/context/` |
| Config field | `skills: [...]` | `context: [...]` |
| Prompt section | `## Skill: {name}` | `## Context: {name}` |
| Content | Reusable domain expertise | Project-specific knowledge |
| Scope | Reusable across projects | Specific to this org/project |

### Hierarchy

The final system prompt is assembled in this order:
1. `org.system_prompt` — org-wide baseline (values, culture, shared standards)
2. `agent.system_prompt` — behavioral identity (scope, work habits, completion protocol)
3. Skills — technical expertise
4. Context docs — project knowledge

### Working directory injection

The agent's `working_dir` is injected automatically by the loop as a single line:

```
Your working directory: /path/to/workspace
```

This requires no user action — it's already known from config. It appears between the agent system_prompt and the skills section.

---

## 3. Config Changes

### `AgentConfig` (new field)

```python
context: list[str] = []
```

A list of context doc slugs. Slugs map to `config/context/{slug}.md`. Order matches the order in the list.

### `OrgConfig`

No changes.

### Example agent config (`config/agents/backend-dev.json`)

```json
{
  "id": "backend-dev",
  "name": "Backend Dev",
  "role_title": "Backend Developer",
  "type": "ai",
  "model": "",
  "working_dir": "workspaces/backend-dev",
  "tools": ["read_file", "write_file", "run_command", "post_comment", "update_status"],
  "skills": ["python-senior"],
  "context": ["project-overview", "backend-architecture", "testing-conventions"],
  "system_prompt": "..."
}
```

---

## 4. Backend Changes

### `graphait/config/loader.py`

**`AgentConfig`:** add `context: list[str] = []`.

**`load_context(slug: str) -> str | None`:** reads `{CONFIG_DIR}/context/{slug}.md`, returns content or `None` if not found. Mirrors `load_skill`.

**`init_config_dir()`:** create `{CONFIG_DIR}/context/` alongside the existing dirs.

### `graphait/modules/agent/loop.py`

**Import:** add `load_context` to the existing import from `graphait.config.loader`.

**`_system_prompt()`:** updated assembly order:

```python
def _system_prompt(self) -> str:
    parts = []
    if self.org.system_prompt:
        parts.append(self.org.system_prompt)
    if self.agent.system_prompt:
        parts.append(self.agent.system_prompt)
    if self.agent.working_dir:
        parts.append(f"Your working directory: {self.agent.working_dir}")
    for slug in self.agent.skills:
        content = load_skill(slug)
        if content:
            parts.append(f"## Skill: {slug.replace('-', ' ').title()}\n{content}")
        else:
            logger.warning("Skill not found: %s (agent=%s)", slug, self.agent.id)
    for slug in self.agent.context:
        content = load_context(slug)
        if content:
            parts.append(f"## Context: {slug.replace('-', ' ').title()}\n{content}")
        else:
            logger.warning("Context doc not found: %s (agent=%s)", slug, self.agent.id)
    return "\n\n".join(parts)
```

---

## 5. Starter Context Doc Templates

`config/` is gitignored (runtime state, operator-owned). The templates below are **example content** — project owners create their own files in `config/context/` using these as a starting point. `init_config_dir()` creates the empty `config/context/` directory; it does not pre-populate files.

Each template is a commented markdown structure — replace the placeholder comments with real content.

### `config/context/project-overview.md`

```markdown
## Project Goals
<!-- One or two sentences on what this project is and who it serves. -->

## Tech Stack
<!-- List the key technologies, e.g.:
- Backend: FastAPI, SQLAlchemy 2.x, SQLite
- Frontend: React 18, TypeScript, Vite
- Infra: Docker, GitHub Actions -->

## Repo Layout
<!-- Key directories and what they contain, e.g.:
- graphait/        Python package (API, models, agent loop)
- frontend/src/    React application
- config/          Runtime config: agents, skills, context docs
- alembic/         DB migrations -->

## Key Conventions
<!-- Cross-cutting rules every agent should know, e.g.:
- All DB changes go through Alembic migrations
- Commits use conventional commits (feat:, fix:, chore:)
- No secrets in code; use environment variables -->
```

### `config/context/backend-architecture.md`

```markdown
## Overview
<!-- One paragraph describing the backend architecture. -->

## Data Model
<!-- Key tables and their purpose. Point to model files, e.g.:
- users — authenticated users
- tasks — work items with status/priority
- agent_runs — execution log per agent invocation -->

## API Structure
<!-- How the API is organized, versioning, auth pattern, e.g.:
- All routes under /api/v1/
- JWT auth via Authorization: Bearer header
- Routers in graphait/api/v1/ -->

## Patterns to Follow
<!-- Naming conventions, file patterns, things to copy, e.g.:
- Use Mapped/mapped_column style for SQLAlchemy models
- Schema classes use model_config = {"from_attributes": True} -->

## Things to Avoid
<!-- Anti-patterns or forbidden approaches, e.g.:
- Do not use PostgreSQL-specific types (project targets SQLite)
- Do not import models outside of graphait/models/ -->
```

### `config/context/frontend-architecture.md`

```markdown
## Overview
<!-- One paragraph describing the frontend architecture. -->

## Component Patterns
<!-- How components are structured, e.g.:
- Pages in src/pages/, shared components in src/components/
- Use CSS variables (var(--ink-1), var(--accent)) — no hardcoded colors
- Icon component in src/components/Icon.tsx -->

## API Client
<!-- How API calls are made, e.g.:
- Use apiFetch from src/api/client.ts
- Domain-specific clients in src/api/{domain}.ts -->

## Design Tokens
<!-- Key CSS variables to use:
- Colors: --ink-1, --ink-2, --ink-3, --accent, --line-1
- Typography: --fs-sm, --fs-xs, --font-mono
- Use var() references; never raw hex values in TSX files -->

## Things to Avoid
<!-- e.g.:
- Do not install new npm packages without checking with the team
- Do not use inline styles for colors (use CSS variables) -->
```

### `config/context/testing-conventions.md`

```markdown
## Test Stack
<!-- e.g. pytest + pytest-asyncio, in-memory SQLite via conftest.py -->

## How to Run Tests
<!-- Exact command, e.g.: .venv/bin/python -m pytest tests/ -q -->

## Test Structure
<!-- Where tests live and naming conventions, e.g.:
- All tests in tests/
- test_{module}.py mirrors the module under test
- Use the db fixture from conftest.py for database tests -->

## What to Test
<!-- What coverage is expected, e.g.:
- Every new API endpoint needs at least: happy path, auth required, 404 case
- Every new model needs: create + read, relationship integrity -->

## What NOT to Test
<!-- Avoid test noise, e.g.:
- Don't test SQLAlchemy internals (e.g. that .commit() was called)
- Don't test FastAPI framework behavior -->
```

---

## 6. Agent `system_prompt` Template

This is a **convention**, not enforced by code. Project owners write each agent's `system_prompt` following this structure. The template ships as documentation.

```markdown
## Role
You are [Name], [role_title]. You work independently on [your domain] and escalate to [reports_to] when blocked.

## Scope
You are responsible for:
- [specific area, e.g. backend API endpoints, database migrations]
- [another area]

You do NOT modify:
- [explicit boundary, e.g. frontend code]
- [explicit boundary, e.g. deployment scripts or CI config]

## How to work
1. Read the task description and all recent comments before doing anything.
2. Work in your assigned working directory. Do not create files outside it unless the task explicitly requires it.
3. Make focused, minimal changes. Don't refactor things the task didn't ask for.
4. Commit frequently with clear messages (feat:, fix:, chore:).

## When you finish
Post a comment summarizing: what you did, which files changed, and any assumptions or open questions.
Then call update_status(done).

## When you're stuck
If you need information you don't have and can't find it, call update_status(blocked) and explain precisely what's missing. Don't guess.
```

---

## 7. File Map

| File | Change |
|------|--------|
| `graphait/config/loader.py` | Add `context: list[str]` to `AgentConfig`, add `load_context()`, update `init_config_dir()` |
| `graphait/modules/agent/loop.py` | Update `_system_prompt()`: inject `working_dir`, append context docs |
| `config/context/project-overview.md` | New — template |
| `config/context/backend-architecture.md` | New — template |
| `config/context/frontend-architecture.md` | New — template |
| `config/context/testing-conventions.md` | New — template |

---

## 8. Out of Scope

- Org-level default context docs (all agents auto-load certain docs) — defer
- Context doc versioning or change tracking
- Agent hierarchy injection from `reports_to`
- Behavioral protocols (pre/post task loop hooks)
