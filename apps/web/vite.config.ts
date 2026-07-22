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
      // The new service worker activates as soon as it is fetched instead of waiting for
      // every tab to close. TaskForge is long-lived in a pinned tab, so "waiting" in
      // practice means "never" — users would sit on stale assets for days.
      registerType: 'autoUpdate',
      // Injects the registration snippet into index.html, so no registration code is needed
      // in main.tsx.
      injectRegister: 'auto',
      manifest: pwaManifest,
      workbox: {
        // Precache the built app shell only. Deliberately no runtimeCaching for /api: every
        // route is behind a session token and boards are shared, so caching responses would
        // park another user's task data in this browser's Cache Storage, where logout does
        // not reach it.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/screenshots/**'],
        // The SPA fallback serves cached index.html for navigations. /api and /ws must reach
        // the network — without these, the service worker would answer XHRs and the socket
        // handshake with the HTML shell.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        cleanupOutdatedCaches: true,
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
