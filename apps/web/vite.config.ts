import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { pwaManifest } from './src/pwa/manifest';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The service worker is cosmetic: it exists to keep the PWA registration alive so the
      // app stays installable ("Add to Home Screen"), and it never intercepts a request.
      // See src/sw.js for the why.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: pwaManifest,
      // injectManifest lets us ship our own worker instead of workbox's precaching one. The
      // worker in src/sw.js is inert — no `fetch` handler, nothing precached — so every
      // request, including /api and /ws, passes straight through to the network exactly as if
      // there were no worker.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // Don't let workbox's icon auto-inclusion put anything in the precache manifest either.
      includeManifestIcons: false,
      injectManifest: {
        // Precache nothing. The worker exists to be registered, not to serve anything.
        globPatterns: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
