# Open Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish graphait as a clean public GitHub repository — single initial commit, MIT license, full README with screenshots, docker-compose that builds from source.

**Architecture:** Prepare all files on the current `master` branch, then create an orphan `release` branch with one commit containing everything. Push to a new public GitHub repo. The existing local repo remains untouched as backup.

**Tech Stack:** Git, GitHub CLI (`gh`), Docker, Python, Node/npm.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.gitignore` | Modify | Add `*.db` / `graphait.db` |
| `LICENSE` | Create | MIT 2026, Adam Siwek |
| `.env.example` | Modify | Add comments + `POSTGRES_PASSWORD` |
| `CONTRIBUTING.md` | Create | Dev setup, PR guide, bug reporting |
| `Dockerfile.frontend` | Modify | Multi-stage build (no pre-built dist needed) |
| `docker-compose.yaml` | Modify | Build from source, expose port 3000 |
| `README.md` | Modify | Full rewrite per spec |
| `docs/screenshots/` | Create | Directory for PNG screenshots |

---

### Task 1: Remove `graphait.db` from git tracking

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Untrack the database file**

```bash
git rm --cached graphait.db
```

Expected output:
```
rm 'graphait.db'
```

- [ ] **Step 2: Add *.db to .gitignore**

Open `.gitignore` and add these two lines at the end:

```
*.db
graphait.db
```

- [ ] **Step 3: Verify the file is no longer tracked**

```bash
git ls-files graphait.db
```

Expected: no output (empty).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: remove graphait.db from tracking, add *.db to .gitignore"
```

---

### Task 2: Create LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create the MIT license file**

Create `/Users/other/Projects/AI/graphait/LICENSE` with this exact content:

```
MIT License

Copyright (c) 2026 Adam Siwek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

### Task 3: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace .env.example contents**

Replace the entire contents of `.env.example` with:

```bash
# ─── Database ─────────────────────────────────────────────────────────────────
# Local dev (SQLite — default, no extra setup needed)
SQLITE_PATH=graphait.db

# Docker / production: set a strong password for Postgres
# POSTGRES_PASSWORD=change-me

# ─── Auth ─────────────────────────────────────────────────────────────────────
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-me-generate-with-python-secrets-token-hex-32

# Session length in minutes (default: 24 hours)
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# ─── Dev only ─────────────────────────────────────────────────────────────────
# Skip JWT auth — auto-creates a dev user on first request (never use in prod)
# SKIP_AUTH=1
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example with comments and POSTGRES_PASSWORD"
```

---

### Task 4: Write `CONTRIBUTING.md`

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create the file**

Create `/Users/other/Projects/AI/graphait/CONTRIBUTING.md` with:

```markdown
# Contributing to graphait

## Prerequisites

- Python 3.11+
- Node 18+
- `uv` or `pip` for Python deps

## Local dev setup

