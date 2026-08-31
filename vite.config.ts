import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // API is served by `npm run dev:worker` (wrangler dev) during development.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
