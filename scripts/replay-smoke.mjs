/**
 * Headless browser test for CSV track replay on the live field map:
 * loads a sample track, plays it, scrubs it, opens the data table and
 * checks the CSV download. Requires Chrome/Edge.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 5174;
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO = { email: 'md@formulaic.in', password: 'demo1234' };

function chromeExecutable() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  return candidates.find((p) => p && existsSync(p));
}

async function waitForServer(ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server not ready at ${BASE}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(label, ok, detail = '') {
  checks.push({ label, ok });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const readout = (page) => page.evaluate(() => ({
  clock: document.querySelector('.replay-clock')?.textContent ?? '',
  meta: document.querySelector('.replay-file-meta small')?.textContent ?? '',
  name: document.querySelector('.replay-file-meta b')?.textContent ?? '',
  coords: document.querySelectorAll('.replay-readout b')[0]?.textContent ?? '',
  speed: document.querySelectorAll('.replay-readout b')[1]?.textContent ?? '',
  covered: document.querySelectorAll('.replay-readout b')[2]?.textContent ?? '',
  scrub: Number(document.querySelector('.replay-scrub')?.value ?? -1),
  playLabel: document.querySelector('.replay-play span')?.textContent ?? '',
  markerAt: document.querySelector('.replay-marker')?.closest('.leaflet-marker-icon')?.style.transform ?? '',
  traveledPoints: document.querySelectorAll('.leaflet-overlay-pane path').length,
}));

const exe = chromeExecutable();
if (!exe) {
  console.error('replay-smoke: Chrome or Edge not found. Install Chrome or set CHROME_PATH.');
  process.exit(1);
}

const downloadDir = mkdtempSync(path.join(os.tmpdir(), 'replay-dl-'));
const serveBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'serve.cmd' : 'serve');
const server = spawn(serveBin, ['.', '-l', String(PORT)], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });

let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || exe,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.type('#email', DEMO.email);
  await page.type('#password', DEMO.password);
  await page.click('#login-btn');
  await page.waitForSelector('#sidebar', { timeout: 15000 });

  await page.goto(`${BASE}#/tracking`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#map', { timeout: 15000 });
  await page.waitForSelector('.replay-panel', { timeout: 5000 });
  check('replay panel renders on the map page', true);

  // A track far from the default Mumbai view, loaded while the map may still be
  // animating, must still end up centred on the route rather than off-screen.
  await page.select('.replay-actions select', 'sample/gps.csv');
  await page.waitForSelector('.replay-controls', { timeout: 5000 });
  await wait(1500);
  const markerInView = await page.evaluate(() => {
    const marker = document.querySelector('.replay-marker')?.closest('.leaflet-marker-icon');
    const map = document.getElementById('map');
    if (!marker || !map) return null;
    const m = marker.getBoundingClientRect();
    const box = map.getBoundingClientRect();
    return m.left >= box.left && m.right <= box.right && m.top >= box.top && m.bottom <= box.bottom;
  });
  check('map fits to a freshly loaded track', markerInView === true, `markerInView=${markerInView}`);

  // --- Load the bundled sample track ---------------------------------------
  await page.select('.replay-actions select', 'sample/gps-mumbai-field-run.csv');
  await page.waitForSelector('.replay-controls', { timeout: 5000 });
  const loaded = await readout(page);
  check('sample track loads with summary', /259 points/.test(loaded.meta) && /km/.test(loaded.meta), loaded.meta);
  check('clock starts at zero', loaded.clock.startsWith('00:00 /'), loaded.clock);
  check('route drawn on map', loaded.traveledPoints >= 2, `${loaded.traveledPoints} paths`);

  // --- Play ----------------------------------------------------------------
  await page.select('.replay-speed', '8');
  await page.click('.replay-play');
  await wait(1600);
  const playing = await readout(page);
  check('play advances the clock', playing.scrub > 5, `t=${playing.scrub.toFixed(1)}s`);
  check('button switches to Pause', playing.playLabel === 'Pause', playing.playLabel);
  check('marker moved from the start', playing.markerAt !== loaded.markerAt);
  check('readouts update', playing.coords !== '—' && parseFloat(playing.covered) > 0,
    `${playing.coords} · ${playing.speed} · ${playing.covered}`);

  // --- Pause ---------------------------------------------------------------
  await page.click('.replay-play');
  await wait(600);
  const paused = await readout(page);
  await wait(700);
  const stillPaused = await readout(page);
  check('pause stops playback', paused.scrub === stillPaused.scrub && stillPaused.playLabel === 'Play',
    `t=${stillPaused.scrub.toFixed(1)}s`);

  // --- Scrub ---------------------------------------------------------------
  await page.evaluate(() => {
    const s = document.querySelector('.replay-scrub');
    s.value = s.max;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(300);
  const scrubbed = await readout(page);
  check('scrubbing seeks to the end of the track',
    scrubbed.clock.split('/')[0].trim() === scrubbed.clock.split('/')[1].trim(), scrubbed.clock);

  // --- Data table ----------------------------------------------------------
  const dataBtn = await page.$$('.replay-buttons .btn');
  await page.evaluate(() => [...document.querySelectorAll('.replay-buttons .btn')]
    .find((b) => b.textContent.trim() === 'Data')?.click());
  await page.waitForSelector('.replay-table tbody tr', { timeout: 5000 });
  const rows = await page.$$eval('.replay-table tbody tr', (r) => r.length);
  const firstRow = await page.$eval('.replay-table tbody tr', (r) => r.textContent.replace(/\s+/g, ' ').trim());
  check('data table lists the parsed rows', rows === 259, `${rows} rows`);
  check('first data row matches the CSV', firstRow.includes('19.076000') && firstRow.includes('72.877700'), firstRow);
  void dataBtn;

  // --- Download ------------------------------------------------------------
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await page.evaluate(() => [...document.querySelectorAll('.replay-buttons .btn')]
    .find((b) => b.textContent.trim() === 'CSV')?.click());
  await wait(1200);
  const files = readdirSync(downloadDir);
  const saved = files.find((f) => f.endsWith('.csv'));
  const savedMatches = saved
    && readFileSync(path.join(downloadDir, saved), 'utf8')
      === readFileSync(path.join(ROOT, 'sample', 'gps-mumbai-field-run.csv'), 'utf8');
  check('CSV download saves the file to disk', Boolean(savedMatches), saved || files.join(', ') || 'no file');

  // --- Upload a CSV from disk ----------------------------------------------
  const input = await page.$('#replay-file');
  await input.uploadFile(path.join(ROOT, 'sample', 'gps.csv'));
  await wait(600);
  const uploaded = await readout(page);
  check('uploading gps.csv replaces the track',
    uploaded.name === 'gps.csv' && /6 points/.test(uploaded.meta), `${uploaded.name} — ${uploaded.meta}`);
  check('short track duration is 15 s', uploaded.clock.endsWith('/ 00:15'), uploaded.clock);

  // --- Clear ---------------------------------------------------------------
  await page.evaluate(() => [...document.querySelectorAll('.replay-buttons .btn')]
    .find((b) => b.textContent.trim() === 'Clear')?.click());
  await wait(300);
  const cleared = await page.$('.replay-controls');
  check('clear removes the track', cleared === null);

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('run completed', false, err.message);
} finally {
  if (browser) await browser.close();
  server.kill();
  rmSync(downloadDir, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
console.log(`\nreplay-smoke: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
