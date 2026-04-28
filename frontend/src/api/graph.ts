import { apiFetch } from './client'
import type { Agent } from './agents'

export interface GraphEdge {
  id: string
  from_agent_id: string
  to_agent_id: string
  type: string
}

export interface GraphData {
  nodes: Agent[]
  edges: GraphEdge[]
}

export const graphApi = {
  get: () => apiFetch<GraphData>('/graph'),
}
