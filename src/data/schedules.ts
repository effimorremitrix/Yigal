import type { SailingSchedule } from '../types'
import { CARRIERS, LANES } from './constants'
import { addDays, int, iso, mulberry32, pick } from './random'

// Deterministic per origin/destination pair so the wizard shows stable options.
export function generateSailingSchedules(originCode: string, destCode: string, readyDate: Date): SailingSchedule[] {
  const lane = LANES.find((l) => l.origin === originCode && l.destination === destCode)
  const baseTransit = lane?.transitDays ?? 24
  const seed = [...`${originCode}${destCode}`].reduce((s, ch) => s + ch.charCodeAt(0), 0)
  const rng = mulberry32(seed)

  const schedules: SailingSchedule[] = []
  const usedCarriers = new Set<string>()
  for (let i = 0; i < 5; i++) {
    let carrier = pick(rng, CARRIERS)
    if (usedCarriers.has(carrier.scac) && usedCarriers.size < CARRIERS.length) {
      carrier = CARRIERS.find((c) => !usedCarriers.has(c.scac))!
    }
    usedCarriers.add(carrier.scac)
    const etd = addDays(readyDate, 2 + i * 3 + int(rng, 0, 2))
    const transitDays = baseTransit + int(rng, -3, 4)
    const transshipments = lane?.via ? 1 : rng() < 0.3 ? 1 : 0
    schedules.push({
      id: `sch-${originCode}-${destCode}-${i}`,
      carrier: carrier.name,
      scac: carrier.scac,
      vesselName: pick(rng, carrier.vessels),
      voyage: `${int(rng, 1, 52)}${pick(rng, ['E', 'W'])}`,
      etd: iso(etd),
      eta: iso(addDays(etd, transitDays)),
      transitDays,
      transshipments,
      co2PerTeuTons: Math.round(transitDays * 0.055 * (transshipments ? 1.15 : 1) * 100) / 100,
      costPerTeuUsd: int(rng, 1050, 2650),
    })
  }
  return schedules.sort((a, b) => new Date(a.etd).getTime() - new Date(b.etd).getTime())
}
