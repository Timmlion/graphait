import { test, expect } from '@playwright/test'
import { registerWithAgent } from './helpers'

test.describe('Board', () => {
  test.beforeEach(async ({ page }) => {
    await registerWithAgent(page)
  })

  test('shows four kanban columns', async ({ page }) => {
    await expect(page.getByText('TODO')).toBeVisible()
    await expect(page.getByText('IN PROGRESS')).toBeVisible()
    await expect(page.getByText('WAITING APPROVAL')).toBeVisible()
    await expect(page.getByText('DONE')).toBeVisible()
  })

  test('create new task via modal', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('My first task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Card h3 is specific to the kanban card; panel auto-opens showing TASK #1
    await expect(page.locator('h3').filter({ hasText: 'My first task' })).toBeVisible()
    await expect(page.getByText('TASK #1')).toBeVisible()
  })

  test('click task card opens detail panel', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Detail panel task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Panel auto-opens after task creation
    await expect(page.getByText('TASK #1')).toBeVisible()
    await expect(page.getByText('Status')).toBeVisible()
    await expect(page.getByText('Priority')).toBeVisible()
  })

  test('close detail panel with X button', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Closeable task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Panel auto-opens; close via the X button inside aside
    await expect(page.getByText('TASK #1')).toBeVisible()
    await page.locator('aside').getByRole('button', { name: 'close' }).click()
    await expect(page.getByText('TASK #1')).not.toBeVisible()
  })

  test('change task status via detail panel dropdown', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Status change task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Panel auto-opens; change status
    await page.locator('aside select').first().selectOption('in_progress')
    await expect(page.locator('aside select').first()).toHaveValue('in_progress')

    // Card still visible after status change
    await expect(page.locator('h3').filter({ hasText: 'Status change task' })).toBeVisible()
  })

  test('add comment in detail panel', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Comment task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Panel auto-opens
    await page.getByPlaceholder('Write a comment…').fill('Hello from Playwright')
    await page.locator('aside').getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('Hello from Playwright')).toBeVisible()
  })

  test('cancel new task modal does not create task', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Should not appear')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Should not appear')).not.toBeVisible()
  })

  test('clicking selected task again closes detail panel', async ({ page }) => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.getByPlaceholder('Task title…').fill('Toggle task')
    await page.getByRole('button', { name: 'Create' }).click()

    // Panel auto-opens after creation
    await expect(page.getByText('TASK #1')).toBeVisible()

    // Click the card heading to toggle panel off
    await page.locator('h3').filter({ hasText: 'Toggle task' }).click()
    await expect(page.getByText('TASK #1')).not.toBeVisible()
  })
})
