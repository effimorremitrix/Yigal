import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'tidelane-demo'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('user-menu')).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test('redirects to login and rejects a bad password', async ({ page }) => {
  await page.goto('/shipments')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill('effi@tidelane.demo')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password')).toBeVisible()
})

test('admin logs in, sees dashboard and all shipments, then logs out', async ({ page }) => {
  await login(page, 'effi@tidelane.demo')
  await expect(page.getByText('Control Tower')).toBeVisible()
  await expect(page.getByTestId('user-menu')).toContainText('Effi Mor')

  await page.goto('/shipments')
  await expect(page.getByText('42 of 42 shipments')).toBeVisible()

  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/shipments')
  await expect(page).toHaveURL(/\/login$/)
})

test('viewer has no write affordances', async ({ page }) => {
  await login(page, 'viewer@tidelane.demo')
  await expect(page.getByRole('link', { name: 'Shipments' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New Booking' })).toHaveCount(0)

  await page.goto('/shipments')
  await expect(page.getByText('42 of 42 shipments')).toBeVisible()
  await expect(page.getByRole('link', { name: 'New booking' })).toHaveCount(0)

  // Open a shipment with a pending document; no approve button, no comment box.
  await page.getByText('TL-2026-0105').click()
  await expect(page.getByText('Journey')).toBeVisible()
  await page.getByRole('button', { name: /Documents/ }).click()
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await page.getByRole('button', { name: /Activity/ }).click()
  await expect(page.getByPlaceholder('Write a message to all parties…')).toHaveCount(0)

  // No admin tab in settings.
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Users & Organizations' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Integrations' })).toHaveCount(0)
  expect((await page.request.put('/api/integrations/ace', { data: { enabled: false } })).status()).toBe(403)
})

test('partner user sees only their org shipments', async ({ page }) => {
  await login(page, 'dana@atlaspolymers.demo')
  await expect(page.getByText('Partner view — shipper')).toBeVisible()

  await page.goto('/shipments')
  await expect(page.getByText(/of 8 shipments/)).toBeVisible()

  // Every visible shipment lists Atlas Polymers as a party.
  await page.locator('tbody tr').first().click()
  await page.getByRole('button', { name: /Parties/ }).click()
  await expect(page.getByRole('main').getByText('Atlas Polymers Ltd')).toBeVisible()

  // Direct navigation to a shipment outside the org scope is refused (s4 is not Atlas').
  await page.goto('/shipments/s4')
  await expect(page.getByText('Shipment not found')).toBeVisible()
})

test('settings persist across reload', async ({ page }) => {
  await login(page, 'effi@tidelane.demo')
  await page.goto('/settings')
  await page.getByTestId('profile-title').fill('Head of Global Logistics')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  await page.getByRole('button', { name: 'Preferences' }).click()
  await page.getByText('Weekly digest').click()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('user-menu')).toContainText('Head of Global Logistics')
  await page.goto('/settings')
  await expect(page.getByTestId('profile-title')).toHaveValue('Head of Global Logistics')
})

