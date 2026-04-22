import { apiFetch } from './client'
import type { Agent } from './agents'

export type RelationshipType = 'reports_to' | 'collaborates_with' | 'supervises'

export interface AgentRelationship {
  id: string
  from_agent_id: string
  to_agent_id: string
  type: RelationshipType
}

export interface GraphData {
  nodes: Agent[]
  edges: AgentRelationship[]
}

export const graphApi = {
  get: () => apiFetch<GraphData>('/graph'),
  createRelationship: (from_agent_id: string, to_agent_id: string, type: RelationshipType) =>
    apiFetch<AgentRelationship>('/graph/relationships', {
      method: 'POST',
      body: JSON.stringify({ from_agent_id, to_agent_id, type }),
    }),
  deleteRelationship: (id: string) =>
    apiFetch<void>(`/graph/relationships/${id}`, { method: 'DELETE' }),
}
