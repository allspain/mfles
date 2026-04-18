// Takes 1280x800 screenshots of the mock pages for Chrome Web Store submission
// Usage: node screenshot.js
// Requires: npm install puppeteer

const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:8888';
const OUT_DIR = path.resolve(__dirname, 'screenshots');

const fs = require('fs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--load-extension=${EXTENSION_PATH}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      '--window-size=1280,800',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // ── Tactics page ──────────────────────────────────────────────────
  console.log('Navigating to tactics page...');
  await page.goto(`${BASE_URL}/clubs/7338/tactics/`, { waitUntil: 'networkidle0' });

  // Wait for extension to inject the Optimize Lineup button
  await page.waitForSelector('#mfl-optimize-btn', { timeout: 10000 }).catch(() => {
    console.warn('Warning: Optimize button not found — extension may not be loaded');
  });

  // Wait for OVR chips to be injected (position cells augmented)
  await page.waitForFunction(
    () => document.querySelector('.mfl-pos-chip') !== null,
    { timeout: 10000 }
  ).catch(() => console.warn('Warning: OVR chips not found'));

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '1-tactics.png') });
  console.log('✓ screenshots/1-tactics.png');

  // ── Scouting page ─────────────────────────────────────────────────
  console.log('Navigating to scouting page...');
  await page.goto(`${BASE_URL}/scouting/`, { waitUntil: 'networkidle0' });

  await page.waitForFunction(
    () => document.querySelector('.mfl-pos-chip') !== null,
    { timeout: 10000 }
  ).catch(() => console.warn('Warning: OVR chips not found on scouting page'));

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '2-scouting.png') });
  console.log('✓ screenshots/2-scouting.png');

  // ── Scouting page with tooltip ────────────────────────────────────
  console.log('Taking tooltip screenshot...');
  await page.goto(`${BASE_URL}/scouting/`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Call showTooltip directly — position tooltip in center-right of viewport
  const tooltipTriggered = await page.evaluate(() => {
    if (typeof showTooltip !== 'function' || !PLAYERS || !PLAYERS.length) return false;
    showTooltip(PLAYERS[0], 700, 300);
    return true;
  });
  if (tooltipTriggered) {
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(OUT_DIR, '3-tooltip.png') });
    console.log('✓ screenshots/3-tooltip.png');
  } else {
    console.warn('Warning: showTooltip not accessible — skipping tooltip screenshot');
  }

  await browser.close();
  console.log(`\nDone. Screenshots saved to mock/screenshots/`);
})();
