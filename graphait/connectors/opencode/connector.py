import asyncio
import json
import os
import tempfile
from graphait.connectors.base import BaseConnector, AgentContext, Action

TASK_PROMPT_TEMPLATE = """You are {name}, a {role_title}.
{system_prompt}

Your current tasks (JSON):
{tasks}

Authority scope: {authority_scope}
Supervisor: {supervisor}
Subordinates: {subordinates}

Respond with a JSON object with an "actions" array. Each action:
- {{"type": "comment", "payload": {{"task_id": "...", "content": "..."}}}}
- {{"type": "update_status", "payload": {{"task_id": "...", "status": "done|in_progress|in_review"}}}}
- {{"type": "create_task", "payload": {{"title": "...", "description": "...", "assignee_id": "..."}}}}
- {{"type": "escalate", "payload": {{"task_id": "...", "message": "..."}}}}
Respond ONLY with valid JSON."""


class OpenCodeConnector(BaseConnector):
    async def run(self, context: AgentContext, connector_config: dict) -> list[Action]:
        opencode_bin = connector_config.get("binary", "opencode")
        model = connector_config.get("model", "")

        prompt = TASK_PROMPT_TEMPLATE.format(
            name=context.agent_name,
            role_title=context.role_title,
            system_prompt=context.system_prompt or "",
            tasks=json.dumps(context.tasks, indent=2, default=str),
            authority_scope=json.dumps(context.authority_scope or {}),
            supervisor=context.supervisor_name or "none",
            subordinates=", ".join(context.subordinate_names) or "none",
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(prompt)
            prompt_file = f.name

        try:
            cmd = [opencode_bin, "run", "--no-tty", "--output-format", "json"]
            if model:
                cmd += ["--model", model]
            cmd += ["--prompt-file", prompt_file]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, **connector_config.get("env", {})},
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        finally:
            os.unlink(prompt_file)

        if proc.returncode != 0:
            raise RuntimeError(f"OpenCode exited {proc.returncode}: {stderr.decode()[:500]}")

        output = stdout.decode().strip()
        start = output.find("{")
        if start == -1:
            return []
        data = json.loads(output[start:])
        return [Action(type=a["type"], payload=a.get("payload", {})) for a in data.get("actions", [])]
