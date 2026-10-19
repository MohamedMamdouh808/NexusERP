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
    // Bound to IPv4 explicitly. Vite's default is `localhost`, which on this machine
    // resolves to the IPv6 loopback, so `http://127.0.0.1:4173` is not reachable and the
    // end-to-end suite's readiness check times out even though the server is up.
    host: '127.0.0.1',
    // `vite preview` does not honour `server.proxy`, so the end-to-end suite would get no
    // API and the health panel would only ever show its failure state. Mirroring the
    // development proxy here is what lets the smoke test actually read the report.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});