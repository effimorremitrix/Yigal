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
  await page.getByLabel('Email').fill('yigal.tzfira@galco-intl.com')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password')).toBeVisible()
})

test('admin logs in, sees dashboard and all shipments, then logs out', async ({ page }) => {
  await login(page, 'yigal.tzfira@galco-intl.com')
  await expect(page.getByText('Control Tower')).toBeVisible()
  await expect(page.getByTestId('user-menu')).toContainText('Yigal Tzfira')

  await page.goto('/shipments')
  await expect(page.getByText('42 of 42 shipments')).toBeVisible()

  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/shipments')
  await expect(page).toHaveURL(/\/login$/)
})

test('viewer has no write affordances', async ({ page }) => {
  await login(page, 'ben.mor@galco-intl.com')
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

  // Finance data is for internal admin/ops only: no nav entry, and the API refuses a viewer.
  await expect(page.getByRole('link', { name: 'Invoices' })).toHaveCount(0)
  expect((await page.request.get('/api/invoices')).status()).toBe(403)
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

  // A partner ops user never sees invoices, even though the role would allow it internally.
  await expect(page.getByRole('link', { name: 'Invoices' })).toHaveCount(0)
  expect((await page.request.get('/api/invoices')).status()).toBe(403)
  expect((await page.request.post('/api/integrations/quickbooks/invoices/sync')).status()).toBe(403)
  await page.goto('/invoices')
  await expect(page.getByText('Invoices are available to Tidelane operations users')).toBeVisible()
})

