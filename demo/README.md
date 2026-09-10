# Demo video pipeline

Produces `demo/out/tidelane-email-to-booking.mp4` — a ~3:15 captioned walkthrough that
takes an inbound email through Deckhand, then shows the same shipment being recorded in
Tidelane. Built for Yigal's handover, not as a sales asset.

Every screenshot in it is a **real capture of the running app**. Nothing is mocked up.

## Regenerating it

```bash
npm install
npm run db:reset:local     # the capture books a shipment; reset keeps the ref stable
npm run demo:capture       # drives the real app  -> demo/shots/*.png
npm run demo:spot          # 10 frames of the timeline, to eyeball before committing 15 min
npm run demo:render        # -> demo/out/tidelane-email-to-booking.mp4
npm run demo:narration     # regenerate narration.md + .srt from the timeline
```

`demo/shots/` and `demo/out/` are gitignored: the screenshots are regenerable and the MP4
is binary. The pipeline is what lives in the repo.

## How it works

Two deterministic stages, no screen recording anywhere.

1. **`capture.spec.ts`** runs under `playwright.demo.config.ts` (its own config, so
   `npm run test:e2e` never picks up the shipment this creates). It signs in as
   `effi.mor@galco-intl.com`, pastes each file from `emails/` into Deckhand, and walks the
   booking wizard, screenshotting at `deviceScaleFactor: 2`. Selectors are the ones
   `e2e/app.spec.ts` already established.

2. **`scene.html`** exposes `window.seek(t)`: given a time in seconds it sets the exact
   visual state for that instant. `scripts/demo/render.mjs` steps `t` from 0 to 195 in
   1/30s increments, screenshots each frame, and encodes with libx264. Because nothing
   animates on its own clock, a re-run reproduces the same file, and retiming a caption is
   a one-line edit in the `SCENES` array.

`SCENES` in `scene.html` is the single source of truth. `narration.md` and `narration.srt`
are generated from it — edit the scene, not them.

## Requirements

An MP4-capable ffmpeg. Playwright's bundled binary is built `--disable-everything` and can
only write VP8/WebM, so `render.mjs` looks for the `imageio-ffmpeg` build instead:

```bash
pip install imageio-ffmpeg
```

## Three things the video must never say

From `CLAUDE.md`, and the reason several captions are worded the way they are:

1. **No booking reaches a carrier.** `submitBooking` is deliberately unrouted. The wizard's
   own fine print says so, and the caption repeats it.
2. **The data is seeded.** A watermark says so in every frame.
3. **Deckhand does not feed the booking.** v0 is stateless; the wizard mints its own
   container and seal numbers. The video is structured in two labelled parts precisely so
   this reads as a boundary rather than an integration.
