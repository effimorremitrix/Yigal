import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Captures the screens the demo video is built from, by driving the real app.
 *
 * Not a test: nothing here asserts product behaviour that e2e/app.spec.ts does not already
 * assert. The expects are waits — a screenshot taken before the page settles is the one
 * failure mode that is invisible until the video is rendered.
 *
 * Run against a freshly reset database (`npm run db:reset:local`) so the booking this
 * creates always lands on the same TL-2026-#### reference.
 */

const PASSWORD = 'tidelane-demo'
const SHOTS = 'demo/shots'

const email = (name: string) => readFileSync(resolve('demo/emails', name), 'utf8')

// Same helper as e2e/app.spec.ts:5 — kept identical so a login change breaks both together.
async function login(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('user-menu')).toBeVisible()
}

/** The Card wrapper around a given CardHeader title. Card roots are the only div.rounded-xl. */
const card = (page: Page, title: string): Locator =>
  page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).first()

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const crop = (target: Locator, name: string) => target.screenshot({ path: `${SHOTS}/${name}.png` })

/** Paste an email into Deckhand and wait for the block. Reloads first so each run starts clean. */
async function extract(page: Page, text: string) {
  await page.goto('/deckhand')
  await page.getByTestId('deckhand-text').fill(text)
  await page.getByTestId('deckhand-extract').click()
  await expect(page.getByTestId('deckhand-block')).toBeVisible()
}

test('capture the email-to-booking walkthrough', async ({ page }) => {
  // --- Scene 0/1: the way in -------------------------------------------------------
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await shot(page, '01-login')

  await login(page, 'effi.mor@galco-intl.com')
  await page.goto('/')
  await expect(page.getByText('Control Tower')).toBeVisible()
  await shot(page, '02-control-tower')

  // --- Scene 2: paste ---------------------------------------------------------------
  await page.goto('/deckhand')
  await expect(page.getByTestId('deckhand-text')).toBeVisible()
  await shot(page, '03-deckhand-empty')

  await page.getByTestId('deckhand-text').fill(email('01-aligned.txt'))
  await shot(page, '04-deckhand-pasted')

  // --- Scene 3: the block -----------------------------------------------------------
  await page.getByTestId('deckhand-extract').click()
  await expect(page.getByTestId('deckhand-block')).toBeVisible()
  await shot(page, '05-deckhand-result')
  await crop(page.getByTestId('deckhand-block'), '06-block')
  await crop(card(page, 'Containers and seals'), '07-pairs')
  await crop(card(page, 'Fields'), '08-fields')

  // --- Scene 4: the two things it refuses to do -------------------------------------
  await extract(page, email('02-unaligned.txt'))
  await expect(page.getByTestId('deckhand-unpaired')).toBeVisible()
  await shot(page, '09-unaligned-result')
  await crop(page.getByTestId('deckhand-unpaired'), '09b-unpaired')
  await crop(page.getByTestId('deckhand-block'), '09c-block-not-paired')

  await extract(page, email('03-bad-check-digit.txt'))
  await expect(page.getByText('check digit fails', { exact: true })).toBeVisible()
  await shot(page, '10-checkdigit-result')
  await crop(card(page, 'Containers and seals'), '10b-checkdigit')
  await crop(page.getByTestId('deckhand-block'), '10c-block-checkdigit')

  // --- Scene 6: the same shipment, recorded in Tidelane ------------------------------
  await page.goto('/booking')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  await shot(page, '11-booking-route')

  await page.getByRole('button', { name: 'Continue' }).click()
  await shot(page, '12-booking-cargo')

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('button', { hasText: /voy \d/ })).toHaveCount(5)
  await shot(page, '13-booking-schedule')

  await page.locator('button', { hasText: /voy \d/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeVisible()
  await shot(page, '14-booking-review')

  // --- Scene 7: confirmed, and the seals are on the record --------------------------
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.getByText('Booking confirmed', { exact: true })).toBeVisible()
  await shot(page, '15-booking-confirmed')

  await page.getByRole('button', { name: 'View shipment' }).click()
  await expect(page.getByText('Journey')).toBeVisible()
  const ref = await page.locator('h2').first().textContent()
  expect(ref).toMatch(/TL-2026-\d{4}/)
  await shot(page, '16-shipment-detail')

  // The containers table is the only place a seal number surfaces in the UI.
  await crop(page.locator('div.rounded-xl').filter({ has: page.locator('table') }).first(), '17-containers')
  await crop(card(page, 'Journey'), '18-journey')

  console.log(`captured booking ${ref}`)
})
