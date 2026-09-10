/**
 * Asserts the data invariants that the two handover blockers were about, against a real
 * database. Run it after a migration and before loading real shipments:
 *
 *     npm run db:check            (local)
 *     npm run db:check:remote     (deployed)
 *
 * Exits non-zero on the first violation so it can gate a data load.
 */
import { execFileSync } from 'node:child_process'

const remote = process.argv.includes('--remote')
const target = remote ? '--remote' : '--local'

function query<T>(sql: string): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'tidelane', target, '--command', sql, '--json'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // wrangler prints banners around the JSON payload; take the array it emits.
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error(`Could not parse wrangler output:\n${out}`)
  return JSON.parse(out.slice(start, end + 1))[0].results as T[]
}

const failures: string[] = []

// Blocker 1: a party without an organization is invisible to the partner it belongs to.
const orphans = query<{ id: string; shipment_id: string; role: string; name: string }>(
  'SELECT id, shipment_id, role, name FROM shipment_parties WHERE org_id IS NULL;',
)
if (orphans.length > 0) {
  failures.push(
    `${orphans.length} shipment_parties row(s) have no org_id; those shipments are invisible to their partner:\n` +
      orphans.map((o) => `    ${o.shipment_id} ${o.role}: "${o.name}"`).join('\n'),
  )
}

// Blocker 2: a duplicate booking reference misattributes QuickBooks invoices.
const dupes = query<{ booking_ref: string; n: number }>(
  'SELECT booking_ref, COUNT(*) AS n FROM shipments GROUP BY booking_ref HAVING n > 1;',
)
if (dupes.length > 0) {
  failures.push(`Duplicate booking references: ${dupes.map((d) => `${d.booking_ref} (x${d.n})`).join(', ')}`)
}

// A party pointing at an organization that no longer exists is the same failure by another route.
const dangling = query<{ n: number }>(
  'SELECT COUNT(*) AS n FROM shipment_parties sp LEFT JOIN organizations o ON o.id = sp.org_id WHERE o.id IS NULL;',
)
if ((dangling[0]?.n ?? 0) > 0) {
  failures.push(`${dangling[0].n} shipment_parties row(s) reference a missing organization`)
}

if (failures.length > 0) {
  console.error(`✗ ${remote ? 'remote' : 'local'} database failed ${failures.length} invariant check(s):\n`)
  for (const f of failures) console.error(`  - ${f}\n`)
  process.exit(1)
}
console.log(`✓ ${remote ? 'remote' : 'local'} database passes all invariant checks`)