test('settings persist across reload', async ({ page }) => {
  await login(page, 'yigal.tzfira@galco-intl.com')
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
  await login(page, 'yigal.tzfira@galco-intl.com')
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

  // The API reports secret presence, source and a hint, never values.
  const list = (await (await page.request.get('/api/integrations')).json()) as { secrets: Record<string, unknown>[] }[]
  expect(list).toHaveLength(3)
  for (const c of list) for (const s of c.secrets) expect(Object.keys(s).sort()).toEqual(['hint', 'name', 'present', 'source', 'updatedAt'])
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

test('admin saves and clears integration credentials from the UI', async ({ page }) => {
  const CLIENT_ID = 'inttra-client-e2e-9876'
  const API_KEY = 'inttra-secret-e2e-5432'

  await login(page, 'yigal.tzfira@galco-intl.com')
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Integrations' }).click()
  const inttra = page.getByTestId('integration-inttra')
  await expect(page.getByTestId('integration-inttra-mode-live')).toBeDisabled()

  await page.getByTestId('integration-inttra-baseurl').fill('https://stage.inttra.example')
  await page.getByTestId('integration-inttra-secret-INTTRA_CLIENT_ID').fill(CLIENT_ID)
  await page.getByTestId('integration-inttra-secret-INTTRA_API_KEY').fill(API_KEY)
  await page.getByTestId('integration-inttra-save-credentials').click()

  // Stored: live becomes selectable and the card shows a hint, never the key.
  await expect(page.getByTestId('integration-inttra-mode-live')).toBeEnabled()
  await expect(inttra).toContainText('Saved ····5432')
  await expect(inttra).not.toContainText(API_KEY)

  // The API never returns a stored value, and the values survive a reload.
  const raw = await (await page.request.get('/api/integrations')).text()
  expect(raw).not.toContain(API_KEY)
  expect(raw).not.toContain(CLIENT_ID)
  const inttraCfg = ((await (await page.request.get('/api/integrations')).json()) as {
    provider: string
    baseUrl: string
    baseUrlSource: string
    liveAvailable: boolean
    secrets: { name: string; present: boolean; source: string; hint: string }[]
  }[]).find((c) => c.provider === 'inttra')!
  expect(inttraCfg.liveAvailable).toBe(true)
  expect(inttraCfg.baseUrl).toBe('https://stage.inttra.example')
  expect(inttraCfg.baseUrlSource).toBe('db')
  expect(inttraCfg.secrets.every((s) => s.present && s.source === 'db')).toBe(true)
  expect(inttraCfg.secrets.map((s) => s.hint)).toEqual(['9876', '5432'])

  // Bad input is rejected without touching what is stored.
  expect((await page.request.put('/api/integrations/inttra/credentials', { data: { baseUrl: 'ftp://nope.example' } })).status()).toBe(400)
  expect((await page.request.put('/api/integrations/inttra/credentials', { data: { secrets: { ACE_API_KEY: 'x' } } })).status()).toBe(400)

  // Clearing one key degrades the provider back to mock-only.
  await page.reload()
  await page.getByRole('button', { name: 'Integrations' }).click()
  await page.getByTestId('integration-inttra-clear-INTTRA_API_KEY').click()
  await expect(page.getByTestId('integration-inttra-mode-live')).toBeDisabled()
  expect((await page.request.put('/api/integrations/inttra', { data: { mode: 'live' } })).status()).toBe(400)

  // Leave the shared database as the other tests expect it.
  const reset = await page.request.put('/api/integrations/inttra/credentials', {
    data: { baseUrl: null, secrets: { INTTRA_CLIENT_ID: null, INTTRA_API_KEY: null } },
  })
  expect(reset.status()).toBe(200)
  expect(((await reset.json()) as { secrets: { present: boolean }[] }).secrets.some((s) => s.present)).toBe(false)
})

test('admin connects QuickBooks (mock) and internal ops see invoices', async ({ page }) => {
  const CLIENT_ID = 'qb-client-e2e-1111'
  const CLIENT_SECRET = 'qb-secret-e2e-2222'
  const CALLBACK = '/api/integrations/quickbooks/oauth/callback'

  await login(page, 'yigal.tzfira@galco-intl.com')
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Integrations' }).click()
  const qb = page.getByTestId('integration-quickbooks')
  await expect(qb).toBeVisible()
  await expect(page.getByTestId('integration-quickbooks-connection')).toContainText('Not connected')
  await expect(page.getByTestId('integration-quickbooks-connect')).toBeDisabled()
  await expect(page.getByTestId('integration-quickbooks-mode-live')).toBeDisabled()
  await expect(page.getByTestId('integration-quickbooks-redirect')).toHaveText(`http://localhost:8787${CALLBACK}`)

  // The OAuth flow cannot start before the client credentials exist.
  expect((await page.request.post('/api/integrations/quickbooks/oauth/start')).status()).toBe(400)

  await page.getByTestId('integration-quickbooks-baseurl').fill('https://sandbox-quickbooks.api.intuit.com')
  await page.getByTestId('integration-quickbooks-secret-QUICKBOOKS_CLIENT_ID').fill(CLIENT_ID)
  await page.getByTestId('integration-quickbooks-secret-QUICKBOOKS_CLIENT_SECRET').fill(CLIENT_SECRET)
  await page.getByTestId('integration-quickbooks-save-credentials').click()
  await expect(page.getByTestId('integration-quickbooks-connect')).toBeEnabled()
  await expect(page.getByTestId('integration-quickbooks-mode-live')).toBeDisabled() // realm id + refresh token still missing
  await expect(qb).not.toContainText(CLIENT_SECRET)

  // Start builds Intuit's authorize URL with a single-use state; the secret never leaves the worker.
  const start = await page.request.post('/api/integrations/quickbooks/oauth/start')
  expect(start.status()).toBe(200)
  expect(await start.text()).not.toContain(CLIENT_SECRET)
  const { url } = (await start.json()) as { url: string; redirectUri: string }
  expect(url.startsWith('https://appcenter.intuit.com/connect/oauth2?')).toBe(true)
  const authorize = new URL(url)
  expect(authorize.searchParams.get('client_id')).toBe(CLIENT_ID)
  expect(authorize.searchParams.get('redirect_uri')).toBe(`http://localhost:8787${CALLBACK}`)
  expect(authorize.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting')
  const state = authorize.searchParams.get('state')!
  expect(state.length).toBeGreaterThan(20)

  // Callback: wrong state is refused without consuming the pending flow; cancel consumes it; replay fails.
  const wrong = await page.request.get(`${CALLBACK}?code=x&state=wrong&realmId=1`, { maxRedirects: 0 })
  expect(wrong.status()).toBe(302)
  expect(wrong.headers()['location']).toContain('quickbooks=error&reason=invalid_state')
  const cancelled = await page.request.get(`${CALLBACK}?error=access_denied&state=${state}`, { maxRedirects: 0 })
  expect(cancelled.headers()['location']).toContain('quickbooks=error&reason=access_denied')
  const replay = await page.request.get(`${CALLBACK}?code=x&state=${state}&realmId=1`, { maxRedirects: 0 })
  expect(replay.headers()['location']).toContain('reason=invalid_state')

  // The redirect target opens the Integrations tab directly and shows the outcome.
  await page.goto('/settings?tab=integrations&quickbooks=error&reason=access_denied')
  await expect(page.getByTestId('integration-quickbooks-flash')).toContainText('consent screen')
  await expect(page.getByTestId('integration-quickbooks')).toBeVisible()

  // Pull in mock mode: one invoice per shipment, persisted, linked back to shipments.
  const sync = await page.request.post('/api/integrations/quickbooks/invoices/sync')
  expect(sync.status()).toBe(200)
  const summary = (await sync.json()) as { ok: boolean; mode: string; count: number }
  expect(summary.ok).toBe(true)
  expect(summary.mode).toBe('mock')
  const shipments = (await (await page.request.get('/api/shipments')).json()) as { id: string }[]
  expect(summary.count).toBe(shipments.length)

  const ledger = (await (await page.request.get('/api/invoices')).json()) as {
    source: string
    lastSync: { ok: boolean; mode: string; count: number }
    invoices: { status: string; balance: number; shipmentId: string | null }[]
  }
  expect(ledger.source).toBe('mock')
  expect(ledger.lastSync.ok).toBe(true)
  expect(ledger.invoices).toHaveLength(shipments.length)
  expect(ledger.invoices.every((i) => i.shipmentId)).toBe(true)
  const paid = ledger.invoices.filter((i) => i.status === 'paid').length
  expect(paid).toBeGreaterThan(0)
  expect(paid).toBeLessThan(ledger.invoices.length)
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  const receivable = ledger.invoices.filter((i) => i.status === 'open' || i.status === 'overdue').reduce((n, i) => n + i.balance, 0)

  await page.goto('/invoices')
  await expect(page.getByTestId('invoices-last-sync')).toContainText(`${shipments.length} invoices · mock`)
  await expect(page.getByTestId('invoices-kpi-count')).toHaveText(String(shipments.length))
  await expect(page.getByTestId('invoices-kpi-paid')).toHaveText(String(paid))
  await expect(page.getByTestId('invoices-kpi-open')).toHaveText(money(receivable))
  await expect(page.getByTestId('invoice-row')).toHaveCount(shipments.length)
  await expect(page.locator('a[href="/shipments/s5"]')).toHaveCount(1)

  // Kill switch: a disabled connector refuses to pull.
  expect((await page.request.put('/api/integrations/quickbooks', { data: { enabled: false } })).status()).toBe(200)
  expect((await page.request.post('/api/integrations/quickbooks/invoices/sync')).status()).toBe(503)
  expect((await page.request.put('/api/integrations/quickbooks', { data: { enabled: true } })).status()).toBe(200)

  // Internal ops users get the same view; the pull button re-runs an idempotent upsert.
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await login(page, 'effi.mor@galco-intl.com')
  await expect(page.getByRole('link', { name: 'Invoices' })).toBeVisible()
  await page.goto('/invoices')
  await page.getByTestId('invoices-sync').click()
  await expect(page.getByTestId('invoices-last-sync')).toContainText(`${shipments.length} invoices · mock`)
  await expect(page.getByTestId('invoice-row')).toHaveCount(shipments.length)

  // Leave the shared database as the other tests expect it (invoice rows are harmless; credentials are not).
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await login(page, 'yigal.tzfira@galco-intl.com')
  const reset = await page.request.put('/api/integrations/quickbooks/credentials', {
    data: { baseUrl: null, secrets: { QUICKBOOKS_CLIENT_ID: null, QUICKBOOKS_CLIENT_SECRET: null, QUICKBOOKS_REALM_ID: null, QUICKBOOKS_REFRESH_TOKEN: null } },
  })
  expect(reset.status()).toBe(200)
  expect(((await reset.json()) as { secrets: { present: boolean }[] }).secrets.some((s) => s.present)).toBe(false)
})

test('ops user books a shipment that persists, with comment and approval', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
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

// A valid payload for POST /api/shipments, built in the browser so the session cookie rides along.
const BOOKING_SCRIPT = `(async (n) => {
  const day = 86400000
  const payload = {
    originCode: 'CNSHA',
    destinationCode: 'NLRTM',
    incoterm: 'FOB',
    commodity: 'Auto parts',
    weightKg: 12000,
    containers: { '40HC': 2 },
    schedule: {
      carrier: 'Meridian Line',
      scac: 'MERL',
      vesselName: 'Meridian Aurora',
      voyage: '12E',
      etd: new Date(Date.now() + 7 * day).toISOString(),
      eta: new Date(Date.now() + 41 * day).toISOString(),
      transitDays: 34,
      co2PerTeuTons: 1.2,
      costPerTeuUsd: 1400,
    },
  }
  const post = (body) =>
    fetch('/api/shipments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json() }))
  return Promise.all(Array.from({ length: n }, () => post(payload)))
})`

test('concurrent bookings get distinct references and none fail', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  // The wizard books one at a time, so the read-then-write race on TL-2026-#### only opens
  // when several bookings land together — which is exactly what a bulk data load does.
  const results = await page.evaluate(`${BOOKING_SCRIPT}(6)`) as { status: number; body: { bookingRef?: string; error?: string } }[]

  expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])
  const refs = results.map((r) => r.body.bookingRef)
  expect(refs.every((r) => typeof r === 'string' && /^TL-2026-\d{4}$/.test(r))).toBe(true)
  expect(new Set(refs).size).toBe(refs.length) // no reference handed out twice
})

test('the booking endpoint rejects invalid payloads at the boundary', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  const reject = (patch: Record<string, unknown>) =>
    page.evaluate(async (p) => {
      const day = 86400000
      const base = {
        originCode: 'CNSHA',
        destinationCode: 'NLRTM',
        incoterm: 'FOB',
        commodity: 'Auto parts',
        weightKg: 12000,
        containers: { '40HC': 2 },
        schedule: {
          carrier: 'Meridian Line',
          scac: 'MERL',
          vesselName: 'Meridian Aurora',
          voyage: '12E',
          etd: new Date(Date.now() + 7 * day).toISOString(),
          eta: new Date(Date.now() + 41 * day).toISOString(),
          transitDays: 34,
          co2PerTeuTons: 1.2,
          costPerTeuUsd: 1400,
        },
      }
      const r = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...base, ...p }),
      })
      return { status: r.status, error: ((await r.json()) as { error?: string }).error ?? '' }
    }, patch)

  expect((await reject({ incoterm: 'XXX' })).status).toBe(400)
  expect((await reject({ commodity: '' })).status).toBe(400)
  expect((await reject({ weightKg: -5 })).status).toBe(400)
  expect((await reject({ containers: { NOPE: 1 } })).status).toBe(400)
  expect((await reject({ containers: { '40HC': 999 } })).status).toBe(400)

  const badDates = await reject({
    schedule: {
      carrier: 'Meridian Line',
      scac: 'MERL',
      vesselName: 'V',
      voyage: '1',
      etd: 'not-a-date',
      eta: 'nope',
      transitDays: 34,
      co2PerTeuTons: 1,
      costPerTeuUsd: 1,
    },
  })
  expect(badDates.status).toBe(400)
  expect(badDates.error).toMatch(/ETD|ETA/)

  // The happy path still works after all that.
  const ok = await reject({})
  expect(ok.status).toBe(200)
})

