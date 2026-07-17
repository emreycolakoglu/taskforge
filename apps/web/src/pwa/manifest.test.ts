import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { pwaManifest } from './manifest';

/**
 * These assertions are Chrome's installability criteria plus the one failure mode the type
 * system cannot see: an icon `src` that points at a PNG nobody generated. Renaming the art
 * in assets/pwa/ without re-running `pnpm icons` breaks installation silently — the app
 * still builds, still loads, and simply stops offering "Install".
 */
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

describe('pwaManifest', () => {
  it('points every icon at a file that exists in public/', () => {
    const missing = (pwaManifest.icons ?? [])
      .map((icon) => icon.src)
      .filter((src) => !existsSync(join(PUBLIC_DIR, src)));

    expect(missing).toEqual([]);
  });

  it('declares the 192px and 512px any-purpose icons Chrome requires to install', () => {
    const anySizes = (pwaManifest.icons ?? [])
      .filter((icon) => icon.purpose === 'any')
      .map((icon) => icon.sizes);

    expect(anySizes).toContain('192x192');
    expect(anySizes).toContain('512x512');
  });

  it('declares a maskable icon so Android does not letterbox the launcher tile', () => {
    const maskable = (pwaManifest.icons ?? []).filter((icon) => icon.purpose === 'maskable');

    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe('512x512');
  });

  it('is installable: standalone display with a start_url inside scope', () => {
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.start_url).toBeDefined();
    expect(pwaManifest.start_url!.startsWith(pwaManifest.scope!)).toBe(true);
  });
});
