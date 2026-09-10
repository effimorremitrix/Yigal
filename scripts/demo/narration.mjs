// Generate demo/narration.md and demo/narration.srt from the scene timeline, so the
// written script and the rendered captions cannot drift apart.
//
//   node scripts/demo/narration.mjs

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const page = await browser.newPage()
await page.goto('file://' + resolve('demo/scene.html'))
const { scenes, duration } = await page.evaluate(() => ({ scenes: window.__scenes, duration: window.__duration }))
await browser.close()

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const srtTime = (s) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:` +
  `${String(Math.floor(s % 60)).padStart(2, '0')},${String(Math.round((s % 1) * 1000)).padStart(3, '0')}`

const textOf = (s) => (s.card ? `${s.card.h}. ${s.card.p}` : s.line)
const visualOf = (s) =>
  s.card ? 'Full-frame card' : s.email ? 'The inbound email' : `Screenshot: ${s.shot ?? s.crop}`

const md = [
  '# Tidelane demo video — narration script',
  '',
  '**Generated from `demo/scene.html` by `scripts/demo/narration.mjs`. Do not edit by hand;**',
  'edit the `SCENES` array in the scene and re-run `npm run demo:narration`.',
  '',
  `Total ${mmss(duration)} at 30fps. 1440x900, no audio track: the captions carry the script,`,
  'and the .srt beside this file lets a voiceover be recorded against the same timings later.',
  '',
  'Two rules govern every line, both from `CLAUDE.md`: nothing may imply a mock connector is',
  'live or that the seeded data is real, and the video says out loud that Deckhand and the',
  'Tidelane record are separate today rather than letting the cut imply otherwise.',
  '',
  '| # | In | Out | On screen | Caption |',
  '|---|---|---|---|---|',
  ...scenes.map((s, i) => `| ${i + 1} | ${mmss(s.t[0])} | ${mmss(s.t[1])} | ${visualOf(s)} | ${textOf(s)} |`),
  '',
].join('\n')

const srt = scenes
  .map((s, i) => `${i + 1}\n${srtTime(s.t[0])} --> ${srtTime(s.t[1])}\n${textOf(s)}\n`)
  .join('\n')

writeFileSync('demo/narration.md', md)
writeFileSync('demo/narration.srt', srt)
console.log(`wrote demo/narration.md and demo/narration.srt (${scenes.length} cues, ${mmss(duration)})`)
