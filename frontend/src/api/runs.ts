import { apiFetch } from './client'

export interface AgentRun {
  id: string
  agent_id: string
  task_id: string
  task_title: string
  task_number: number | null
  started_at: string
  finished_at: string | null
  status: 'running' | 'done' | 'blocked' | 'error' | 'limit_reached' | 'stopped'
  duration_seconds: number | null
}

export interface RunEvent {
  id: string
  run_id: string
  created_at: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  tool_name: string | null
}

export const runsApi = {
  list: () => apiFetch<AgentRun[]>('/runs'),
  events: (runId: string) => apiFetch<RunEvent[]>(`/runs/${runId}/events`),
}