test('every shipment party resolves to an organization', async ({ page }) => {
  await login(page, 'yigal.tzfira@galco-intl.com')
  // The symptom of an unresolved party is invisibility, so check it from the partner's side:
  // a shipment Atlas Polymers is a party to must be reachable by an Atlas Polymers user.
  const shipments = (await page.evaluate(`fetch('/api/shipments').then((r) => r.json())`)) as {
    id: string
    parties: { role: string; name: string }[]
  }[]
  const atlas = shipments.find((s) => s.parties.some((p) => p.name === 'Atlas Polymers Ltd'))
  expect(atlas).toBeTruthy()

  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await login(page, 'dana@atlaspolymers.demo')
  await page.goto(`/shipments/${atlas!.id}`)
  await expect(page.getByText('Shipment not found')).toHaveCount(0)
  await expect(page.getByText('Journey')).toBeVisible()
})

// Yigal trades as a principal: the producer he buys from and the importer he sells to are both
// parties to one shipment, and each learning the other's name is how he gets cut out of his own
// deal. The API, not the UI, is what has to withhold it.
test('a partner never learns the other commercial counterparties on a shipment', async ({ page }) => {
  type P = { role: string; name: string; contact: string }
  type S = { id: string; parties: P[]; comments: { author: string }[]; documents: { uploadedBy: string }[] }
  const fetchShipments = async (): Promise<S[]> =>
    (await page.evaluate(`fetch('/api/shipments').then((r) => r.json())`)) as S[]

  // Internal sees the whole party list, so the demo data really does put both sides on one shipment.
  await login(page, 'yigal.tzfira@galco-intl.com')
  const asInternal = await fetchShipments()
  const both = asInternal.find(
    (s) => s.parties.some((p) => p.name === 'Atlas Polymers Ltd') && s.parties.some((p) => p.role === 'consignee'),
  )
  expect(both).toBeTruthy()
  const consigneeName = both!.parties.find((p) => p.role === 'consignee')!.name
  const consigneeContact = asInternal.flatMap((s) => s.parties).find((p) => p.name === consigneeName)!.contact

  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()

  // The shipper on the same shipment gets itself and the service providers, and nobody else.
  await login(page, 'dana@atlaspolymers.demo')
  const asPartner = await fetchShipments()
  expect(asPartner.length).toBeGreaterThan(0)
  const mine = asPartner.find((s) => s.id === both!.id)
  expect(mine).toBeTruthy()
  expect(mine!.parties.some((p) => p.name === 'Atlas Polymers Ltd')).toBe(true)
  expect(mine!.parties.some((p) => p.role === 'forwarder' || p.role === 'carrier')).toBe(true)
  for (const s of asPartner) {
    expect(s.parties.some((p) => p.role === 'consignee')).toBe(false)
    expect(s.parties.some((p) => p.name === consigneeName)).toBe(false)
    // The structured doors next to the party list: comment authors and document uploaders.
    expect(s.comments.some((c) => c.author === consigneeContact)).toBe(false)
    expect(s.documents.some((d) => d.uploadedBy === consigneeContact)).toBe(false)
  }

  // And not through the detail endpoint either.
  const detail = (await page.evaluate(
    `fetch('/api/shipments/${both!.id}').then((r) => r.json())`,
  )) as S
  expect(detail.parties.some((p) => p.role === 'consignee')).toBe(false)
})

