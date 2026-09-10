import { defineConfig } from '@playwright/test'

// Separate from playwright.config.ts on purpose: the capture run creates a real shipment,
// and `npm run test:e2e` asserts seeded counts ("42 of 42 shipments"). Keeping the demo
// capture out of testDir './e2e' keeps the suite's arithmetic true.
export default defineConfig({
  testDir: './demo',
  timeout: 120000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:8787',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    // Screenshots go into the video at 1:1, so render at 2x and let the scene scale down.
    deviceScaleFactor: 2,
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: 'npx wrangler dev --port 8787 --var CREDENTIALS_KEY:e2e-credentials-key',
    url: 'http://localhost:8787/login',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
