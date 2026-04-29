import { apiFetch } from './client'

export interface OrgSettings {
  org_id: string
  org_name: string
  org_slug: string
  system_prompt: string | null
  openrouter_api_key: string | null
  default_model: string | null
  search_api_key: string | null
  project_dir: string | null
}

export const orgApi = {
  getSettings: () => apiFetch<OrgSettings>('/org'),
  patchSettings: (body: Partial<Pick<OrgSettings,
    'system_prompt' | 'openrouter_api_key' | 'default_model' | 'search_api_key' | 'project_dir'>>) =>
    apiFetch<OrgSettings>('/org', { method: 'PATCH', body: JSON.stringify(body) }),
}
