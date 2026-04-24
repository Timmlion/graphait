import json
import httpx
from graphait.connectors.base import BaseConnector, AgentContext, Action

SYSTEM_TEMPLATE = """You are {name}, a {role_title} in an AI-managed organization.
{system_prompt}

Authority scope: {authority_scope}
Supervisor: {supervisor}
Subordinates: {subordinates}

You will receive your current tasks and recent comments. Respond with a JSON object containing an "actions" array.
Each action has a "type" and "payload":
- {{"type": "comment", "payload": {{"task_id": "...", "content": "..."}}}}
- {{"type": "update_status", "payload": {{"task_id": "...", "status": "done|in_progress|in_review|cancelled"}}}}
- {{"type": "create_task", "payload": {{"title": "...", "description": "...", "assignee_id": "..."}}}}
- {{"type": "escalate", "payload": {{"task_id": "...", "message": "..."}}}}

Respond ONLY with valid JSON. No markdown fences."""

USER_TEMPLATE = """Your current tasks:
{tasks}

What actions will you take?"""


class HTTPConnector(BaseConnector):
    async def run(self, context: AgentContext, connector_config: dict) -> list[Action]:
        api_url = connector_config.get("api_url", "https://openrouter.ai/api/v1/chat/completions")
        api_key = connector_config.get("api_key", "")
        model = connector_config.get("model", "openai/gpt-4o-mini")

        if not api_key:
            raise ValueError("connector_config must include 'api_key'")

        system_msg = SYSTEM_TEMPLATE.format(
            name=context.agent_name,
            role_title=context.role_title,
            system_prompt=context.system_prompt or "",
            authority_scope=json.dumps(context.authority_scope or {}),
            supervisor=context.supervisor_name or "none (you are the top of hierarchy)",
            subordinates=", ".join(context.subordinate_names) or "none",
        )
        user_msg = USER_TEMPLATE.format(tasks=json.dumps(context.tasks, indent=2, default=str))

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                api_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ]},
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown fences that some models add despite instructions
        stripped = content.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            stripped = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:]).strip()

        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as e:
            raise ValueError(f"HTTPConnector failed to parse response: {e}\nRaw: {content[:300]}") from e

        return [Action(type=a["type"], payload=a.get("payload", {})) for a in data.get("actions", [])]
