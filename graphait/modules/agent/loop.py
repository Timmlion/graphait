from __future__ import annotations
import json
import logging
import uuid
from typing import Any

import httpx
from sqlalchemy.orm import Session

from graphait.config.loader import AgentConfig, OrgConfig, load_skill, load_context
from graphait.models.task import Task, Comment, TaskStatus
from graphait.modules.agent.tools import ToolContext, get_tool_schemas, execute_tool

logger = logging.getLogger(__name__)
MAX_ITERATIONS = 20
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class AgentLoop:
    def __init__(self, agent: AgentConfig, org: OrgConfig, task: Task,
                 db: Session, scheduler_trigger: Any = None):
        self.agent = agent
        self.org = org
        self.task = task
        self.db = db
        self.scheduler_trigger = scheduler_trigger

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

    def _task_message(self) -> str:
        comments = (self.db.query(Comment)
                    .filter(Comment.task_id == self.task.id)
                    .order_by(Comment.created_at.desc())
                    .limit(10).all())
        comments_text = "\n".join(
            f"[{c.author_id}]: {c.content}" for c in reversed(comments)
        ) or "(no comments yet)"
        return (
            f"## Task #{self.task.number}: {self.task.title}\n\n"
            f"{self.task.description or '(no description)'}\n\n"
            f"Priority: {self.task.priority.value} | Status: {self.task.status.value}\n\n"
            f"## Recent comments\n{comments_text}\n\n---\n"
            f"Work on this task. Call update_status(done) when complete, "
            f"update_status(blocked) if you need more information."
        )

    async def _call_api(self, messages: list[dict], tools: list[dict]) -> dict:
        api_key = self.agent.api_key or self.org.openrouter_api_key or ""
        model = self.agent.model or self.org.default_model
        payload: dict = {"model": model, "messages": messages}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    def _agent_db_id(self) -> uuid.UUID:
        """Return the DB agent UUID for FK columns.

        AgentConfig.id is a string slug; DB Comment/Task FK columns need a UUID.
        We resolve it from the task's assignee (the agent running this loop).
        """
        return self.task.assignee_id if self.task.assignee_id else self.task.creator_id

    async def run(self) -> None:
        from graphait.models.run import AgentRun, RunEvent, RunStatus, RunEventRole
        from datetime import datetime

        # Guard: skip if another run is already active for this task
        active = (self.db.query(AgentRun)
                  .filter(AgentRun.task_id == self.task.id,
                          AgentRun.status == RunStatus.running)
                  .first())
        if active:
            logger.warning("Task %s already locked by run %s (agent=%s) — skipping",
                           self.task.id, active.id, active.agent_id)
            return

        run = AgentRun(
            agent_id=self.agent.id,
            task_id=self.task.id,
            status=RunStatus.running,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        def _log(role: RunEventRole, content: str, tool_name: str | None = None) -> None:
            self.db.add(RunEvent(run_id=run.id, role=role, content=content, tool_name=tool_name))
            self.db.commit()

        def _close(status: RunStatus) -> None:
            run.finished_at = datetime.utcnow()
            run.status = status
            self.db.commit()

        tools = get_tool_schemas(self.agent.tools)
        ctx = ToolContext(db=self.db, org_id=str(self.task.org_id),
                         task_id=str(self.task.id), agent_id=self._agent_db_id(),
                         working_dir=self.agent.working_dir,
                         search_api_key=self.org.search_api_key,
                         scheduler_trigger=self.scheduler_trigger)
        task_msg = self._task_message()
        messages: list[dict] = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": task_msg},
        ]
        _log(RunEventRole.user, task_msg)

        for iteration in range(MAX_ITERATIONS):
            try:
                data = await self._call_api(messages, tools)
            except Exception as e:
                logger.error("API error (agent=%s iter=%d): %s", self.agent.id, iteration, e)
                self._system_comment(f"API error: {e}")
                _close(RunStatus.error)
                break

            msg = data["choices"][0]["message"]
            messages.append(msg)
            tool_calls = msg.get("tool_calls") or []

            if not tool_calls:
                if msg.get("content"):
                    self._agent_comment(msg["content"])
                    _log(RunEventRole.assistant, msg["content"])
                self._set_status("done")
                _close(RunStatus.done)
                return

            for tc in tool_calls:
                fn = tc["function"]
                try:
                    args = json.loads(fn["arguments"])
                except json.JSONDecodeError:
                    args = {}
                _log(RunEventRole.tool_call, fn["arguments"], tool_name=fn["name"])
                result = execute_tool(fn["name"], args, ctx)
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
                _log(RunEventRole.tool_result, result, tool_name=fn["name"])
                if fn["name"] == "update_status":
                    finish_status = (RunStatus.blocked if args.get("status") == "blocked"
                                     else RunStatus.done)
                    _close(finish_status)
                    return
                if fn["name"] == "request_approval":
                    _close(RunStatus.blocked)
                    return

        self._system_comment("Reached iteration limit without completing task.")
        _close(RunStatus.limit_reached)

    def _system_comment(self, content: str) -> None:
        self.db.add(Comment(task_id=self.task.id, author_id=self._agent_db_id(),
                            content=content, is_system=True))
        self.db.commit()

    def _agent_comment(self, content: str) -> None:
        self.db.add(Comment(task_id=self.task.id, author_id=self._agent_db_id(),
                            content=content, is_system=False))
        self.db.commit()

    def _set_status(self, status: str) -> None:
        self.task.status = TaskStatus(status)
        self.db.commit()
