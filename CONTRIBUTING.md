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
