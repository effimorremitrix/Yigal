// Deterministic PRNG so the demo data is identical on every load.
export function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

export const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1))

// Fixed "today" anchor keeps the dashboard looking live and screenshots stable.
export const TODAY = new Date('2026-08-31T09:00:00Z')

export const addDays = (base: Date, days: number): Date =>
  new Date(base.getTime() + days * 86400000)

export const iso = (d: Date): string => d.toISOString()

export function fmtDate(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateShort(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
