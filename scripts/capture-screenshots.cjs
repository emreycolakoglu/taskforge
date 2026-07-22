#!/usr/bin/env node
// Capture TaskForge screenshots via Puppeteer against localhost:5173 (Vite dev)
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'apps', 'web', 'node_modules', 'puppeteer'));

const BASE = 'http://localhost:5173';
const TOKEN = '32895a97-36af-4f9a-b7a2-966fb4c79fa8';
const OUT = 'apps/web/public/screenshots';
const BOARD_ID = 'cmrw7cmvh0005idas3kjvasia';
const TASK_ID = 'cmrw7cmvn000pidas83b143ob';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('Saved', name);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--window-size=1440,900', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();

  // Inject the session token before navigating, so AuthProvider reads it on mount
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => localStorage.setItem('taskforge_token', token), TOKEN);

  // --- Home page ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await shot(page, 'home');

  // --- Kanban board ---
  await page.goto(`${BASE}/board/${BOARD_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await shot(page, 'kanban');

  // --- Task detail ---
  await page.goto(`${BASE}/board/${BOARD_ID}/task/${TASK_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await shot(page, 'task-detail');

  // --- List view (Tasks search page) ---
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await shot(page, 'list-view');

  await browser.close();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