// Yigal is paid a commission retained out of the producer's side of one all-in price, so the
// three numbers on a shipment have to reconcile exactly: what the importer is invoiced, what
// Yigal keeps, and what the producer receives. A shipment booked without an agreed price is a
// legitimate case and must read as not set rather than as zero.
test('trader economics reconcile, and the house rate moves the ones that have no rate of their own', async ({ page }) => {
  interface S {
    id: string
    dealValueUsd?: number
    commissionRatePct?: number
    commissionUsd?: number
    producerPayableUsd?: number
  }
  const load = async (): Promise<S[]> => (await page.evaluate(`fetch('/api/shipments').then((r) => r.json())`)) as S[]
  const setRate = (pct: number) =>
    page.evaluate(
      `fetch('/api/business', {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({commissionRatePct:${pct}})}).then((r) => r.status)`,
    )

  await login(page, 'yigal.tzfira@galco-intl.com')

  const business = (await page.evaluate(`fetch('/api/business').then((r) => r.json())`)) as {
    model: string
    commissionRatePct: number
  }
  expect(business.model).toBe('trader')
  expect(business.commissionRatePct).toBe(2)

  const shipments = await load()
  const priced = shipments.filter((s) => s.dealValueUsd !== undefined)
  // The 42 seeded shipments all carry a value; a shipment booked earlier in this suite may not.
  expect(priced.length).toBeGreaterThanOrEqual(42)
  for (const s of priced) {
    expect(s.dealValueUsd).toBeGreaterThan(0)
    expect(s.commissionRatePct).toBe(2)
    expect(s.commissionUsd).toBeCloseTo((s.dealValueUsd as number) * 0.02, 2)
    // The payable and the commission add back to the deal value, to the cent.
    expect((s.producerPayableUsd as number) + (s.commissionUsd as number)).toBeCloseTo(s.dealValueUsd as number, 2)
    // The producer funds the fee, so the importer is never invoiced more than the headline price.
    expect(s.producerPayableUsd).toBeLessThan(s.dealValueUsd as number)
  }
  // An unpriced shipment carries no derived numbers either, rather than a misleading zero.
  for (const s of shipments.filter((x) => x.dealValueUsd === undefined)) {
    expect(s.commissionUsd).toBeUndefined()
    expect(s.producerPayableUsd).toBeUndefined()
  }

  // The house rate moves every shipment that has no rate of its own.
  const probeId = priced[0].id
  const probeValue = priced[0].dealValueUsd as number
  expect(await setRate(3.5)).toBe(200)
  const atNewRate = (await load()).find((s) => s.id === probeId) as S
  expect(atNewRate.commissionRatePct).toBe(3.5)
  expect(atNewRate.commissionUsd).toBeCloseTo(probeValue * 0.035, 2)
  expect((atNewRate.producerPayableUsd as number) + (atNewRate.commissionUsd as number)).toBeCloseTo(probeValue, 2)

  expect(await setRate(2)).toBe(200)
  const restored = (await load()).find((s) => s.id === probeId) as S
  expect(restored.commissionRatePct).toBe(2)

  // A booking that records a price gets the economics; the rate is not asked for at booking time.
  const created = (await page.evaluate(`
    fetch('/api/shipments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        originCode: 'CNSHA', destinationCode: 'NLRTM', incoterm: 'CIF', commodity: 'Auto parts',
        weightKg: 18000, dealValueUsd: 200000, containers: { '40HC': 1 },
        schedule: { carrier: 'Meridian Line', scac: 'MERL', vesselName: 'Meridian Vega', voyage: '7X',
          etd: '2026-10-05T09:00:00.000Z', eta: '2026-11-08T09:00:00.000Z', transitDays: 34,
          co2PerTeuTons: 1.2, costPerTeuUsd: 1400 },
      }),
    }).then((r) => r.json())
  `)) as S
  expect(created.dealValueUsd).toBe(200000)
  expect(created.commissionUsd).toBeCloseTo(4000, 2)
  expect(created.producerPayableUsd).toBeCloseTo(196000, 2)

  // A negative price is refused at the boundary rather than stored.
  const rejected = (await page.evaluate(`
    fetch('/api/shipments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        originCode: 'CNSHA', destinationCode: 'NLRTM', incoterm: 'CIF', commodity: 'Auto parts',
        weightKg: 18000, dealValueUsd: -5, containers: { '40HC': 1 },
        schedule: { carrier: 'Meridian Line', scac: 'MERL', vesselName: 'Meridian Vega', voyage: '7X',
          etd: '2026-10-05T09:00:00.000Z', eta: '2026-11-08T09:00:00.000Z', transitDays: 34,
          co2PerTeuTons: 1.2, costPerTeuUsd: 1400 },
      }),
    }).then((r) => r.status)
  `)) as number
  expect(rejected).toBe(400)
})

