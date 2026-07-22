import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173';
const TOKEN = '32895a97-36af-4f9a-b7a2-966fb4c79fa8';
const OUT_DIR = '/Users/emre/taskforge/apps/web/public/screenshots';
const BOARD_ID = 'cmrw7cmvh0005idas3kjvasia';
const TASK_ID = 'cmrw7cmvn000pidas83b143ob';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  // Inject token before navigating
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => localStorage.setItem('taskforge_token', token), TOKEN);

  // 1. Home page
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await page.screenshot({ path: `${OUT_DIR}/home.png`, fullPage: false });
  console.log('✓ Screenshot: home.png');

  // 2. Kanban board
  await page.goto(`${BASE}/board/${BOARD_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await page.screenshot({ path: `${OUT_DIR}/kanban.png`, fullPage: false });
  console.log('✓ Screenshot: kanban.png');

  // 3. Task detail
  await page.goto(`${BASE}/board/${BOARD_ID}/task/${TASK_ID}`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await page.screenshot({ path: `${OUT_DIR}/task-detail.png`, fullPage: false });
  console.log('✓ Screenshot: task-detail.png');

  // 4. List view
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await page.screenshot({ path: `${OUT_DIR}/list-view.png`, fullPage: false });
  console.log('✓ Screenshot: list-view.png');

  await browser.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
