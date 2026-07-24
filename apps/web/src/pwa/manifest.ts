import type { ManifestOptions } from 'vite-plugin-pwa';

/**
 * Web app manifest — the thing that makes TaskForge installable ("Add to Home Screen" on
 * iOS, "Install app" on desktop/Android). Consumed by vite-plugin-pwa in vite.config.ts,
 * which emits it as /manifest.webmanifest at build time. It lives in src/ rather than
 * beside the vite config so that tsc and vitest both see it — see manifest.test.ts, which
 * guards the icon set against Chrome's installability rules.
 *
 * Colours are design.md tokens: Onyx (#08090a) is the app canvas, so the splash screen and
 * the OS title/status bar match the UI instead of flashing white on launch, matching the
 * background of the icon art in assets/pwa/.
 */
export const pwaManifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'TaskForge',
  short_name: 'TaskForge',
  description: 'Kanban task board for humans and AI agents.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#08090a',
  theme_color: '#08090a',
  icons: [
    { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    // Kept separate from the "any" icons on purpose: a maskable icon is full-bleed and gets
    // cropped to the launcher's shape, so reusing the rounded-corner art here would have the
    // OS round off already-rounded corners.
    { src: '/icons/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
