# Graphait — Design Spec
**Date:** 2026-04-21
**Status:** Approved

---

## Overview

Graphait (graph + AI, wymawiane jak "graphite") to open-source platforma do zarządzania agentami AI i ludzkimi w strukturze organizacyjnej. Agenci tworzą graf zależności (kto komu podlega, kto z kim współpracuje) i synchronizują pracę przez wspólny task board — jak Jira, ale wykonawcą tasku może być AI lub człowiek.

**Inspiracje:** Paperclip AI (hierarchia agentów), Jira (task synchronization), n8n (integracje).

**Target users:**
- Firmy uzupełniające braki kadrowe wirtualnymi agentami AI (np. brak działu IT)
- Solopreneurzy budujący całą wirtualną firmę z agentów AI
- Deweloperzy budujący systemy agentów AI (API + pełna kontrola)
- Operatorzy biznesowi zarządzający agentami przez no-code UI

---

## Architektura

### Stack

| Warstwa | Technologia |
|---------|-------------|
| Backend | FastAPI (Python) + SQLAlchemy |
| Database | PostgreSQL |
| Queue/Cache | Redis (scheduler + WebSocket pub/sub) |
| Frontend | React + React Flow + shadcn/ui |
| Storage | S3-compatible (lub local filesystem) |
| Deployment | Docker Compose (single command) |

### Struktura — modularny monolit

```
graphait/
  api/          # FastAPI routers
  modules/
    agents/     # CRUD agentów, hierarchia
    tasks/      # Task board, komentarze
    graph/      # Relacje, wizualizacja
    scheduler/  # Agent wake-up (Redis)
    auth/       # JWT, organizacje
    connector_hub/ # Rejestr connectorów, dispatcher
    skills/     # Skill catalog, dziedziczenie
  connectors/
    base.py     # BaseConnector ABC
    http/       # HTTP / OpenRouter
    opencode/   # OpenCode headless CLI
    claude_code/ # M2
    gemini_cli/  # M2
    codex/       # M2
    ollama/      # M3
    lm_studio/   # M3
frontend/       # React app
```

Connectors są modułami w source — nowe integracje dodawane przez PR w kolejnych release'ach, nie jako zewnętrzne paczki.

---

## Model danych

### Organization
```
id          uuid PK
name        str
slug        str UNIQUE
settings    jsonb
created_at  timestamp
```

### User
```
id            uuid PK
org_id        uuid FK → Organization
email         str UNIQUE
password_hash str
role          enum: admin | member
created_at    timestamp
```

### Agent
```
id               uuid PK
org_id           uuid FK → Organization
user_id          uuid FK? → User        -- null jeśli AI
department_id    uuid FK? → Department  -- null w M1, wymagany od M3
name             str
role_title       str                    -- "CEO", "CTO", "Dev 1"
type             enum: human | ai
connector_type   str?                   -- "http", "opencode", null dla human
connector_config jsonb                  -- klucze API, URL modelu, model name
                                       -- szyfrowane na poziomie aplikacji (Fernet/AES) przed zapisem do DB
system_prompt    text?
authority_scope  jsonb                  -- co agent może zatwierdzać samodzielnie
is_active        bool DEFAULT true
created_at       timestamp
```

### AgentRelationship
```
id            uuid PK
from_agent_id uuid FK → Agent
to_agent_id   uuid FK → Agent
type          enum: reports_to | collaborates_with
created_at    timestamp
UNIQUE (from_agent_id, to_agent_id, type)
```

### Task
```
id             uuid PK
org_id         uuid FK → Organization
number         int AUTO (per org)       -- przyjazny identyfikator #42
title          str
description    text (markdown)
status         enum: todo | in_progress | in_review | done | cancelled
                     | waiting_approval | approved | rejected
priority       enum: low | medium | high | urgent
task_type      enum: task | approval_request
assignee_id    uuid FK? → Agent
creator_id     uuid FK → Agent
parent_task_id uuid FK? → Task         -- subtaski
created_at     timestamp
updated_at     timestamp
```