test('admin manages integrations in mock mode', async ({ page }) => {
  await login(page, 'effi@tidelane.demo')
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Integrations' }).click()
  const ace = page.getByTestId('integration-ace')
  const inttra = page.getByTestId('integration-inttra')
  await expect(ace).toBeVisible()
  await expect(inttra).toBeVisible()

  // No credentials configured: live is not selectable, mock health check passes and is persisted.
  await expect(page.getByTestId('integration-inttra-mode-live')).toBeDisabled()
  await inttra.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByTestId('integration-inttra-check')).toContainText('OK · mock')
  await page.reload()
  await page.getByRole('button', { name: 'Integrations' }).click()
  await expect(page.getByTestId('integration-inttra-check')).toContainText('OK · mock')

  // The API reports secret presence only, never values.
  const list = (await (await page.request.get('/api/integrations')).json()) as { secrets: Record<string, unknown>[] }[]
  expect(list).toHaveLength(2)
  for (const c of list) for (const s of c.secrets) expect(Object.keys(s).sort()).toEqual(['name', 'present'])
  expect((await page.request.put('/api/integrations/inttra', { data: { mode: 'live' } })).status()).toBe(400)

  // Customs status for a US-bound shipment, and the kill switch.
  const shipments = (await (await page.request.get('/api/shipments')).json()) as { id: string; destination: { country: string } }[]
  const us = shipments.find((s) => s.destination.country === 'United States')!
  expect(us).toBeTruthy()
  const customs = await page.request.get(`/api/integrations/ace/shipments/${us.id}/customs`)
  expect(customs.status()).toBe(200)
  expect(((await customs.json()) as { applicable: boolean }).applicable).toBe(true)

  await ace.getByText('Enabled', { exact: true }).click()
  await expect(page.getByTestId('integration-ace-status')).toHaveText('Off')
  await page.reload()
  await page.getByRole('button', { name: 'Integrations' }).click()
  await expect(page.getByTestId('integration-ace-status')).toHaveText('Off')
  expect((await page.request.get(`/api/integrations/ace/shipments/${us.id}/customs`)).status()).toBe(503)

  await page.getByTestId('integration-ace').getByText('Enabled', { exact: true }).click()
  await expect(page.getByTestId('integration-ace-status')).toHaveText('On · mock')
  expect((await page.request.get(`/api/integrations/ace/shipments/${us.id}/customs`)).status()).toBe(200)

  // Schedules come from the INTTRA connector and are deterministic.
  const sched = (await (
    await page.request.get('/api/integrations/inttra/schedules?origin=CNSHA&destination=NLRTM&ready=2026-09-07T09:00:00.000Z')
  ).json()) as { source: string; schedules: { id: string }[] }
  expect(sched.source).toBe('mock')
  expect(sched.schedules.map((s) => s.id).sort()).toEqual([0, 1, 2, 3, 4].map((i) => `sch-CNSHA-NLRTM-${i}`))
})

test('ops user books a shipment that persists, with comment and approval', async ({ page }) => {
  await login(page, 'ops@tidelane.demo')
  await page.goto('/booking')

  await page.getByRole('button', { name: 'Continue' }).click() // route defaults
  await page.getByRole('button', { name: 'Continue' }).click() // cargo defaults (2x 40DV)
  await expect(page.locator('button', { hasText: /voy \d/ })).toHaveCount(5) // sailings loaded from the INTTRA connector
  await page.locator('button', { hasText: /voy \d/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.getByText('Booking confirmed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View shipment' }).click()
  await expect(page.getByText('Journey')).toBeVisible()

  const ref = await page.locator('h2').first().textContent()
  expect(ref).toMatch(/TL-2026-\d{4}/)

  // Post a comment.
  await page.getByRole('button', { name: /Activity/ }).click()
  await page.getByPlaceholder('Write a message to all parties…').fill('Trucking booked for gate-in.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Trucking booked for gate-in.')).toBeVisible()

  // Reload the whole app: booking and comment must come back from the database.
  await page.reload()
  await expect(page.getByText('Journey')).toBeVisible()
  await expect(page.locator('h2').first()).toContainText(ref!)
  await page.getByRole('button', { name: /Activity/ }).click()
  await expect(page.getByText('Trucking booked for gate-in.')).toBeVisible()

  // Approve a pending document on a seeded shipment and verify it sticks.
  await page.goto('/shipments/s29')
  await expect(page.getByText('Journey')).toBeVisible()
  await page.getByRole('button', { name: /Documents/ }).click()
  const approveButtons = page.getByRole('button', { name: 'Approve' })
  const before = await approveButtons.count()
  expect(before).toBeGreaterThan(0)
  await approveButtons.first().click()
  await expect(approveButtons).toHaveCount(before - 1)
  await page.reload()
  await expect(page.getByText('Journey')).toBeVisible()
  await page.getByRole('button', { name: /Documents/ }).click()
  await expect(approveButtons).toHaveCount(before - 1)
})

test('user guide renders logged out with demo accounts', async ({ page }) => {
  await page.goto('/guide')
  await expect(page.getByText('What is Tidelane?')).toBeVisible()
  await expect(page.getByText('effi@tidelane.demo').first()).toBeVisible()
  await expect(page.getByText('Roles & permissions')).toBeVisible()
})
