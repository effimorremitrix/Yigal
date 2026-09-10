/**
 * ISO 6346 container number validation. Pure, dependency-free, no I/O.
 *
 * A container number is 4 letters + 6 digits + 1 check digit, e.g. CSQU3054383.
 * The 4th letter is the category identifier and is U, J or Z for freight containers.
 *
 * Seal numbers deliberately have no counterpart here: they follow no standard and carry
 * no check digit, so there is nothing to validate. The UI must say so rather than imply
 * a check happened.
 */

/** A=10 through Z=38, skipping every multiple of 11 (11, 22 and 33 are unused). */
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {}
  let v = 10
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    while (v % 11 === 0) v++
    values[ch] = v
    v++
  }
  return values
})()

const SHAPE = /^[A-Z]{4}\d{7}$/
const CATEGORY_IDENTIFIERS = new Set(['U', 'J', 'Z'])

/**
 * Strip the spacing and punctuation people type, and upper-case.
 * Returns null when the result is not the ISO 6346 shape — that is `malformed`,
 * a different thing from a number of the right shape whose check digit is wrong.
 */
export function normalizeContainer(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-_.]/g, '').toUpperCase()
  if (!SHAPE.test(cleaned)) return null
  if (!CATEGORY_IDENTIFIERS.has(cleaned[3])) return null
  return cleaned
}

/**
 * The ISO 6346 check digit for the first 10 characters (4 letters + 6 digits).
 * Each character's value is multiplied by 2^position for position 0..9; the sum
 * modulo 11, then modulo 10, is the check digit (a remainder of 10 becomes 0).
 */
export function containerCheckDigit(first10: string): number {
  const s = first10.toUpperCase()
  if (!/^[A-Z]{4}\d{6}$/.test(s)) throw new Error(`Not a container prefix: ${first10}`)
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const ch = s[i]
    const value = i < 4 ? LETTER_VALUES[ch] : Number(ch)
    sum += value * 2 ** i
  }
  return (sum % 11) % 10
}

export type ContainerStatus = 'valid' | 'invalid' | 'malformed'

/**
 * `malformed` — not the ISO 6346 shape at all.
 * `invalid`   — right shape, wrong check digit. A loud flag, never silently corrected.
 * `valid`     — shape and check digit both agree.
 */
export function validateContainer(raw: string): ContainerStatus {
  const normalized = normalizeContainer(raw)
  if (normalized === null) return 'malformed'
  return containerCheckDigit(normalized.slice(0, 10)) === Number(normalized[10]) ? 'valid' : 'invalid'
}

/** The complete number for a 10-character prefix. Used to build test fixtures. */
export const withCheckDigit = (first10: string): string => `${first10.toUpperCase()}${containerCheckDigit(first10)}`
