import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The development server proxies /api to the service so the browser sees a
// single origin. This keeps the session cookie first-party in development and
// means no component ever hardcodes an API host (FR-005).
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true, // fail fast naming the port rather than silently choosing another
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});