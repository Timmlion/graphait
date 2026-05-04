# Open Source Release Design

## Goal

Publish graphait as a clean public GitHub repository with no git history, no sensitive data, a proper MIT license, and a README that clearly communicates what the project is and how to use it.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| History strategy | New orphan repo (single initial commit) | Clean public image; 123 dev commits with AI co-authors not suitable for public |
| License | MIT | Maximum adoption, minimal friction |
| Positioning | Self-hosted AI agent platform + agentic project management | Both angles are accurate and complementary |
| Screenshots | 2–3 static PNG in `docs/screenshots/` | Simple, no tooling needed |

## Section 1: Repository Strategy

1. On the current local repo: remove `graphait.db` from git tracking (`git rm --cached graphait.db`), add `*.db` to `.gitignore`.
2. Prepare all new/updated files (LICENSE, README, CONTRIBUTING, .gitignore, .env.example) on the current branch.
3. Create a new orphan branch: `git checkout --orphan release`.
4. Stage everything, make one commit: `"feat: initial public release"`.
5. Create a new GitHub repo (`graphait` — public) and push the `release` branch as `main`.
6. The existing private local repo is kept untouched as backup.

Alembic migration files (`alembic/versions/v1_*` through `v6_*`) are included — they define the schema. New users run `alembic upgrade head` to create a fresh database.

## Section 2: Files

### `LICENSE`

MIT License, year 2026, copyright Adam Siwek. Standard MIT text.

### `.gitignore`

Add to the existing file:
```
*.db
graphait.db
```

Everything else already covered (`.env`, `.venv`, `__pycache__`, `node_modules`, `config/`).

### `.env.example`

Updated with all required variables and explanatory comments:

```bash
# Database (SQLite path, relative to project root)
SQLITE_PATH=graphait.db

# Auth — generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-me-generate-with-python-secrets-token-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Dev only — skip JWT validation (set to 1 to auto-create dev user)
# SKIP_AUTH=1
```

### `CONTRIBUTING.md`

Short file covering:
- Prerequisites (Python 3.11+, Node 18+, uv or pip)
- Local dev setup (backend + frontend)
- Running tests
- How to open a PR (branch naming, commit style)
- Where to report bugs (GitHub Issues)

### `README.md`

See Section 3.

## Section 3: README Structure

```
# graphait

![Vibe Coded](https://img.shields.io/badge/vibe%20coded-100%25-blueviolet)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> ⚡ 100% vibe coded — no developers were harmed in the making of this app

[tagline: one sentence description]

[2–3 screenshots: board view, agent graph, task drawer with ask_agent]

## What is this?

graphait is a self-hosted platform where AI agents and humans collaborate on
tasks through a shared kanban board. Agents are organized into a graph
(hierarchy, reporting structure), pick up tasks, ask each other questions,
spawn subtasks, and close work — all visible and interruptible by humans
in real time.

## Features

- **Agent graph** — define agents with roles, models, schedules, and reporting structure
- **Task board** — kanban with Inbox / In Progress / Blocked / Done columns
- **Multi-agent loop** — agents run autonomously, pick up assigned tasks
- **ask_agent tool** — agent blocks, asks a colleague a question, resumes automatically
- **Subtasks & orchestration** — agents can spawn and delegate subtasks
- **Human approval flow** — `request_approval` gate before proceeding
- **Audit log** — every run, tool call, and decision is logged
- **File access** — agents can read/write files in a configured workspace
- **OpenRouter** — use any model (GPT-4o, Claude, Gemini, Llama) per agent

## Quick Start (Docker)

\`\`\`bash
cp .env.example .env
# Edit .env: set SECRET_KEY to a random value
docker compose up --build
\`\`\`

Open http://localhost:3000

## Architecture

FastAPI backend (Python), React + TypeScript frontend, SQLite database (swap
for Postgres by changing `SQLITE_PATH` / `DATABASE_URL`), Redis-backed agent
scheduler, OpenRouter for LLM calls. Alembic for schema migrations.

## Development Setup

\`\`\`bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn graphait.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
\`\`\`

Run tests: \`pytest tests/ -v\`

## Configuration

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `SQLITE_PATH` | Path to SQLite file (default: `graphait.db`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session length (default: 1440 = 24h) |

API keys for models are configured per-agent in the UI (stored in DB, not env).

## License

MIT — see [LICENSE](LICENSE)
```

## Section 4: Screenshots

Take 2–3 screenshots of the running app and save as PNG to `docs/screenshots/`:
- `board.png` — board view with tasks in multiple columns
- `agent-graph.png` — agent graph with hierarchy visible
- `task-drawer.png` — task drawer open showing comments/ask_agent in action

Referenced in README as `![Board](docs/screenshots/board.png)` etc.

Screenshots are taken manually before push — not automated.

## Out of Scope

- CHANGELOG.md (add later)
- CODE_OF_CONDUCT.md (add later)
- SECURITY.md (add later)
- GitHub Actions CI for the public repo (existing `.github/workflows/docker-build.yml` is included as-is)
- Postgres support improvements (existing SQLite works for getting started)
