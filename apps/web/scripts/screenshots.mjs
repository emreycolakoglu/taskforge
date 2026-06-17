import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173';
const OUT_DIR = '/Users/emre/taskforge/apps/web/public/screenshots';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Home page
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${OUT_DIR}/home.png`, fullPage: false });
  console.log('✓ Screenshot: home.png');

  // 2. Navigate to board by clicking the sidebar Boards link
  const boardLink = await page.$('a[href="/"]');
  if (boardLink) {
    // Click the first board card
    const cards = await page.$$('[class*="cursor-pointer"]');
    if (cards.length > 0) {
      await cards[0].click();
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: `${OUT_DIR}/kanban.png`, fullPage: false });
      console.log('✓ Screenshot: kanban.png');

      // 3. List view via ToggleGroup
      await page.evaluate(() => {
        const btn = document.querySelector('button[value="list"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: `${OUT_DIR}/list-view.png`, fullPage: false });
      console.log('✓ Screenshot: list-view.png');

      // 4. Back to kanban
      await page.evaluate(() => {
        const btn = document.querySelector('button[value="kanban"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // Task detail - click on a task card by finding it differently
      const taskCards = await page.$$('[class*="rounded-lg"][class*="border"][class*="p-3"]');
      console.log(`Found ${taskCards.length} task card elements`);
      if (taskCards.length > 0) {
        await taskCards[0].click();
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: `${OUT_DIR}/task-detail.png`, fullPage: false });
        console.log('✓ Screenshot: task-detail.png');
      } else {
        // Fallback: click on anything in the kanban columns
        const columnItems = await page.$$('[data-rfd-draggable-id] > div, [draggable] > div');
        if (columnItems.length > 0) {
          await columnItems[0].click();
          await new Promise(r => setTimeout(r, 1500));
        }
        await page.screenshot({ path: `${OUT_DIR}/task-detail.png`, fullPage: false });
        console.log('✓ Screenshot: task-detail.png (fallback)');
      }
    }
  }

  await browser.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
