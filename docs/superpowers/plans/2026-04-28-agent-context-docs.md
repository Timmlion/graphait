# Agent Context Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `context` mechanism to AgentConfig so agents can load project-specific markdown docs (tech stack, architecture, conventions) into their system prompt alongside skills.

**Architecture:** Two-file change. `loader.py` gets a new `context: list[str]` field on `AgentConfig`, a `load_context(slug)` function mirroring `load_skill`, and `init_config_dir()` creates `config/context/`. `loop.py` updates `_system_prompt()` to auto-inject `working_dir` and append context doc sections after skills. No new files, no new endpoints.

**Tech Stack:** Python dataclasses, pathlib, pytest.

---

## File Map

| File | Change |
|------|--------|
| `graphait/config/loader.py` | Add `context` field to `AgentConfig`, add `_context_dir()` + `load_context()`, update `init_config_dir()` |
| `graphait/modules/agent/loop.py` | Add `load_context` to import, update `_system_prompt()` |
| `tests/test_config_loader.py` | Add 4 tests for context dir + load_context + field roundtrip |
| `tests/test_agent_loop.py` | Add 2 tests for working_dir injection and context doc inclusion |

---

## Task 1: loader.py — context field, load_context, init update

**Files:**
- Modify: `graphait/config/loader.py`
- Modify: `tests/test_config_loader.py`

- [ ] **Step 1: Write the failing tests**

Append these four tests to `tests/test_config_loader.py`:

```python
def test_init_creates_context_dir(cfg_dir):
    assert (cfg_dir / "context").is_dir()


def test_save_and_load_context(cfg_dir):
    from graphait.config.loader import load_context
    (cfg_dir / "context" / "my-doc.md").write_text("# My Doc\nProject info.")
    content = load_context("my-doc")
    assert content is not None
    assert "Project info." in content


def test_load_missing_context_returns_none(cfg_dir):
    from graphait.config.loader import load_context
    assert load_context("nope") is None


def test_agent_config_roundtrips_context_field(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, load_agent
    cfg = AgentConfig(
        id="ctx-dev", name="Ctx Dev", role_title="Developer",
        type="ai", model="anthropic/claude-3-5-sonnet", api_key=None,
        working_dir="./workspaces/ctx-dev", reports_to=None,
        schedule_interval=300, schedule_enabled=True,
        tools=[], skills=[], system_prompt="",
        context=["project-overview", "backend-architecture"],
    )
    save_agent(cfg)
    loaded = load_agent("ctx-dev")
    assert loaded.context == ["project-overview", "backend-architecture"]
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/other/Projects/AI/graphait/.worktrees/mvp-v2
.venv/bin/python -m pytest tests/test_config_loader.py::test_init_creates_context_dir \
    tests/test_config_loader.py::test_save_and_load_context \
    tests/test_config_loader.py::test_load_missing_context_returns_none \
    tests/test_config_loader.py::test_agent_config_roundtrips_context_field -v
```
Expected: 4 failures — `AttributeError: type object 'AgentConfig' has no field 'context'` / `ImportError: cannot import name 'load_context'`

- [ ] **Step 3: Implement changes in `graphait/config/loader.py`**

The full updated file:

```python
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path("config")


@dataclass
class AgentConfig:
    id: str
    name: str
    role_title: str
    type: str               # "ai" | "human"
    model: str
    api_key: Optional[str]
    working_dir: str
    reports_to: Optional[str]
    schedule_interval: int
    schedule_enabled: bool
    tools: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    context: list[str] = field(default_factory=list)
    system_prompt: str = ""


@dataclass
class OrgConfig:
    name: str = ""
    system_prompt: str = ""
    openrouter_api_key: Optional[str] = None
    default_model: str = "anthropic/claude-sonnet-4-5"
    search_api_key: Optional[str] = None


def _agents_dir() -> Path:
    return CONFIG_DIR / "agents"


def _skills_dir() -> Path:
    return CONFIG_DIR / "skills"


def _context_dir() -> Path:
    return CONFIG_DIR / "context"


def init_config_dir() -> None:
    _agents_dir().mkdir(parents=True, exist_ok=True)
    _skills_dir().mkdir(parents=True, exist_ok=True)
    _context_dir().mkdir(parents=True, exist_ok=True)
    org_file = CONFIG_DIR / "org.json"
    if not org_file.exists():
        org_file.write_text(json.dumps(asdict(OrgConfig()), indent=2))


def load_org() -> OrgConfig:
    p = CONFIG_DIR / "org.json"
    if not p.exists():
        return OrgConfig()
    data = json.loads(p.read_text())
    return OrgConfig(**{k: v for k, v in data.items() if k in OrgConfig.__dataclass_fields__})


def save_org(cfg: OrgConfig) -> None:
    (CONFIG_DIR / "org.json").write_text(json.dumps(asdict(cfg), indent=2))


def load_agents() -> list[AgentConfig]:
    if not _agents_dir().exists():
        return []
    result = []
    for p in sorted(_agents_dir().glob("*.json")):
        data = json.loads(p.read_text())
        result.append(AgentConfig(**{k: v for k, v in data.items()
                                     if k in AgentConfig.__dataclass_fields__}))
    return result


def load_agent(agent_id: str) -> Optional[AgentConfig]:
    p = _agents_dir() / f"{agent_id}.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    return AgentConfig(**{k: v for k, v in data.items()
                          if k in AgentConfig.__dataclass_fields__})


def save_agent(cfg: AgentConfig) -> None:
    _agents_dir().mkdir(parents=True, exist_ok=True)
    (_agents_dir() / f"{cfg.id}.json").write_text(json.dumps(asdict(cfg), indent=2))


def delete_agent(agent_id: str) -> None:
    p = _agents_dir() / f"{agent_id}.json"
    if p.exists():
        p.unlink()


def load_skill(slug: str) -> Optional[str]:
    p = _skills_dir() / f"{slug}.md"
    return p.read_text() if p.exists() else None


def save_skill(slug: str, content: str) -> None:
    _skills_dir().mkdir(parents=True, exist_ok=True)
    (_skills_dir() / f"{slug}.md").write_text(content)


def delete_skill(slug: str) -> None:
    p = _skills_dir() / f"{slug}.md"
    if p.exists():
        p.unlink()


def list_skills() -> list[dict]:
    if not _skills_dir().exists():
        return []
    return [
        {"id": p.stem, "name": p.stem.replace("-", " ").title(), "content": p.read_text()}
        for p in sorted(_skills_dir().glob("*.md"))
    ]


def load_context(slug: str) -> Optional[str]:
    p = _context_dir() / f"{slug}.md"
    return p.read_text() if p.exists() else None
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
.venv/bin/python -m pytest tests/test_config_loader.py -v
```
Expected: all passing (previously passing tests plus 4 new ones)

