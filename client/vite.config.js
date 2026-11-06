// client/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Dev only: forward API calls to the local Express server (same handlers as Vercel Functions).
      // Regex so source modules under /api/_lib are still served by Vite.
      '^/api/(detections|stats|health)': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