**Backend**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn graphait.main:app --reload
```

API runs at http://localhost:8000. Swagger docs at http://localhost:8000/docs.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173 and proxies `/api/*` to the backend.

## Running tests

```bash
pytest tests/ -v
```

## Opening a PR

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes with tests where applicable
3. Ensure `pytest tests/ -v` passes
4. Open a PR with a clear description of what changes and why

## Reporting bugs

Open a [GitHub Issue](../../issues) with:
- What you did
- What you expected
- What actually happened
- Your OS and Python/Node versions
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md"
```

---

### Task 5: Fix `Dockerfile.frontend` for self-contained build

Currently `Dockerfile.frontend` copies from `frontend/dist/` which must be pre-built on the host. This breaks `docker compose up --build` for new users. Switch to a multi-stage build.

**Files:**
- Modify: `Dockerfile.frontend`

- [ ] **Step 1: Replace Dockerfile.frontend contents**

Replace the entire file with:

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 2: Update docker-compose.yaml**

Read the current `docker-compose.yaml` and make these changes:

1. Replace the `frontend` service with:
```yaml
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "3000:80"
    depends_on:
      - api
    restart: unless-stopped
```

2. Replace the `api` service with:
```yaml
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://graphait:${POSTGRES_PASSWORD:-graphait}@db:5432/graphait
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY:-change-me-in-production}
      ACCESS_TOKEN_EXPIRE_MINUTES: ${ACCESS_TOKEN_EXPIRE_MINUTES:-1440}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
```

Keep `db`, `redis`, and `volumes` sections unchanged.

- [ ] **Step 3: Verify docker-compose syntax**

```bash
docker compose config --quiet && echo "OK"
```

Expected: `OK` (no YAML errors).

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.frontend docker-compose.yaml
git commit -m "feat: multi-stage frontend Dockerfile, docker-compose builds from source"
```

---

### Task 6: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md contents**

Replace the entire file with:

```markdown
# graphait

![Vibe Coded](https://img.shields.io/badge/vibe%20coded-100%25-blueviolet)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> ⚡ 100% vibe coded — no developers were harmed in the making of this app

**Self-hosted platform where AI agents and humans collaborate on tasks through a shared kanban board.**

![Board](docs/screenshots/board.png)

<p float="left">
  <img src="docs/screenshots/agent-graph.png" width="49%" />
  <img src="docs/screenshots/task-drawer.png" width="49%" />
</p>

## What is this?

graphait is a self-hosted AI agent platform where AI agents and humans collaborate on tasks through a shared kanban board. Agents are organized into a graph (hierarchy, reporting structure), pick up tasks, ask each other questions, spawn subtasks, and close work — all visible and interruptible by humans in real time.

## Features

- **Agent graph** — define agents with roles, models, schedules, and reporting lines
- **Task board** — kanban with Inbox / In Progress / Blocked / Done columns
- **Multi-agent loop** — agents run autonomously, pick up and complete assigned tasks
- **ask_agent tool** — agent blocks, asks a colleague a question, resumes automatically when answered
- **Subtasks & orchestration** — agents spawn subtasks and delegate work down the hierarchy
- **Human approval flow** — `request_approval` gate pauses agent work until a human approves
- **Audit log** — every run, tool call, and decision is logged and visible
- **File access** — agents can read/write files in a configured workspace directory
- **OpenRouter** — use any model (GPT-4o, Claude, Gemini, Llama) per agent

## Quick Start

```bash
git clone https://github.com/Timmlion/graphait.git
cd graphait
cp .env.example .env
# Edit .env: set SECRET_KEY to a strong random value
docker compose up --build
```

Open **http://localhost:3000**

> Requires Docker with the Compose plugin. First run builds the images (~2 min).

## Architecture

```
frontend (React + TypeScript + nginx)
    ↕  /api/*
backend (FastAPI + SQLAlchemy)
    ↕
PostgreSQL  ·  Redis (agent scheduler)
```

Agents call OpenRouter (or any OpenAI-compatible endpoint) per task run. API keys are configured per-agent in the UI — stored in the database, not in env vars.

## Development Setup

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn graphait.main:app --reload   # http://localhost:8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Run tests:

```bash
pytest tests/ -v
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | **Must change** — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `SQLITE_PATH` | SQLite file path (local dev) | `graphait.db` |
| `POSTGRES_PASSWORD` | Postgres password (Docker) | `graphait` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session length | `1440` (24h) |

Model API keys are configured per-agent in the UI (Settings → Agents).

## License

MIT — see [LICENSE](LICENSE)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for public release"
```

---

### Task 7: Create screenshots directory

**Files:**
- Create: `docs/screenshots/.gitkeep`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p docs/screenshots
touch docs/screenshots/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add docs/screenshots/.gitkeep
git commit -m "chore: add docs/screenshots directory"
```

---

### ⚠️ HUMAN STEP: Take screenshots

**This step requires you to run the app and take 3 screenshots manually.**

- [ ] **Start the app in dev mode:**

```bash
source .venv/bin/activate && uvicorn graphait.main:app --reload &
cd frontend && npm run dev &
```

Open http://localhost:5173

- [ ] **Take screenshot 1 — Board view**

Navigate to the Board page. Make sure there are tasks visible in multiple columns (create a few if needed). Save as:

```
docs/screenshots/board.png
```

- [ ] **Take screenshot 2 — Agent graph**

Navigate to the Graph page. Make sure a few agents are visible with lines between them. Save as:

```
docs/screenshots/agent-graph.png
```

- [ ] **Take screenshot 3 — Task drawer**

Click on a task to open the drawer. If possible, have a comment visible. Save as:

```
docs/screenshots/task-drawer.png
```

- [ ] **Commit the screenshots**

```bash
git add docs/screenshots/board.png docs/screenshots/agent-graph.png docs/screenshots/task-drawer.png
git rm docs/screenshots/.gitkeep
git commit -m "docs: add screenshots for README"
```

---

### Task 8: Create orphan release branch

**This creates the clean single-commit branch for the public repo.**

- [ ] **Step 1: Verify the working tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

If there are uncommitted changes, commit or stash them first.

- [ ] **Step 2: Create orphan branch**

```bash
git checkout --orphan release
```

Expected output:
```
Switched to a new branch 'release'
```

- [ ] **Step 3: Stage all files**

```bash
git add -A
```

- [ ] **Step 4: Verify what will be committed (spot-check)**

```bash
git status --short | head -20
```

Confirm: no `graphait.db`, no `.env`, no `config/` files, no `.venv/`, no `node_modules/`.

- [ ] **Step 5: Make the single initial commit**

```bash
git commit -m "feat: initial public release"
```

- [ ] **Step 6: Verify history is exactly one commit**

```bash
git log --oneline
```

Expected: exactly one line — `feat: initial public release`

---

### Task 9: Create GitHub repo and push

**This requires the `gh` CLI. Run `gh auth login` first if not already authenticated.**

- [ ] **Step 1: Create the public repo**

```bash
gh repo create graphait --public --description "Self-hosted AI agent platform where agents and humans collaborate on tasks through a shared kanban board" --source=. --remote=public
```

If the name `graphait` is taken under your account, use a different name.

Expected: repo created and remote `public` added.

- [ ] **Step 2: Push the release branch as main**

```bash
git push public release:main
```

- [ ] **Step 3: Verify**

```bash
gh repo view Timmlion/graphait --web
```

Opens the GitHub page. Confirm:
- Single commit in history
- README renders correctly with screenshots
- LICENSE tab shows MIT
- No `graphait.db`, no `.env`, no `config/` in the file tree

---

## Post-Release Checklist

After the push, do these manually on GitHub:

- [ ] Set the default branch to `main` (Settings → Branches)
- [ ] Add topics/tags: `ai`, `agents`, `task-management`, `multi-agent`, `self-hosted`, `fastapi`, `react`
- [ ] Enable GitHub Issues (Settings → Features)
- [ ] Star your own repo so it shows up in your profile
