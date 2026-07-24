/**
 * Installs the PWA icon art from assets/pwa/ into the paths the app actually serves.
 *
 *   node scripts/generate-icons.mjs
 *
 * The art is delivered as raster at every size we ship, so this no longer rasterizes
 * anything — it is the mapping from master filename to served path, written down so it is
 * repeatable instead of living in someone's shell history. assets/pwa/ is the source of
 * truth, public/ is generated output: edit a master and re-run, never hand-edit the copies.
 *
 * Each size is its own master rather than a downscale done here, because the art is tuned
 * per size (the 192s carry a chunkier glyph than a shrunk 512 would). PNG rather than SVG
 * because iOS home-screen icons and Android launcher tiles require raster.
 */
import { copyFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'assets', 'pwa');
const PUBLIC_DIR = join(ROOT, 'public');

/**
 * apple-touch-icon is a separate master, not a resized 192: iOS ignores the manifest, mounts
 * the image at exactly 180px, and composites transparency against black before applying its
 * own squircle mask — so that art is full-bleed with no corner radius of its own.
 */
const ICONS = [
  { src: 'favicon.ico', out: 'favicon.ico' },
  { src: 'icon-192.png', out: 'icons/pwa-192.png' },
  { src: 'icon-512.png', out: 'icons/pwa-512.png' },
  { src: 'icon-192-maskable.png', out: 'icons/pwa-maskable-192.png' },
  { src: 'icon-512-maskable.png', out: 'icons/pwa-maskable-512.png' },
  { src: 'apple-touch-icon.png', out: 'icons/apple-touch-icon.png' },
];

async function main() {
  await mkdir(join(PUBLIC_DIR, 'icons'), { recursive: true });

  for (const { src, out } of ICONS) {
    await copyFile(join(SRC_DIR, src), join(PUBLIC_DIR, out));
    console.log(`✓ ${out}`);
  }
}

main();
