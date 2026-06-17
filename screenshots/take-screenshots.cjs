const puppeteer = require('puppeteer');

const URL = 'http://localhost:3000';
const OUT = '/Users/emre/taskforge/screenshots';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Home page with board list
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT}/home-page.png`, fullPage: false });

  // 2. Click on the board to enter Kanban view
  const boardCards = await page.$$('div[style*="cursor: pointer"]');
  if (boardCards.length > 0) {
    await boardCards[0].click();
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/kanban-board.png`, fullPage: false });

  // 3. Switch to list view
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.evaluate(el => el.textContent);
    if (text === 'List') {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT}/list-view.png`, fullPage: false });

  // 4. Go back to Kanban and open a task detail
  const buttons2 = await page.$$('button');
  for (const btn of buttons2) {
    const text = await btn.evaluate(el => el.textContent);
    if (text === 'Kanban') {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));

  // Click on a task card
  const taskCards = await page.$$('div[style*="cursor: pointer"]');
  if (taskCards.length > 0) {
    await taskCards[0].click();
  }
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT}/task-detail.png`, fullPage: false });

  await browser.close();
  console.log('Screenshots saved to', OUT);
}

main().catch(console.error);
