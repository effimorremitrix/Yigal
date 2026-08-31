import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1, // tests share one D1 database — keep them sequential
  use: {
    baseURL: 'http://localhost:8787',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    // In environments with a system Chromium (e.g. CHROMIUM_PATH=/opt/pw-browsers/chromium),
    // use it instead of downloading a browser.
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: 'npx wrangler dev --port 8787',
    url: 'http://localhost:8787/login',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
