from unittest.mock import MagicMock


def make_ctx(tmp_path):
    from graphait.modules.agent.tools import ToolContext
    return ToolContext(
        db=MagicMock(), org_id="00000000-0000-0000-0000-000000000001",
        task_id="00000000-0000-0000-0000-000000000002",
        agent_id="test-dev", working_dir=str(tmp_path / "workspace"),
    )


def test_get_tool_schemas_includes_always_on():
    from graphait.modules.agent.tools import get_tool_schemas, ALWAYS_ON_TOOLS
    names = [s["function"]["name"] for s in get_tool_schemas([])]
    for t in ALWAYS_ON_TOOLS:
        assert t in names


def test_get_tool_schemas_includes_optional():
    from graphait.modules.agent.tools import get_tool_schemas
    names = [s["function"]["name"] for s in get_tool_schemas(["read_file", "write_file"])]
    assert "read_file" in names and "write_file" in names


def test_write_and_read_file(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    result = execute_tool("write_file", {"path": "hello.txt", "content": "hello world"}, ctx)
    assert "hello.txt" in result or "written" in result.lower()
    assert "hello world" in execute_tool("read_file", {"path": "hello.txt"}, ctx)


def test_path_traversal_blocked(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    result = execute_tool("read_file", {"path": "../../etc/passwd"}, ctx)
    assert "error" in result.lower() or "not allowed" in result.lower()


def test_list_directory(tmp_path):
    from graphait.modules.agent.tools import execute_tool
    ctx = make_ctx(tmp_path)
    execute_tool("write_file", {"path": "a.txt", "content": "a"}, ctx)
    execute_tool("write_file", {"path": "b.txt", "content": "b"}, ctx)
    result = execute_tool("list_directory", {}, ctx)
    assert "a.txt" in result and "b.txt" in result
