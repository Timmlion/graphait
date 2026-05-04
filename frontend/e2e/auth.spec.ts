import { test, expect } from '@playwright/test'
import { uniqueOrg, register, login } from './helpers'

test.describe('Auth', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Graphait' })).toBeVisible()
    await expect(page.getByText('Sign in to your workspace')).toBeVisible()
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
  })

  test('register creates workspace and redirects to board', async ({ page }) => {
    const creds = uniqueOrg()
    await page.goto('/login')
    await page.getByText('Create workspace').click()
    await expect(page.getByText('Create a new workspace')).toBeVisible()

    await page.getByLabel('Organization name', { exact: false }).fill(creds.orgName)
    await page.getByLabel('Org slug', { exact: false }).fill(creds.orgSlug)
    await page.getByLabel('Email', { exact: false }).fill(creds.email)
    await page.getByLabel('Password', { exact: false }).fill(creds.password)
    await page.getByRole('button', { name: /create workspace/i }).click()

    await page.waitForURL('/board')
    await expect(page.getByText('Tasks')).toBeVisible()
  })

  test('login with valid credentials redirects to board', async ({ page }) => {
    const creds = await register(page)
    // Log out by clearing token and reloading
    await page.evaluate(() => localStorage.removeItem('graphait_token'))
    await login(page, creds.email, creds.password)
    await expect(page).toHaveURL('/board')
  })

  test('login with wrong password shows error', async ({ page }) => {
    const creds = await register(page)
    await page.evaluate(() => localStorage.removeItem('graphait_token'))
    await page.goto('/login')
    await page.getByLabel('Email', { exact: false }).fill(creds.email)
    await page.getByLabel('Password', { exact: false }).fill('WrongPassword!')
    await page.getByRole('button', { name: /log in/i }).click()
    await expect(page.getByTestId('auth-error')).toBeVisible()
  })

  test('duplicate org slug returns error', async ({ page }) => {
    const creds = await register(page)
    await page.evaluate(() => localStorage.removeItem('graphait_token'))
    await page.goto('/login')
    await page.getByText('Create workspace').click()
    await page.getByLabel('Organization name', { exact: false }).fill('Another Org')
    await page.getByLabel('Org slug', { exact: false }).fill(creds.orgSlug)
    await page.getByLabel('Email', { exact: false }).fill(`other${Date.now()}@test.com`)
    await page.getByLabel('Password', { exact: false }).fill('TestPass123!')
    await page.getByRole('button', { name: /create workspace/i }).click()
    await expect(page.getByTestId('auth-error')).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Fresh browser context has no token — navigate directly to protected route
    await page.goto('/board')
    await page.waitForURL('/login')
  })

  test('logout clears session and redirects to login', async ({ page }) => {
    await register(page)
    await page.locator('header button[title="Log out"]').click()
    await page.waitForURL('/login')
    await page.goto('/board')
    await page.waitForURL('/login')
  })
})