// The business model is not a preference: switching it to the freight operator model turns
// counterparty isolation off. So the write has to be closed to everyone but an internal admin,
// and the effect has to be real on both sides of the switch.
test('only an internal admin may switch the business model, and the switch moves isolation', async ({ page }) => {
  type S = { id: string; parties: { role: string }[]; dealValueUsd?: number }
  const put = (body: string) =>
    page.evaluate(
      `fetch('/api/business', {method:'PUT',headers:{'content-type':'application/json'},body:'${body}'}).then((r) => r.status)`,
    )

  // A viewer in the internal org is refused: admin only.
  await login(page, 'ben.mor@galco-intl.com')
  expect(await put('{"model":"operator"}')).toBe(403)
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()

  // A partner ops user is refused too, and never sees the tab.
  await login(page, 'dana@atlaspolymers.demo')
  expect(await put('{"model":"operator"}')).toBe(403)
  await page.goto('/settings')
  // Tabs render as plain buttons, so assert on that and not on a role the component never sets.
  await expect(page.getByRole('button', { name: 'Business model' })).toHaveCount(0)
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()

  // The internal admin switches it from the UI, and is warned what it exposes.
  await login(page, 'yigal.tzfira@galco-intl.com')
  await page.goto('/settings?tab=business')
  await expect(page.getByTestId('isolation-warning')).toHaveCount(0)
  await page.getByTestId('business-model-hint').waitFor()
  expect(await put('{"model":"operator"}')).toBe(200)
  await page.reload()
  await expect(page.getByTestId('isolation-warning')).toBeVisible()
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()

  // Operator mode: the partner sees the whole party list again, and no deal economics.
  await login(page, 'dana@atlaspolymers.demo')
  const asOperator = (await page.evaluate(`fetch('/api/shipments').then((r) => r.json())`)) as S[]
  expect(asOperator.some((s) => s.parties.some((p) => p.role === 'consignee'))).toBe(true)
  for (const s of asOperator) expect(s.dealValueUsd).toBeUndefined()
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()

  // Back to trader, and isolation returns.
  await login(page, 'yigal.tzfira@galco-intl.com')
  expect(await put('{"model":"trader"}')).toBe(200)
  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await login(page, 'dana@atlaspolymers.demo')
  const asTrader = (await page.evaluate(`fetch('/api/shipments').then((r) => r.json())`)) as S[]
  expect(asTrader.some((s) => s.parties.some((p) => p.role === 'consignee'))).toBe(false)
})

