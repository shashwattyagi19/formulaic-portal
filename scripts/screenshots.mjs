/**
 * Capture docs/dashboard.png and docs/tracking.png for the README.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = path.join(ROOT, 'docs');
const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}`;

function chromeExecutable() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'];
  return candidates.find((p) => p && existsSync(p));
}

async function waitForServer(ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server not ready at ${BASE}`);
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.type('#email', 'md@formulaic.in');
  await page.type('#password', 'demo1234');
  await page.click('#login-btn');
  await page.waitForSelector('#sidebar', { timeout: 15000 });
}

const exe = chromeExecutable();
if (!exe) {
  console.error('screenshots: Chrome or Edge not found.');
  process.exit(1);
}

mkdirSync(DOCS, { recursive: true });
const serveBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'serve.cmd' : 'serve');
const server = spawn(serveBin, ['.', '-l', String(PORT)], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });

let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || exe,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await login(page);
  await page.setViewport({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(DOCS, 'dashboard.png') });

  await page.goto(`${BASE}#/tracking`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#map', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(DOCS, 'tracking.png') });

  console.log('screenshots: wrote docs/dashboard.png and docs/tracking.png');
} catch (err) {
  console.error('screenshots: FAILED —', err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
