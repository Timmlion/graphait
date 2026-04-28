import pytest
import graphait.config.loader as loader_mod


@pytest.fixture()
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()
    return tmp_path / "config"


def test_init_creates_dirs(cfg_dir):
    assert (cfg_dir / "agents").is_dir()
    assert (cfg_dir / "skills").is_dir()
    assert (cfg_dir / "org.json").exists()


def test_save_and_load_agent(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, load_agent
    cfg = AgentConfig(id="test-dev", name="Test Dev", role_title="Developer",
                      type="ai", model="anthropic/claude-3-5-sonnet", api_key=None,
                      working_dir="./workspaces/test-dev", reports_to=None,
                      schedule_interval=300, schedule_enabled=True,
                      tools=["read_file"], skills=[], system_prompt="You are a dev.")
    save_agent(cfg)
    loaded = load_agent("test-dev")
    assert loaded is not None
    assert loaded.name == "Test Dev"
    assert loaded.tools == ["read_file"]


def test_load_missing_agent_returns_none(cfg_dir):
    from graphait.config.loader import load_agent
    assert load_agent("nonexistent") is None


def test_save_and_load_skill(cfg_dir):
    from graphait.config.loader import save_skill, load_skill
    save_skill("python-senior", "# Python\nBe excellent.")
    assert "Be excellent." in load_skill("python-senior")


def test_load_missing_skill_returns_none(cfg_dir):
    from graphait.config.loader import load_skill
    assert load_skill("nope") is None


def test_save_and_load_org(cfg_dir):
    from graphait.config.loader import OrgConfig, save_org, load_org
    save_org(OrgConfig(name="Acme", system_prompt="Build great.", openrouter_api_key="sk-test",
                       default_model="anthropic/claude-3-5-sonnet", search_api_key=None))
    assert load_org().openrouter_api_key == "sk-test"


def test_delete_agent(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, delete_agent, load_agent
    save_agent(AgentConfig(id="temp", name="Temp", role_title="R", type="ai",
                           model="x/y", api_key=None, working_dir="./w/temp",
                           reports_to=None, schedule_interval=300, schedule_enabled=True,
                           tools=[], skills=[], system_prompt=""))
    delete_agent("temp")
    assert load_agent("temp") is None


def test_list_agents(cfg_dir):
    from graphait.config.loader import AgentConfig, save_agent, load_agents
    for slug in ["alpha", "beta"]:
        save_agent(AgentConfig(id=slug, name=slug.title(), role_title="R", type="ai",
                               model="x/y", api_key=None, working_dir=f"./w/{slug}",
                               reports_to=None, schedule_interval=300, schedule_enabled=True,
                               tools=[], skills=[], system_prompt=""))
    assert {a.id for a in load_agents()} == {"alpha", "beta"}
