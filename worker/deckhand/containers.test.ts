import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { containerCheckDigit, normalizeContainer, validateContainer, withCheckDigit } from './containers'

// The worked example from ISO 6346 itself.
test('computes the published check digit', () => {
  assert.equal(containerCheckDigit('CSQU305438'), 3)
  assert.equal(withCheckDigit('CSQU305438'), 'CSQU3054383')
})

test('letter values skip every multiple of 11', () => {
  // K=21 then L=23 (22 skipped), U=32 then V=34 (33 skipped). Any drift here changes
  // every check digit, so pin it with prefixes that differ only in those letters.
  assert.notEqual(containerCheckDigit('KKKU000000'), containerCheckDigit('LLLU000000'))
  assert.notEqual(containerCheckDigit('UUUU000000'), containerCheckDigit('VVVU000000'))
})

test('accepts the freight category identifiers and rejects the rest', () => {
  for (const cat of ['U', 'J', 'Z']) {
    const number = withCheckDigit(`ABC${cat}123456`)
    assert.equal(validateContainer(number), 'valid', `${number} should be valid`)
  }
  assert.equal(validateContainer('ABCD1234561'), 'malformed', 'D is not a category identifier')
})

test('normalizes the spacing and punctuation people actually type', () => {
  const canonical = withCheckDigit('MSKU123456')
  const written = `${canonical.slice(0, 4)} ${canonical.slice(4, 10)} ${canonical.slice(10)}`
  assert.equal(normalizeContainer(written), canonical)
  assert.equal(normalizeContainer(`msku-123456-${canonical[10]}`), canonical)
  assert.equal(normalizeContainer(`  ${canonical}  `), canonical)
})

test('a wrong check digit is invalid, not malformed and not corrected', () => {
  const valid = withCheckDigit('TGHU765432')
  const wrongDigit = String((Number(valid[10]) + 1) % 10)
  const broken = valid.slice(0, 10) + wrongDigit
  assert.equal(validateContainer(valid), 'valid')
  assert.equal(validateContainer(broken), 'invalid')
  // normalize must hand back exactly what was typed, never the repaired number
  assert.equal(normalizeContainer(broken), broken)
})

test('anything that is not the ISO 6346 shape is malformed', () => {
  for (const raw of ['', 'MSKU12345', 'MSKU12345678', '1234567890X', 'M5KU1234567', 'MSKU123456A', 'SEAL-99871', 'MSKUABCDEFG']) {
    assert.equal(validateContainer(raw), 'malformed', `${raw || '(empty)'} should be malformed`)
  }
  // Internal spacing is normalized away, so this is a real number with a bad check digit,
  // not a malformed one — the distinction the UI depends on.
  assert.equal(validateContainer('MSK U1234567'), 'invalid')
})

test('every check digit is a single digit', () => {
  // The (mod 11) mod 10 step exists so a remainder of 10 becomes 0; make sure it fires.
  const seen = new Set<number>()
  for (let i = 0; i < 500; i++) {
    const d = containerCheckDigit(`MSKU${String(i).padStart(6, '0')}`)
    assert.ok(d >= 0 && d <= 9, `check digit ${d} out of range`)
    seen.add(d)
  }
  assert.ok(seen.has(0), 'a remainder of 10 should fold to 0')
})

test('rejects a prefix that is not 4 letters and 6 digits', () => {
  assert.throws(() => containerCheckDigit('MSKU12345'), /Not a container prefix/)
  assert.throws(() => containerCheckDigit('MSK123456X'), /Not a container prefix/)
})