- [ ] **Step 5: Run full suite to confirm nothing broke**

```bash
.venv/bin/python -m pytest tests/ -q
```
Expected: all tests passing

- [ ] **Step 6: Commit**

```bash
git add graphait/config/loader.py tests/test_config_loader.py
git commit -m "feat: add context field to AgentConfig and load_context() loader"
```

---

## Task 2: loop.py — inject working_dir and context docs into system prompt

**Files:**
- Modify: `graphait/modules/agent/loop.py`
- Modify: `tests/test_agent_loop.py`

- [ ] **Step 1: Write the failing tests**

Append these two tests to `tests/test_agent_loop.py`:

```python
@pytest.mark.asyncio
async def test_loop_injects_working_dir_in_system_prompt(db, tmp_path, monkeypatch):
    import graphait.config.loader as loader_mod
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()

    from graphait.modules.agent.loop import AgentLoop
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Done.")

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(make_agent(), make_org(), task, db).run()

    call_json = mock_http.post.call_args.kwargs["json"]
    system_content = next(m["content"] for m in call_json["messages"] if m["role"] == "system")
    assert "Your working directory: /tmp/test-dev-loop" in system_content


@pytest.mark.asyncio
async def test_loop_appends_context_docs_in_system_prompt(db, tmp_path, monkeypatch):
    import graphait.config.loader as loader_mod
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()
    (tmp_path / "config" / "context" / "project-overview.md").write_text(
        "# Project\nBuild great things."
    )

    from graphait.modules.agent.loop import AgentLoop
    from graphait.config.loader import AgentConfig
    agent = AgentConfig(
        id=AGENT_ID, name="Test Dev", role_title="Developer",
        type="ai", model="anthropic/claude-3-5-sonnet", api_key="sk-test",
        working_dir="/tmp/test-dev-loop", reports_to=None,
        schedule_interval=300, schedule_enabled=True,
        tools=["read_file"], skills=[], system_prompt="You are a dev.",
        context=["project-overview"],
    )
    task = make_task(db)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response(content="Done.")

    with patch("graphait.modules.agent.loop.httpx.AsyncClient") as mock_cls:
        mock_http = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_http
        mock_http.post = AsyncMock(return_value=mock_resp)
        await AgentLoop(agent, make_org(), task, db).run()

    call_json = mock_http.post.call_args.kwargs["json"]
    system_content = next(m["content"] for m in call_json["messages"] if m["role"] == "system")
    assert "## Context: Project Overview" in system_content
    assert "Build great things." in system_content
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
.venv/bin/python -m pytest tests/test_agent_loop.py::test_loop_injects_working_dir_in_system_prompt \
    tests/test_agent_loop.py::test_loop_appends_context_docs_in_system_prompt -v
```
Expected: both FAIL — `AssertionError` because `working_dir` and context content are not in the system message yet

- [ ] **Step 3: Update `graphait/modules/agent/loop.py`**

Change the import line (line 10) from:
```python
from graphait.config.loader import AgentConfig, OrgConfig, load_skill
```
to:
```python
from graphait.config.loader import AgentConfig, OrgConfig, load_skill, load_context
```

Replace the `_system_prompt` method (lines 28–40) with:
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

- [ ] **Step 4: Run new tests to confirm they pass**

```bash
.venv/bin/python -m pytest tests/test_agent_loop.py -v
```
Expected: all 4 tests pass

- [ ] **Step 5: Run full suite**

```bash
.venv/bin/python -m pytest tests/ -q
```
Expected: all tests passing

- [ ] **Step 6: Commit**

```bash
git add graphait/modules/agent/loop.py tests/test_agent_loop.py
git commit -m "feat: inject working_dir and context docs into agent system prompt"
```
