import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the "cosmetic" contract of the service worker: it exists purely to keep the PWA
 * registration alive for installability, and must never intercept network traffic. The two
 * things that would silently reintroduce the white-screen bug are a `fetch` handler (starts
 * serving stale/precached files) and an import of the workbox runtime (brings precaching +
 * cleanupOutdatedCaches back with it).
 */
describe('service worker passthrough', () => {
  const sw = readFileSync(join(__dirname, 'sw.js'), 'utf8');

  it('never intercepts network requests', () => {
    expect(sw).not.toMatch(/\bfetch\s*:/);
    expect(sw).not.toMatch(/\bfetch\s*\(/);
  });

  it('does not import the workbox runtime', () => {
    expect(sw).not.toMatch(/import.*workbox|importScripts/);
  });

  it('keeps the registration alive by claiming control', () => {
    expect(sw).toMatch(/skipWaiting\s*\(/);
    expect(sw).toMatch(/clients\.claim\s*\(/);
  });
});
