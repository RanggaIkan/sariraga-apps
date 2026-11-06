// client/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-origin isolation enables multi-threaded WASM inference (same headers as vercel.json).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    headers: isolationHeaders,
    proxy: {
      // Dev only: forward API calls to the local Express server (same handlers as Vercel Functions).
      // Regex so source modules under /api/_lib are still served by Vite.
      '^/api/(detections|stats|health)': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: isolationHeaders,
  },
})
