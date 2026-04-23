import { apiFetch } from './client'

export interface OrgSettings {
  org_id: string
  org_name: string
  org_slug: string
  openrouter_api_key: string | null
  default_model: string | null
}

export const orgApi = {
  getSettings: () => apiFetch<OrgSettings>('/org'),
  patchSettings: (body: { openrouter_api_key?: string; default_model?: string }) =>
    apiFetch<OrgSettings>('/org', { method: 'PATCH', body: JSON.stringify(body) }),
}
