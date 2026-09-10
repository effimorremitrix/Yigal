// Screenshot a seek(t) scene at a handful of times, so a misaligned caption is caught in
// seconds instead of after a full render.
//
//   node scripts/demo/spot-check.mjs demo/scene.html demo/out/spots [t1 t2 ...]

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const [sceneArg, outArg, ...times] = process.argv.slice(2)
const DEFAULT_TIMES = [4, 11, 24, 40, 62, 90, 130, 160, 175, 182]
const spots = times.length ? times.map(Number) : DEFAULT_TIMES

const { chromium } = createRequire(import.meta.url)('playwright')
const outDir = resolve(outArg || 'demo/out/spots')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('file://' + resolve(sceneArg))
await page.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => {}))))

for (const t of spots) {
  await page.evaluate((s) => window.seek(s), t)
  await page.screenshot({ path: `${outDir}/t${String(t).padStart(3, '0')}.png` })
}
await browser.close()
console.log(`wrote ${spots.length} spots to ${outDir}`)
