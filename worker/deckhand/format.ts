import type { Extraction, Field } from './types'

/**
 * The paste-ready block, in the shape the brief specifies. Built on the server so the page,
 * the clipboard and anything else that ever consumes it cannot drift apart.
 *
 * Every field is printed even when it is missing, and every uncertainty is printed at the
 * bottom rather than being quietly folded into the values above.
 */

const LABELS = {
  bookingRef: 'Booking / shipment ref',
  containers: 'Container numbers',
  seals: 'Seal numbers',
  vessel: 'Vessel / voyage',
  ports: 'Ports (POL → POD)',
  unsure: 'Anything I am unsure of',
} as const

const WIDTH = Math.max(...Object.values(LABELS).map((l) => l.length))
const row = (label: string, value: string): string => `${label.padEnd(WIDTH)} : ${value}`
const shown = (f: Field): string => f.value ?? '(missing)'

export function formatBlock(x: Extraction): string {
  const lines: string[] = []
  lines.push(row(LABELS.bookingRef, shown(x.bookingRef)))

  // Containers and seals are printed as aligned columns so the eye can check the pairing.
  if (x.pairs.length > 0) {
    const width = Math.max(...x.pairs.map((p) => (p.container.normalized ?? p.container.raw).length))
    x.pairs.forEach((p, i) => {
      const number = p.container.normalized ?? p.container.raw
      const flag = p.container.status === 'valid' ? '' : p.container.status === 'invalid' ? '  <-- CHECK DIGIT FAILS' : '  <-- NOT A CONTAINER NUMBER FORMAT'
      const seal = p.seal ? `seal ${p.seal.raw}` : 'seal (missing)'
      lines.push(row(i === 0 ? LABELS.containers : '', `${number.padEnd(width)}  ${seal}${flag}`))
    })
  } else {
    lines.push(row(LABELS.containers, x.unpaired.containers.length > 0 ? '(none paired — see below)' : '(missing)'))
  }

  if (x.unpaired.containers.length > 0 || x.unpaired.seals.length > 0) {
    lines.push('')
    lines.push('NOT PAIRED — the source did not show these next to each other:')
    for (const c of x.unpaired.containers) lines.push(`  container ${c.normalized ?? c.raw}${c.status === 'valid' ? '' : `  <-- ${c.status.toUpperCase()}`}`)
    for (const s of x.unpaired.seals) lines.push(`  seal      ${s.raw}`)
    lines.push('')
  }

  const vesselVoyage = x.vessel.value || x.voyage.value ? `${shown(x.vessel)} / ${shown(x.voyage)}` : '(missing)'
  lines.push(row(LABELS.vessel, vesselVoyage))
  lines.push(row(LABELS.ports, `${shown(x.portOfLoading)} → ${shown(x.portOfDischarge)}`))

  const unsure = [
    ...([
      ['booking ref', x.bookingRef],
      ['vessel', x.vessel],
      ['voyage', x.voyage],
      ['port of loading', x.portOfLoading],
      ['port of discharge', x.portOfDischarge],
    ] as const)
      .filter(([, f]) => f.value === null || f.confidence !== 'high')
      .map(([name, f]) => (f.value === null ? `${name}: not found` : `${name}: read as "${f.value}" but not certain`)),
    ...x.warnings,
  ]
  lines.push(row(LABELS.unsure, unsure.length === 0 ? 'nothing' : unsure[0]))
  for (const line of unsure.slice(1)) lines.push(row('', line))

  return lines.join('\n')
}