### Comment
```
id         uuid PK
task_id    uuid FK → Task
author_id  uuid FK → Agent
content    text (markdown)
is_system  bool DEFAULT false          -- automatyczne wpisy systemu
created_at timestamp
```

### Attachment
```
id           uuid PK
task_id      uuid FK → Task
comment_id   uuid FK? → Comment
filename     str
storage_path str
size_bytes   int
created_at   timestamp
```

### AgentSchedule
```
id               uuid PK
agent_id         uuid FK → Agent UNIQUE  -- tylko dla AI agentów
interval_seconds int DEFAULT 300
last_run_at      timestamp?
next_run_at      timestamp?
is_enabled       bool DEFAULT true
```

### Skill
```
id            str PK (slug)             -- "web_search", "code_execution"
name          str
skill_type    enum: tool | mcp | capability
config_schema jsonb                     -- JSON Schema wymaganej konfiguracji
description   text                      -- dla LLM: jak i kiedy używać
```

### AgentSkill / DepartmentSkill / OrgSkill
Trzy osobne tabele o identycznej strukturze (różne FK targets):
```
-- AgentSkill
agent_id   uuid FK → Agent
skill_id   str  FK → Skill
enabled    bool DEFAULT true            -- false = blokada dziedziczonego skilla
config     jsonb                        -- instancja konfiguracji (nadpisuje wyższy poziom)
PRIMARY KEY (agent_id, skill_id)

-- DepartmentSkill: department_id FK → Department
-- OrgSkill:        org_id FK → Organization
-- (identyczna struktura)
```

### Department *(schema gotowe, UI od M3)*
```
id                  uuid PK
org_id              uuid FK → Organization
parent_department_id uuid FK? → Department
name                str
system_prompt_suffix text?
resource_config     jsonb
```

---

## Agent Execution Loop (AI)

```
Redis Scheduler
  → co interval_seconds: push agent_id na kolejkę
  → Worker odbiera

Worker:
  1. Fetch context:
     - przypisane taski (todo / in_progress / waiting_approval)
     - nowe komentarze od last_run_at
     - role_title + system_prompt + authority_scope
     - efektywne skille (computed: org → dept → agent)
     - hierarchia (supervisor_id, subordinate_ids)

  2. Connector call (LLM):
     - ustrukturyzowany prompt z kontekstem
     - response: JSON z listą akcji

  3. Action executor:
     - comment       → dodaje Comment na tasku
     - update_status → zmienia Task.status
     - create_task   → nowy Task (assignee może być subordinate)
     - escalate      → tworzy approval_request Task u supervisora
     - use_skill     → wywołuje narzędzie przez Skill connector

  4. AgentSchedule.last_run_at = now()
  5. Redis pub/sub → WebSocket push do UI
```

**Human agent:** identyczny model, inna ścieżka — User loguje się, widzi Inbox (przypisane taski, nowe komentarze), wykonuje akcje przez UI. Efekt w DB identyczny.

---

## Hierarchia odpowiedzialności (Authority)

`Agent.authority_scope` — jsonb definiujący zakres samodzielnych decyzji:
```json
{
  "hire_agents": true,
  "budget_limit": 5000,
  "create_projects": true,
  "external_api_access": true,
  "fire_agents": false
}
```

**Supervisor** agenta = `to_agent_id` z `AgentRelationship` gdzie `from_agent_id = agent.id` i `type = reports_to`. Jeśli brak — agent jest na szczycie hierarchii (Board).

**Approval flow:**
1. Agent chce wykonać akcję poza `authority_scope`
2. Tworzy Task typu `approval_request` przypisany do bezpośredniego supervisora
3. Oryginalny Task → status `waiting_approval`
4. Supervisor (human lub AI) approve/reject przez UI button lub komentarz
5. Agent budzony → kontynuuje (approved) lub eskaluje wyżej (rejected)

**Board/Shareholders** — Agent z `type: human` na szczycie hierarchii (bez supervisora). Brak special-casing w kodzie — to zwykły Agent.

