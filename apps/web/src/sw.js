/**
 * TaskForge service worker — cosmetic by design.
 *
 * It exists for one reason only: keeping a service worker registered under the '/' scope so
 * browsers treat TaskForge as an installable PWA ("Add to Home Screen", desktop install).
 *
 * It deliberately does NOT touch the network in any way:
 *  - no `fetch` handler, so every request goes straight to the browser's default network
 *    behavior — identical to there being no service worker at all;
 *  - no precache of the app shell or any asset (see `globPatterns: []` in vite.config.ts,
 *    which injects an empty list at the `self.__WB_MANIFEST` marker);
 *  - no offline fallback, no runtime caching.
 *
 * Why: the old generateSW worker precached the entire app shell. After a redeploy the
 * hashed chunks an already-open tab was running got cleaned out of the precache, and the
 * server's SPA fallback answered the resulting 404s with index.html (text/html), which the
 * module loader rejected — surfacing as a white, unstyled UI. An inert worker cannot do
 * this, because it never reads from or writes to Cache Storage.
 */
// workbox's injectManifest build (see vite.config.ts) replaces this exact marker with the
// precache manifest. With `globPatterns: []` it becomes `[]` — truthy, so `skipWaiting` is
// still called. The marker must be written this way: a bare `self.__WB_MANIFEST;` statement
// is tree-shaken out of the built worker, and workbox refuses to inject without it.
self.__WB_MANIFEST && self.skipWaiting();

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
