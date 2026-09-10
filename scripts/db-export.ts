/**
 * Dumps a D1 database to a single self-contained .sql file: schema, then data.
 *
 *     npm run db:export            (local)
 *     npm run db:export:remote     (deployed)
 *
 * The file restores into an *empty* database and reproduces the original exactly,
 * including d1_migrations, so wrangler still knows which migrations are applied:
 *
 *     npx wrangler d1 create tidelane-restore
 *     npx wrangler d1 execute tidelane-restore --remote --file=backups/<file>.sql
 *
 * Restore into a NEW database and check it before pointing wrangler.jsonc at it.
 * Never restore over a live database you have not exported first.
 *
 * There was no backup routine before this. Run it before any bulk data load and
 * before any migration.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const DB = 'tidelane'
const OUT_DIR = 'backups'
// Enough rows per INSERT to keep the file small, few enough to stay readable and
// to keep any single statement well inside D1's limits.
const ROWS_PER_INSERT = 50

const remote = process.argv.includes('--remote')
const target = remote ? '--remote' : '--local'

// Same reasoning as scripts/check-invariants.ts: run wrangler's own entry point under this
// node binary, so there is no npx shim and no shell anywhere in the path (node refuses to
// spawn .cmd without a shell, which breaks bare "npx" on Windows).
const WRANGLER = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js')

type Row = Record<string, unknown>

function query(sql: string): Row[] {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, target, '--command', sql, '--json'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error(`Could not parse wrangler output:\n${out}`)
  return JSON.parse(out.slice(start, end + 1))[0].results as Row[]
}

/** A SQLite literal. Strings double their single quotes; everything else is a bare token. */
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`

// sqlite_% and _cf_% are SQLite's and D1's own bookkeeping; they are recreated by the
// engine, not by us. d1_migrations is ours and is deliberately included.
const OBJECTS = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
  ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name;`

const objects = query(OBJECTS) as { type: string; name: string; tbl_name: string; sql: string }[]
const tables = objects.filter((o) => o.type === 'table')

const lines: string[] = [
  `-- ${DB} (${remote ? 'remote' : 'local'}) exported ${new Date().toISOString()}`,
  '-- Self-contained: schema then data. Restore into an EMPTY database:',
  `--   npx wrangler d1 execute <new-db> ${target} --file=<this file>`,
  '',
  'PRAGMA defer_foreign_keys = TRUE;',
  '',
]

for (const o of objects) {
  lines.push(`${o.sql};`)
}
lines.push('')

let totalRows = 0
for (const table of tables) {
  const rows = query(`SELECT * FROM ${ident(table.name)};`)
  totalRows += rows.length
  process.stdout.write(`  ${table.name.padEnd(24)} ${String(rows.length).padStart(6)} rows\n`)
  if (rows.length === 0) continue

  const columns = Object.keys(rows[0])
  const columnList = columns.map(ident).join(', ')
  lines.push(`-- ${table.name}: ${rows.length} rows`)
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT)
    const values = chunk.map((r) => `  (${columns.map((c) => literal(r[c])).join(', ')})`).join(',\n')
    lines.push(`INSERT INTO ${ident(table.name)} (${columnList}) VALUES\n${values};`)
  }
  lines.push('')
}

mkdirSync(OUT_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(OUT_DIR, `${DB}-${remote ? 'remote' : 'local'}-${stamp}.sql`)
writeFileSync(file, lines.join('\n'), 'utf-8')

console.log(`\n✓ ${tables.length} tables, ${totalRows} rows → ${file}`)
if (remote) console.log('  Keep this off the machine it came from. It contains every user row and every shipment.')
