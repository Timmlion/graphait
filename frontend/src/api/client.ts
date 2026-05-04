const BASE = '/api/v1'

function getToken() {
  return localStorage.getItem('graphait_token')
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(data.detail ?? res.statusText)
  }
  if (res.status === 204) return null as T
  return res.json()
}
