import { apiFetch } from './client'

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface User {
  id: string
  email: string
  role: string
  org_id: string
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (org_name: string, org_slug: string, email: string, password: string) =>
    apiFetch<TokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ org_name, org_slug, email, password }),
    }),
  me: () => apiFetch<User>('/auth/me'),
}