test('shipment map marks every port of call and expands one with its ETA', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  // s36 is seeded mid-voyage: Busan → Singapore (transshipment) → Antwerp.
  await page.goto('/shipments/s36')
  await expect(page.getByText('Ports of call')).toBeVisible()

  // One marker per planned call, in sailing order.
  const markers = page.locator('svg[role="img"] g[role="button"]')
  await expect(markers).toHaveCount(3)
  await expect(markers.nth(0)).toHaveAttribute('aria-label', /^Busan — Load port, Departed /)
  await expect(markers.nth(1)).toHaveAttribute('aria-label', /^Singapore — Transshipment, Arrived /)
  await expect(markers.nth(2)).toHaveAttribute('aria-label', /^Antwerp — Discharge port, ETA /)

  // No widget until a port is picked; then it carries that port's details and ETA.
  await expect(page.getByTestId('port-call-widget')).toHaveCount(0)
  await markers.nth(2).click()
  const widget = page.getByTestId('port-call-widget').first()
  await expect(widget).toContainText('BEANR · Belgium · Discharge port')
  await expect(widget).toContainText('Next call')
  await expect(widget).toContainText('Vessel arrived')
  await expect(widget).toContainText('Delivered')

  // The port summaries under the map (the toggles) select the same call.
  await page.locator('button[aria-pressed]').filter({ hasText: 'Busan' }).click()
  await expect(page.getByTestId('port-call-widget').first()).toContainText('KRPUS · South Korea · Load port')

  await page.getByRole('button', { name: 'Close port details' }).first().click()
  await expect(page.getByTestId('port-call-widget')).toHaveCount(0)
})

