import { apiFetch } from './client'

export interface SkillRead {
  id: string
  name: string
  content: string
}

export const skillsApi = {
  list: () => apiFetch<SkillRead[]>('/skills'),
  get: (id: string) => apiFetch<SkillRead>(`/skills/${id}`),
  create: (body: { id: string; name: string; content: string }) =>
    apiFetch<SkillRead>('/skills', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { content?: string; name?: string }) =>
    apiFetch<SkillRead>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/skills/${id}`, { method: 'DELETE' }),
}
