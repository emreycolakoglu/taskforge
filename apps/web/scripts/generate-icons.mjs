/**
 * Rasterizes the PWA icon art in assets/pwa/*.svg into public/icons/*.png.
 *
 *   node scripts/generate-icons.mjs
 *
 * The PNGs are committed, so this only needs re-running when the SVG art changes.
 * Why rasterize at all: the manifest could point at an SVG and Chrome would cope, but
 * iOS home-screen icons and Android launcher/splash icons need real PNGs, and "add to
 * home screen" on iOS is most of the point of shipping this.
 *
 * Uses puppeteer because it is already a devDependency here (scripts/screenshots.mjs),
 * so this adds no new toolchain — it just renders each SVG in a headless page and
 * screenshots it at the target size.
 */
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'assets', 'pwa');
const OUT_DIR = join(ROOT, 'public', 'icons');

/**
 * `transparent` controls whether the PNG keeps the art's transparent corners. It must be
 * false for apple-touch-icon: iOS composites transparency against black, which would ring
 * the squircle in black slivers, so that one renders from the full-bleed maskable art.
 */
const ICONS = [
  { src: 'app-icon.svg', out: 'pwa-192.png', size: 192, transparent: true },
  { src: 'app-icon.svg', out: 'pwa-512.png', size: 512, transparent: true },
  { src: 'app-icon-maskable.svg', out: 'pwa-maskable-512.png', size: 512, transparent: false },
  { src: 'app-icon-maskable.svg', out: 'apple-touch-icon.png', size: 180, transparent: false },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();

    for (const { src, out, size, transparent } of ICONS) {
      const svg = await readFile(join(SRC_DIR, src), 'utf8');

      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(
        `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      await page.screenshot({ path: join(OUT_DIR, out), omitBackground: transparent });

      console.log(`✓ ${out} (${size}×${size})`);
    }
  } finally {
    await browser.close();
  }
}

main();
