# Graphait

AI + human agent management platform. Agents form an organizational graph and synchronize work through a shared task board.

## Quick start

```bash
cp .env.example .env
# Set SECRET_KEY to a strong random value in .env
docker compose up --build
```

API available at http://localhost:8000  
Docs at http://localhost:8000/docs

## Development

```bash
pip install -r requirements.txt -r requirements-dev.txt
createdb graphait graphait_test
alembic upgrade head
uvicorn graphait.main:app --reload

pytest tests/ -v
```

## M1 Features

- Agent graph (CRUD + force-directed visualization data)
- Task board (create/assign/comment/status/subtasks)
- Connectors: HTTP/OpenRouter, OpenCode headless CLI
- Redis-backed agent scheduler
- JWT auth, single org
