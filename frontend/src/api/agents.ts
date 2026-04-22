import { apiFetch } from './client'

export interface Agent {
  id: string
  org_id: string
  name: string
  role_title: string
  type: 'ai' | 'human'
  connector_type: string | null
  connector_config: Record<string, unknown> | null
  system_prompt: string | null
  authority_scope: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  schedule?: Schedule | null
}

export interface Schedule {
  id: string
  agent_id: string
  interval_seconds: number
  is_enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
}

export const agentsApi = {
  list: () => apiFetch<Agent[]>('/agents'),
  get: (id: string) => apiFetch<Agent>(`/agents/${id}`),
  create: (body: { name: string; role_title: string; type: 'ai' | 'human' }) =>
    apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Agent>) =>
    apiFetch<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/agents/${id}`, { method: 'DELETE' }),
}

export const schedulesApi = {
  create: (agent_id: string, interval_seconds: number) =>
    apiFetch<Schedule>('/schedules', { method: 'POST', body: JSON.stringify({ agent_id, interval_seconds }) }),
  update: (schedule_id: string, body: { interval_seconds?: number; is_enabled?: boolean }) =>
    apiFetch<Schedule>(`/schedules/${schedule_id}`, { method: 'PATCH', body: JSON.stringify(body) }),
}
