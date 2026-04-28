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
