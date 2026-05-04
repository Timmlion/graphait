import { apiFetch } from './client'

export interface Agent {
  id: string
  name: string
  role_title: string
  type: 'ai' | 'human'
  model: string
  api_key: string | null
  working_dir: string
  reports_to: string | null
  schedule_interval: number
  schedule_enabled: boolean
  tools: string[]
  skills: string[]
  system_prompt: string
}

export const agentsApi = {
  list: () => apiFetch<Agent[]>('/agents'),
  get: (id: string) => apiFetch<Agent>(`/agents/${id}`),
  create: (body: Partial<Agent> & { id: string; name: string; role_title: string; working_dir: string }) =>
    apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Agent>) =>
    apiFetch<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/agents/${id}`, { method: 'DELETE' }),
  run: (id: string) => apiFetch<{ status: string; agent_id: string }>(`/agents/${id}/run`, { method: 'POST' }),
  stop: (id: string) => apiFetch<{ status: string; run_id: string }>(`/agents/${id}/stop`, { method: 'POST' }),
}
