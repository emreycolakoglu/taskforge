import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
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

  it('declares maskable icons so Android does not letterbox the launcher tile', () => {
    const maskable = (pwaManifest.icons ?? [])
      .filter((icon) => icon.purpose === 'maskable')
      .map((icon) => icon.sizes);

    expect(maskable).toEqual(['192x192', '512x512']);
  });

  it('is installable: standalone display with a start_url inside scope', () => {
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.start_url).toBeDefined();
    expect(pwaManifest.start_url!.startsWith(pwaManifest.scope!)).toBe(true);
  });
});

/**
 * index.html carries the icons the manifest cannot: the tab favicon, and apple-touch-icon,
 * which iOS reads *instead of* the manifest. Neither is type-checked and neither breaks the
 * build when its file is renamed away — the tab just quietly falls back to a blank page
 * glyph, and iOS home screens get a screenshot of the page.
 */
describe('index.html icons', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1],
  );

  it('references a favicon and an apple-touch-icon', () => {
    expect(hrefs).toContain('/favicon.ico');
    expect(hrefs).toContain('/icons/apple-touch-icon.png');
  });

  it('points every icon link at a file that exists in public/', () => {
    expect(hrefs.filter((href) => !existsSync(join(PUBLIC_DIR, href)))).toEqual([]);
  });
});
