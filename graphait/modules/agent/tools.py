from __future__ import annotations
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from sqlalchemy.orm import Session

ALWAYS_ON_TOOLS = ["post_comment", "update_status", "create_task", "assign_task", "request_approval", "ask_agent"]

TOOL_SCHEMAS: dict[str, dict] = {
    "post_comment": {"type": "function", "function": {
        "name": "post_comment",
        "description": "Post a comment to the current task.",
        "parameters": {"type": "object",
                       "properties": {"content": {"type": "string"}},
                       "required": ["content"]}}},
    "update_status": {"type": "function", "function": {
        "name": "update_status",
        "description": "Set task status. Use 'done' when complete, 'blocked' when stuck. When status is 'done', provide a concise outcome summary of what was accomplished.",
        "parameters": {"type": "object",
                       "properties": {
                           "status": {"type": "string",
                                      "enum": ["done", "blocked", "in_progress", "in_review", "cancelled"]},
                           "comment": {"type": "string"},
                           "outcome": {"type": "string", "description": "Brief summary of what was accomplished. Required when status is 'done'."}},
                       "required": ["status"]}}},
    "create_task": {"type": "function", "function": {
        "name": "create_task",
        "description": "Create a new task, optionally assign to an agent by ID slug. Pass parent_task_id to create a subtask under an existing task.",
        "parameters": {"type": "object",
                       "properties": {
                           "title": {"type": "string"},
                           "description": {"type": "string"},
                           "assignee_id": {"type": "string"},
                           "priority": {"type": "string",
                                        "enum": ["low", "medium", "high", "urgent"]},
                           "parent_task_id": {"type": "string", "description": "UUID of the parent task to create this as a subtask"}},
                       "required": ["title"]}}},
    "assign_task": {"type": "function", "function": {
        "name": "assign_task",
        "description": "Assign an existing task to an agent by ID slug. task_id accepts a task number (e.g. '5' or '#5') or a UUID.",
        "parameters": {"type": "object",
                       "properties": {
                           "task_id": {"type": "string", "description": "Task number (e.g. '5' or '#5') or UUID"},
                           "assignee_id": {"type": "string"}},
                       "required": ["task_id", "assignee_id"]}}},
    "request_approval": {"type": "function", "function": {
        "name": "request_approval",
        "description": "Pause the task and request human approval. Use before dangerous or irreversible actions (e.g. deleting data, deploying to production). Provide a clear reason.",
        "parameters": {"type": "object",
                       "properties": {
                           "reason": {"type": "string", "description": "What decision needs approval and why"}},
                       "required": ["reason"]}}},
    "ask_agent": {"type": "function", "function": {
        "name": "ask_agent",
        "description": (
            "Ask another agent or user a question. Reassigns this task to them so they can answer. "
            "Your run will close automatically — the task returns to you once they respond."
        ),
        "parameters": {"type": "object",
                       "properties": {
                           "agent_id": {"type": "string",
                                        "description": "ID slug of the agent or user to ask (e.g. 'cto', 'backend-dev')"},
                           "question": {"type": "string",
                                        "description": "The question to ask"}},
                       "required": ["agent_id", "question"]}}},
    "read_file": {"type": "function", "function": {
        "name": "read_file",
        "description": "Read a file from your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": ["path"]}}},
    "write_file": {"type": "function", "function": {
        "name": "write_file",
        "description": "Write or create a file in your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                       "required": ["path", "content"]}}},
    "list_directory": {"type": "function", "function": {
        "name": "list_directory",
        "description": "List files in your working directory.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": []}}},
    "web_search": {"type": "function", "function": {
        "name": "web_search",
        "description": "Search the web via Serper API.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]}}},
    "fetch_url": {"type": "function", "function": {
        "name": "fetch_url",
        "description": "HTTP GET a URL and return its text content.",
        "parameters": {"type": "object",
                       "properties": {"url": {"type": "string"}},
                       "required": ["url"]}}},
}


@dataclass
class ToolContext:
    db: Session
    org_id: str
    task_id: str
    agent_id: str
    working_dir: str
    project_dir: str | None = None
    search_api_key: str | None = None
    scheduler_trigger: Any = None


def get_tool_schemas(optional_tools: list[str]) -> list[dict]:
    schemas = [TOOL_SCHEMAS[n] for n in ALWAYS_ON_TOOLS if n in TOOL_SCHEMAS]
    for name in optional_tools:
        if name in TOOL_SCHEMAS and name not in ALWAYS_ON_TOOLS:
            schemas.append(TOOL_SCHEMAS[name])
    return schemas


def _safe_path(working_dir: str, relative: str, project_dir: str | None = None) -> Path | None:
    base = Path(working_dir).resolve()
    target = (base / relative).resolve()
    base_s = str(base)
    if str(target) == base_s or str(target).startswith(base_s + os.sep):
        return target
    if project_dir:
        proj = Path(project_dir).resolve()
        proj_s = str(proj)
        if str(target) == proj_s or str(target).startswith(proj_s + os.sep):
            return target
    return None


def execute_tool(name: str, args: dict, ctx: ToolContext) -> str:
    try:
        return _HANDLERS[name](args, ctx)
    except KeyError:
        return f"Error: unknown tool '{name}'"
    except Exception as e:
        return f"Error executing {name}: {e}"


def _post_comment(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Comment
    ctx.db.add(Comment(task_id=uuid.UUID(ctx.task_id), author_id=ctx.agent_id,
                       content=args["content"], is_system=False))
    ctx.db.commit()
    return "Comment posted."


def _update_status(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Task, Comment
    task = ctx.db.query(Task).filter(Task.id == uuid.UUID(ctx.task_id)).first()
    if not task:
        return "Error: task not found"
    task.status = args["status"]
    if args.get("outcome"):
        task.outcome = args["outcome"]
    if args.get("comment"):
        ctx.db.add(Comment(task_id=task.id, author_id=ctx.agent_id,
                           content=args["comment"], is_system=False))
    ctx.db.commit()
    return f"Status updated to '{args['status']}'."


def _create_task(args: dict, ctx: ToolContext) -> str:
    import uuid
    from sqlalchemy import func
    from graphait.models.task import Task, TaskStatus, TaskPriority
    org_id = uuid.UUID(ctx.org_id)
    num = (ctx.db.query(func.max(Task.number)).filter(Task.org_id == org_id).scalar() or 0) + 1
    parent_id = None
    if args.get("parent_task_id"):
        try:
            parent_id = uuid.UUID(args["parent_task_id"])
        except ValueError:
            pass
    task = Task(org_id=org_id, title=args["title"], description=args.get("description"),
                creator_id=ctx.agent_id,
                assignee_id=args.get("assignee_id"),
                priority=TaskPriority(args.get("priority", "medium")),
                status=TaskStatus.todo, number=num,
                parent_task_id=parent_id)
    ctx.db.add(task)
    ctx.db.commit()
    ctx.db.refresh(task)
    if task.assignee_id and ctx.scheduler_trigger:
        ctx.scheduler_trigger(task.assignee_id)
    parent_info = f" (subtask of #{args['parent_task_id'][:8]})" if parent_id else ""
    return f"Task #{task.number} (id: {task.id}) created: '{task.title}'{parent_info}."


def _assign_task(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Task
    task_ref = args["task_id"].lstrip("#").strip()
    task = None
    try:
        task = ctx.db.query(Task).filter(Task.id == uuid.UUID(task_ref)).first()
    except ValueError:
        pass
    if not task:
        try:
            task = ctx.db.query(Task).filter(
                Task.number == int(task_ref),
                Task.org_id == uuid.UUID(ctx.org_id),
            ).first()
        except ValueError:
            pass
    if not task:
        return "Error: task not found"
    task.assignee_id = args["assignee_id"]
    ctx.db.commit()
    if ctx.scheduler_trigger:
        ctx.scheduler_trigger(args["assignee_id"])
    return f"Task #{task.number} assigned to '{args['assignee_id']}'."


def _read_file(args: dict, ctx: ToolContext) -> str:
    p = _safe_path(ctx.working_dir, args["path"], ctx.project_dir)
    if p is None:
        return "Error: path traversal not allowed"
    return p.read_text(errors="replace") if p.exists() else f"Error: file not found: {args['path']}"


def _write_file(args: dict, ctx: ToolContext) -> str:
    p = _safe_path(ctx.working_dir, args["path"], ctx.project_dir)
    if p is None:
        return "Error: path traversal not allowed"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(args["content"])
    return f"Written: {args['path']}"


def _list_directory(args: dict, ctx: ToolContext) -> str:
    sub = args.get("path", "")
    target = _safe_path(ctx.working_dir, sub, ctx.project_dir) if sub else Path(ctx.working_dir).resolve()
    if target is None:
        return "Error: path traversal not allowed"
    if not target.exists():
        return f"Directory not found: {sub or '.'}"
    entries = sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name))
    return "\n".join(f"{'[dir] ' if e.is_dir() else '      '}{e.name}" for e in entries) or "(empty)"


def _web_search(args: dict, ctx: ToolContext) -> str:
    import httpx
    if not ctx.search_api_key:
        return "Error: search_api_key not configured in org.json"
    resp = httpx.post("https://google.serper.dev/search",
                      headers={"X-API-KEY": ctx.search_api_key, "Content-Type": "application/json"},
                      json={"q": args["query"], "num": 5}, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("organic", [])
    return "\n\n".join(
        f"{r.get('title')}\n{r.get('link')}\n{r.get('snippet', '')}" for r in results[:5]
    ) or "No results."


def _fetch_url(args: dict, ctx: ToolContext) -> str:
    import httpx
    resp = httpx.get(args["url"], timeout=15, follow_redirects=True,
                     headers={"User-Agent": "Graphait-Agent/1.0"})
    resp.raise_for_status()
    return resp.text[:8000]


def _request_approval(args: dict, ctx: ToolContext) -> str:
    import uuid
    from graphait.models.task import Task, Comment, TaskStatus
    task = ctx.db.query(Task).filter(Task.id == uuid.UUID(ctx.task_id)).first()
    if not task:
        return "Error: task not found"
    task.status = TaskStatus.waiting_approval
    ctx.db.add(Comment(
        task_id=task.id,
        author_id=ctx.agent_id,
        content=f"Approval requested: {args['reason']}",
        is_system=True,
    ))
    ctx.db.commit()
    return "APPROVAL_REQUESTED"


def _ask_agent(args: dict, ctx: ToolContext) -> str:
    import uuid as uuid_mod
    from graphait.models.task import Task, Comment, TaskStatus
    task = ctx.db.query(Task).filter(Task.id == uuid_mod.UUID(ctx.task_id)).first()
    if not task:
        return "Error: task not found"
    if task.blocked_by_agent_id:
        return "Error: cannot ask while already waiting for an answer (v1: single-level only)."
    agent_id = args["agent_id"]
    question = args["question"]
    ctx.db.add(Comment(task_id=task.id, author_id=ctx.agent_id,
                       content=f"@{agent_id}: {question}", is_system=False))
    task.blocked_by_agent_id = ctx.agent_id
    task.assignee_id = agent_id
    task.status = TaskStatus.in_progress
    ctx.db.commit()
    if ctx.scheduler_trigger:
        ctx.scheduler_trigger(agent_id)
    return f"Question posted to @{agent_id}. Task reassigned. Your run will now close."


_HANDLERS = {
    "post_comment": _post_comment, "update_status": _update_status,
    "create_task": _create_task, "assign_task": _assign_task,
    "request_approval": _request_approval, "ask_agent": _ask_agent,
    "read_file": _read_file, "write_file": _write_file,
    "list_directory": _list_directory, "web_search": _web_search,
    "fetch_url": _fetch_url,
}