// A table that shows each container beside its own seal: the only shape that proves a pairing.
const ALIGNED_EMAIL = [
  'Booking Ref: SHPX-99120',
  'Vessel: Meridian Aurora   Voyage: 12E',
  'Port of loading: Shanghai',
  'Port of discharge: Rotterdam',
  '',
  'Container      | Seal',
  'CSQU3054383    | Seal No: SL-44821',
  'TGHU7654320    | Seal No: SL-44822',
].join('\n')

// Two proven pairings, a prose sentence naming one of them a second time, and a loose seal
// list that belongs to no container we can name. The table must carry the two pairings, must
// not turn the repeat into a third row, and must not invent a row for the loose seals.
const MIXED_EMAIL = [
  'Booking Ref: SHPX-99122',
  '',
  'Container      | Seal',
  'CSQU3054383    | Seal No: SL-44821',
  'TGHU7654320    | Seal No: SL-44822',
  '',
  'Please note that CSQU3054383 is the reefer unit on this booking.',
  '',
  'Spare seals: SL-99001, SL-99002',
].join('\n')

// The same identifiers, but as two unrelated lists. Nothing ties a seal to a container.
const UNALIGNED_EMAIL = [
  'Booking Ref: SHPX-99121',
  'Containers: CSQU3054383, TGHU7654320',
  'Seals: SL-44821, SL-44822',
].join('\n')

async function deckhandExtract(page: Page, text: string) {
  await page.goto('/deckhand')
  await page.getByTestId('deckhand-text').fill(text)
  await page.getByTestId('deckhand-extract').click()
  await expect(page.getByTestId('deckhand-block')).toBeVisible()
  return page.getByTestId('deckhand-block').innerText()
}

test('deckhand pairs a container with the seal shown beside it', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  const block = await deckhandExtract(page, ALIGNED_EMAIL)

  expect(block).toContain('SHPX-99120')
  expect(block).toContain('CSQU3054383')
  expect(block).toContain('SL-44821')
  // The pairing must survive into the copyable block, on one line each.
  expect(block).toMatch(/CSQU3054383\s+seal SL-44821/)
  expect(block).toMatch(/TGHU7654320\s+seal SL-44822/)
  await expect(page.getByTestId('deckhand-unpaired')).toHaveCount(0)
})

