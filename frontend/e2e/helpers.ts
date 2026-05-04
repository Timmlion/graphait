import type { Page } from '@playwright/test'

export function uniqueOrg() {
  const ts = Date.now()
  return {
    orgName: `Test Org ${ts}`,
    orgSlug: `testorg${ts}`,
    email: `user${ts}@test.com`,
    password: 'TestPass123!',
  }
}

export async function register(page: Page, creds = uniqueOrg()) {
  await page.goto('/login')
  await page.getByText('Create workspace').click()
  await page.getByLabel('Organization name', { exact: false }).fill(creds.orgName)
  await page.getByLabel('Org slug', { exact: false }).fill(creds.orgSlug)
  await page.getByLabel('Email', { exact: false }).fill(creds.email)
  await page.getByLabel('Password', { exact: false }).fill(creds.password)
  await page.getByRole('button', { name: /create workspace/i }).click()
  await page.waitForURL('/board')
  return creds
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: false }).fill(email)
  await page.getByLabel('Password', { exact: false }).fill(password)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL('/board')
}

/** Register, then create a human agent and link it to the current user.
 *  Required before creating tasks (backend enforces creator must have a linked agent). */
export async function registerWithAgent(page: Page) {
  const creds = await register(page)
  const token = await page.evaluate(() => localStorage.getItem('graphait_token'))
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const agentRes = await page.request.post('/api/v1/agents', {
    data: { name: 'Test User Agent', role_title: 'Developer', type: 'human' },
    headers,
  })
  const agent = await agentRes.json()

  const meRes = await page.request.get('/api/v1/auth/me', { headers })
  const me = await meRes.json()

  await page.request.patch(`/api/v1/agents/${agent.id}`, {
    data: { user_id: me.id },
    headers,
  })

  return creds
}
