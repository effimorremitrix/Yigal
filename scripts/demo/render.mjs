// Render a deterministic seek(t) HTML timeline to an MP4.
//
//   node scripts/demo/render.mjs <scene.html> <out.mp4> [durationSec=195] [fps=30]
//
// The scene must expose window.seek(t), setting the exact visual state for time t in
// seconds. Frames are captured one at a time rather than recorded in real time, so the
// output is deterministic: a re-run reproduces the same file byte for byte, and retiming
// a caption is a one-line edit followed by a re-render.
//
// Requires a full ffmpeg (libx264 + the mp4 muxer). Playwright's bundled binary is built
// --disable-everything and can only write VP8/WebM, so this locates the imageio-ffmpeg
// build instead: `pip install imageio-ffmpeg`.
//
// There is deliberately no audio track. Do not add -shortest here: with no second input
// it does nothing, and with one it would silently truncate the video to the audio length.

import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

const [sceneArg, outArg, durArg, fpsArg] = process.argv.slice(2)
if (!sceneArg || !outArg) {
  console.error('usage: node scripts/demo/render.mjs <scene.html> <out.mp4> [durationSec=195] [fps=30]')
  process.exit(1)
}

const DUR = Number(durArg || 195)
const FPS = Number(fpsArg || 30)
const scenePath = resolve(sceneArg)
const outPath = resolve(outArg)
const framesDir = resolve(dirname(outPath), `.frames-${process.pid}`)

function findFfmpeg() {
  try {
    return execSync('python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"', {
      encoding: 'utf8',
    }).trim()
  } catch {
    console.error('No MP4-capable ffmpeg found. Run: pip install imageio-ffmpeg')
    process.exit(1)
  }
}

const ffmpeg = findFfmpeg() // fail before spending minutes on frames
const { chromium } = createRequire(import.meta.url)('playwright')

mkdirSync(framesDir, { recursive: true })
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('file://' + scenePath)
// The scene embeds ~20 PNGs; a frame captured before they decode renders blank.
await page.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => {}))))

const total = Math.round(FPS * DUR)
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS)
  await page.screenshot({ path: `${framesDir}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
  if (f % 300 === 0) console.log(`frame ${f}/${total}`)
}
await browser.close()

execFileSync(
  ffmpeg,
  [
    '-y',
    '-framerate', String(FPS),
    '-i', `${framesDir}/%05d.jpg`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath,
  ],
  { stdio: 'inherit' },
)

rmSync(framesDir, { recursive: true, force: true })
console.log('wrote ' + outPath)