test('deckhand refuses to pair containers and seals listed separately', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  const block = await deckhandExtract(page, UNALIGNED_EMAIL)

  // This is the failure that matters: a seal on the wrong container. Nothing may be paired.
  expect(block).not.toMatch(/CSQU3054383\s+seal SL-/)
  expect(block).toContain('NOT PAIRED')
  await expect(page.getByTestId('deckhand-unpaired')).toBeVisible()
  await expect(page.getByText(/will not guess which seal belongs/i)).toBeVisible()
})

test('deckhand flags a failed ISO 6346 check digit instead of correcting it', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  // TGHU7654320 is valid; changing the last digit must be reported, never silently repaired.
  const block = await deckhandExtract(page, 'Container TGHU7654321 | Seal No: SL-1')
  expect(block).toContain('TGHU7654321')
  expect(block).toContain('CHECK DIGIT FAILS')
  await expect(page.getByText('check digit fails', { exact: true })).toBeVisible()
})

test('deckhand prints missing fields rather than dropping them', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  const block = await deckhandExtract(page, 'Container CSQU3054383 | Seal No: SL-9')
  for (const label of ['Booking / shipment ref', 'Vessel / voyage', 'Ports (POL → POD)', 'Anything I am unsure of']) {
    expect(block).toContain(label)
  }
  expect(block).toContain('(missing)')
})

test('deckhand table mode emits one row per pairing and no row for an unpaired seal', async ({ page }) => {
  await login(page, 'effi.mor@galco-intl.com')
  await deckhandExtract(page, MIXED_EMAIL)

  // The control is a real radio group, so an arrow key moves between the modes.
  await page.getByRole('radio', { name: 'Block' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Table' })).toBeChecked()

  const table = page.getByTestId('deckhand-output-table')
  await expect(table).toBeVisible()
  // Two pairings, two rows. The prose repeat of CSQU3054383 merges rather than becoming a
  // third row, because a duplicate container line in a portal upload is a real defect.
  await expect(page.getByTestId('deckhand-output-row')).toHaveCount(2)

  const rendered = await table.innerText()
  expect(rendered).toMatch(/CSQU3054383[\s\S]*SL-44821/)
  expect(rendered).toMatch(/TGHU7654320[\s\S]*SL-44822/)
  // The failure that matters: a seal with no container of its own must never get a row.
  expect(rendered).not.toContain('SL-99001')
  expect(rendered).not.toContain('SL-99002')

  // And the screen says so above the table rather than leaving the gap to be discovered later.
  const summary = page.getByTestId('deckhand-output-summary')
  await expect(summary).toContainText('2 unpaired seals left out of this output')
  await expect(summary).toContainText('1 repeat mention merged')
})

test('deckhand is internal-only and writes nothing', async ({ page, request }) => {
  await login(page, 'effi.mor@galco-intl.com')
  const before = await page.evaluate(`fetch('/api/shipments').then((r) => r.json()).then((s) => s.length)`)
  await deckhandExtract(page, ALIGNED_EMAIL)
  const after = await page.evaluate(`fetch('/api/shipments').then((r) => r.json()).then((s) => s.length)`)
  expect(after).toBe(before) // v0 is stateless: an extraction creates nothing

  await page.getByTestId('user-menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await login(page, 'dana@atlaspolymers.demo')
  await expect(page.getByRole('link', { name: 'Deckhand' })).toHaveCount(0)
  const denied = await page.evaluate(
    `fetch('/api/deckhand/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x' }) }).then((r) => r.status)`,
  )
  expect(denied).toBe(403)
  void request
})

test('user guide renders logged out with accounts, workflow and Deckhand', async ({ page }) => {
  await page.goto('/guide')
  await expect(page.getByText('What is Tidelane?')).toBeVisible()
  await expect(page.getByText('yigal.tzfira@galco-intl.com').first()).toBeVisible()
  await expect(page.getByText('Roles & permissions')).toBeVisible()
  await expect(page.getByText('How the work flows')).toBeVisible()
  await expect(page.getByText('Shipment lifecycle')).toBeVisible()
  // Deckhand's own section, not just its row in the module list.
  await expect(page.getByText('Stop retyping shipment and seal numbers out of email')).toBeVisible()
  await expect(page.getByText('Common scenarios')).toBeVisible()
})
