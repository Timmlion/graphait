import pytest


@pytest.fixture()
def org_with_agents(client):
    client.post("/api/v1/auth/register", json={
        "org_name": "Graph Org", "org_slug": "graphorg",
        "email": "graph@org.com", "password": "TestPass123!"
    })
    resp = client.post("/api/v1/auth/login", json={"email": "graph@org.com", "password": "TestPass123!"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    ceo = client.post("/api/v1/agents", json={"name": "CEO", "role_title": "CEO", "type": "ai"}, headers=headers).json()
    cto = client.post("/api/v1/agents", json={"name": "CTO", "role_title": "CTO", "type": "ai"}, headers=headers).json()
    return headers, ceo, cto


def test_create_relationship(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    resp = client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"],
        "to_agent_id": ceo["id"],
        "type": "reports_to"
    }, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["type"] == "reports_to"


def test_get_graph_returns_nodes_and_edges(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"], "to_agent_id": ceo["id"], "type": "reports_to"
    }, headers=headers)
    resp = client.get("/api/v1/graph", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1


def test_delete_relationship(client, org_with_agents):
    headers, ceo, cto = org_with_agents
    rel = client.post("/api/v1/graph/relationships", json={
        "from_agent_id": cto["id"], "to_agent_id": ceo["id"], "type": "reports_to"
    }, headers=headers).json()
    resp = client.delete(f"/api/v1/graph/relationships/{rel['id']}", headers=headers)
    assert resp.status_code == 204


def test_create_relationship_cross_org_returns_404(client):
    client.post("/api/v1/auth/register", json={"org_name": "OA", "org_slug": "oa", "email": "a@oa.com", "password": "TestPass123!"})
    ra = client.post("/api/v1/auth/login", json={"email": "a@oa.com", "password": "TestPass123!"})
    ha = {"Authorization": f"Bearer {ra.json()['access_token']}"}
    agent_a = client.post("/api/v1/agents", json={"name": "A", "role_title": "CEO", "type": "ai"}, headers=ha).json()

    client.post("/api/v1/auth/register", json={"org_name": "OB", "org_slug": "ob", "email": "b@ob.com", "password": "TestPass123!"})
    rb = client.post("/api/v1/auth/login", json={"email": "b@ob.com", "password": "TestPass123!"})
    hb = {"Authorization": f"Bearer {rb.json()['access_token']}"}
    agent_b = client.post("/api/v1/agents", json={"name": "B", "role_title": "CTO", "type": "ai"}, headers=hb).json()

    # Try to link agent from org A to agent from org B using org A's token
    resp = client.post("/api/v1/graph/relationships", json={
        "from_agent_id": agent_a["id"],
        "to_agent_id": agent_b["id"],
        "type": "reports_to"
    }, headers=ha)
    assert resp.status_code == 404
