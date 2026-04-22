import { test, expect } from '@playwright/test'
import { register } from './helpers'

test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await page.getByRole('link', { name: 'Agents' }).click()
    await page.waitForURL('/agents')
  })

  test('agents page renders three-pane layout', async ({ page }) => {
    await expect(page.getByPlaceholder('Filter agents…')).toBeVisible()
    await expect(page.locator('button').filter({ hasText: 'zoom_in' })).toBeVisible()
  })

  test('empty state shows no agents message', async ({ page }) => {
    // Agent list pane has "No agents yet." and canvas has a longer message
    await expect(page.getByText('No agents yet.')).toBeVisible()
  })

  test('create agent via API and it appears in list', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('graphait_token'))
    await page.request.post('/api/v1/agents', {
      data: { name: 'Test Agent', role_title: 'Developer', type: 'ai' },
      headers: { Authorization: `Bearer ${token}` },
    })

    await page.reload()
    await page.waitForURL('/agents')

    await expect(page.getByTestId('agent-list').getByText('Test Agent')).toBeVisible()
  })

  test('click agent opens config panel', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('graphait_token'))
    await page.request.post('/api/v1/agents', {
      data: { name: 'Config Agent', role_title: 'Analyst', type: 'ai' },
      headers: { Authorization: `Bearer ${token}` },
    })
    await page.reload()
    await page.waitForURL('/agents')

    await page.getByTestId('agent-list').getByText('Config Agent').click()

    await expect(page.getByText('Scheduler / Agent Config')).toBeVisible()
    await expect(page.locator('select#connector-type')).toBeVisible()
  })

  test('config panel closes with discard button', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('graphait_token'))
    await page.request.post('/api/v1/agents', {
      data: { name: 'Panel Agent', role_title: 'PM', type: 'ai' },
      headers: { Authorization: `Bearer ${token}` },
    })
    await page.reload()
    await page.waitForURL('/agents')

    await page.getByTestId('agent-list').getByText('Panel Agent').click()
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible()

    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByText('Scheduler / Agent Config')).not.toBeVisible()
  })

  test('human agent shows no scheduler form', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('graphait_token'))
    await page.request.post('/api/v1/agents', {
      data: { name: 'Human Bob', role_title: 'Manager', type: 'human' },
      headers: { Authorization: `Bearer ${token}` },
    })
    await page.reload()
    await page.waitForURL('/agents')

    await page.getByTestId('agent-list').getByText('Human Bob').click()

    await expect(page.getByText('Human agents do not have a scheduler')).toBeVisible()
  })
})