---

## Skills & Tools — dziedziczenie

Efektywny zestaw skilli agenta = merge hierarchii z blokadami:

```
Org skills
  + Department skills (override/block)
    + Agent skills (override/block)
      = Effective skills (computed)
```

`enabled: false` na niższym poziomie blokuje skill dziedziczony z góry.

**Typy skilli:**
- `tool` — web_search, send_email, read_file, http_request, code_execution, db_query
- `mcp` — dowolny MCP server (URL + auth w `config` jsonb)
- `capability` — sandbox_execution, long_context, vision (modyfikują sposób wywołania LLM)

Efektywne skille trafiają do kontekstu LLM call — agent wie jakie narzędzia ma dostępne.

---

## Connectors

Każdy connector implementuje interfejs `BaseConnector`:
```python
class BaseConnector:
    async def run(self, agent: Agent, context: AgentContext) -> list[Action]:
        ...
```

| Connector | Type | M1 |
|-----------|------|-----|
| HTTP / OpenRouter | REST API | ✅ |
| OpenCode | headless CLI | ✅ |
| Claude Code | headless CLI | M2 |
| Gemini CLI | headless CLI | M2 |
| Codex | headless CLI | M2 |
| Ollama | local REST | M3 |
| LM Studio | local REST | M3 |

---

## Frontend

- **Graph View** — React Flow, force-directed, węzły = agenci (kolor wg type: human/ai, ikona roli), krawędzie = relacje (strzałka = reports_to, przerywana = collaborates_with). Drag to reorganize. Klik → panel boczny agenta.
- **Task Board** — kanban (todo/in_progress/in_review/done) + widok listy. Filtrowanie per agent.
- **Agent Inbox** — widok dla human agentów: moje taski, nowe komentarze, approval requests.
- **Agent Panel** — konfiguracja agenta: typ, connector, system_prompt, authority_scope, skille, schedule.

---

## Roadmap / Milestones

### M1 — Minimum
- [ ] Agent graph (CRUD, relacje, force-directed visualization)
- [ ] Task board (create/assign/comment/status/subtaski)
- [ ] Connectors: HTTP/OpenRouter + OpenCode headless
- [ ] Agent scheduler (Redis polling)
- [ ] Human agent Inbox UI
- [ ] Auth (JWT, single org)
- [ ] `docker-compose up` deployment

### M2 — Core
- [ ] Board/Shareholders + authority_scope + approval flow
- [ ] Skills & tools (web_search, code_execution, http_request) + MCP support
- [ ] Connectors: Claude Code, Gemini CLI, Codex
- [ ] WebSocket real-time updates
- [ ] Attachments

### M3 — Rozszerzenia
- [ ] Department model + UI + dziedziczenie skilli/promptów
- [ ] Connectors: Ollama, LM Studio
- [ ] Multi-org (user ∈ wiele org)
- [ ] Sandbox execution per agent
- [ ] Notifications (email/webhook)
- [ ] Audit log

### M4 — SaaS prep
- [ ] Billing / tenancy isolation
- [ ] Self-hosted installer
- [ ] Community connector contributions

---

## Decyzje projektowe

| Decyzja | Uzasadnienie |
|---------|--------------|
| Agent human i AI to jeden model | Unifikacja task board — system nie rozróżnia wykonawcy |
| Connectors w source, nie pip | Prostota dla open-source contributors, jeden `docker-compose up` |
| authority_scope jako jsonb | Elastyczność — każda org definiuje własne reguły bez migracji schematu |
| Board = zwykły Agent bez supervisora | Brak special-casing, hierarchia wynika z danych |
| Skill.description dla LLM | Agent rozumie swoje narzędzia przez system prompt, nie hardcode |
| department_id nullable w M1 | Backward-compatible — schema gotowa, UI i logika w M3 |
| MCP jako skill type | Natywna rozszerzalność bez zmian w source — community może dodawać MCP servery przez konfigurację |
