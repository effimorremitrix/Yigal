import { HttpError, json, type Env, type SessionUser } from './env'
import type { BusinessModel, BusinessProfile } from '../src/types'

const MODELS: BusinessModel[] = ['trader', 'operator']

// What a deployment falls back to if the row cannot be read. Deliberately the safer of the two:
// 'trader' keeps counterparty isolation ON, so a read failure can never open up who sees whom.
const FALLBACK: BusinessProfile = { model: 'trader', commissionRatePct: 2, updatedAt: '' }

/**
 * Also survives the window where the code is deployed but 0008 has not been applied yet, because
 * Workers Builds deploys on push and migrations are run by hand (CLAUDE.md hard rule 2). Without
 * this, a missing `business_profile` table would throw out of every shipment read and take the
 * whole application down rather than degrading one feature.
 *
 * The catch is narrow on purpose: it falls back, it does not pretend. The trader money fields
 * simply do not appear (deriveEconomics has nothing to work from), the Invoices page and a new
 * booking still fail loudly because they name the new columns, and isolation stays on. Run the
 * migration; this is a cushion for the gap, not a substitute.
 */
export async function readBusinessProfile(env: Env): Promise<BusinessProfile> {
  const row = await env.DB.prepare(
    'SELECT model, commission_rate_pct, updated_at FROM business_profile WHERE id = 1',
  )
    .first<{ model: string; commission_rate_pct: number; updated_at: string }>()
    .catch(() => null)
  if (!row) return FALLBACK
  return {
    model: (MODELS as string[]).includes(row.model) ? (row.model as BusinessModel) : FALLBACK.model,
    commissionRatePct: row.commission_rate_pct,
    updatedAt: row.updated_at,
  }
}

export interface DealEconomics {
  dealValueUsd?: number
  commissionRatePct?: number
  commissionUsd?: number
  producerPayableUsd?: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The one place the trader arithmetic lives, so the shipment view and the invoice ledger cannot
 * disagree about what Yigal earned. Returns nothing in operator mode, and nothing for a shipment
 * that carries no deal value: a missing number reads as missing, never as zero.
 *
 * `producerPayableUsd + commissionUsd === dealValueUsd` always holds, because the payable is
 * subtracted from the same rounded commission rather than rounded separately.
 */
export function deriveEconomics(
  profile: BusinessProfile,
  row: { deal_value_usd?: number | null; commission_rate_pct?: number | null },
): DealEconomics {
  // `== null` on purpose: null is an unpriced shipment, undefined is the column not being there
  // yet on an un-migrated database. Either way there is no price, and NaN must never reach a page.
  if (profile.model !== 'trader' || row.deal_value_usd == null) return {}
  const rate = row.commission_rate_pct ?? profile.commissionRatePct
  const commissionUsd = round2((row.deal_value_usd * rate) / 100)
  return {
    dealValueUsd: row.deal_value_usd,
    commissionRatePct: rate,
    commissionUsd,
    producerPayableUsd: round2(row.deal_value_usd - commissionUsd),
  }
}

export async function getBusinessProfile(env: Env): Promise<Response> {
  return json(await readBusinessProfile(env))
}

export async function putBusinessProfile(
  env: Env,
  user: SessionUser,
  body: { model?: string; commissionRatePct?: number },
): Promise<Response> {
  const current = await readBusinessProfile(env)
  const model = body.model ?? current.model
  if (!(MODELS as string[]).includes(model)) throw new HttpError(400, `Unknown business model: ${model}`)
  const rate = body.commissionRatePct ?? current.commissionRatePct
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new HttpError(400, 'Commission rate must be a number between 0 and 100')
  }
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE business_profile SET model = ?, commission_rate_pct = ?, updated_by = ?, updated_at = ? WHERE id = 1`,
  )
    .bind(model, rate, user.id, now)
    .run()
  return getBusinessProfile(env)
}
