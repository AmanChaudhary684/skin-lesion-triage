import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend defaults to http://localhost:8000 (see backend/main.py).
// Adjust the proxy target if you run the backend on a different port.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
