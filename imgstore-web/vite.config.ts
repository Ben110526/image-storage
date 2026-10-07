import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // Internal V2 optics lab — dev/preview only page, noindex, not linked
        // from the app shell (PLAN_LIQUID_GLASS_OPTICAL_V2 §11.1).
        // RV-08: Only include lab in dev serve, NOT in production build.
        ...(command === 'serve' ? { 'glass-lab': resolve(import.meta.dirname, 'lab/glass-lab.html') } : {}),
      },
    },
  },
}))
