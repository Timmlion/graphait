import pytest
import graphait.config.loader as loader_mod
from graphait.config.loader import AgentConfig, save_agent


@pytest.fixture(autouse=True)
def cfg_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CONFIG_DIR", tmp_path / "config")
    loader_mod.init_config_dir()


def _save(id, reports_to=None):
    save_agent(AgentConfig(id=id, name=id.title(), role_title="R", type="ai",
                           model="x/y", api_key=None, working_dir=f"./w/{id}",
                           reports_to=reports_to, schedule_interval=300,
                           schedule_enabled=True, tools=[], skills=[], system_prompt=""))


@pytest.fixture()
def auth_headers(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Graph Org", "org_slug": "graphorg2",
        "email": "graph2@org.com", "password": "TestPass123!"
    })
    r = client.post("/api/v1/auth/login", json={"email": "graph2@org.com", "password": "TestPass123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_graph_returns_nodes_and_edges(client, auth_headers):
    _save("cto")
    _save("dev", reports_to="cto")
    resp = client.get("/api/v1/graph", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    node_ids = [n["id"] for n in data["nodes"]]
    assert "cto" in node_ids and "dev" in node_ids
    assert len(data["edges"]) >= 1
    edge = next(e for e in data["edges"] if e["from_agent_id"] == "dev")
    assert edge["to_agent_id"] == "cto"
