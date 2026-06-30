#!/usr/bin/env node
// Capture TaskForge screenshots via Puppeteer against localhost:3001
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'apps', 'web', 'node_modules', 'puppeteer'));
const fs = require('fs');

const BASE = 'http://localhost:3001';
const TOKEN = fs.readFileSync('/tmp/taskforge-token.txt', 'utf8').trim();
const OUT = 'apps/web/public/screenshots';

const BOARD_ID = process.env.BOARD_ID;
const TASK_ID = process.env.TASK_ID;
if (!BOARD_ID || !TASK_ID) {
  console.error('Missing BOARD_ID / TASK_ID env');
  process.exit(1);
}

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
  await sleep(1500); // let boards render + images settle
  await shot(page, 'home');

  // --- Kanban board ---
  await page.goto(`${BASE}/board/${BOARD_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000); // board + columns + cards render
  await shot(page, 'kanban');

  // --- Task detail ---
  await page.goto(`${BASE}/board/${BOARD_ID}/task/${TASK_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000); // detail page fetches task + comments + relations
  await shot(page, 'task-detail');

  // --- List view (Tasks search page) ---
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle0' });
  // Type a search to populate the table
  const input = await page.$('input[type="text"], input[type="search"]');
  if (input) {
    await input.click({ clickCount: 3 });
    await input.type('OAuth');
    await sleep(1500);
  }
  await shot(page, 'list-view');

  await browser.close();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });