/**
 * Headless smoke test: serve portal, sign in, confirm dashboard shell.
 * Requires Chrome/Edge (puppeteer-core does not bundle Chromium).
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO = { email: 'md@formulaic.in', password: 'demo1234' };

function chromeExecutable() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  return candidates.find((p) => p && existsSync(p));
}

function waitForServer(ms = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(BASE);
        if (r.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - start > ms) return reject(new Error(`Server not ready at ${BASE}`));
      setTimeout(tick, 200);
    };
    tick();
  });
}

const exe = chromeExecutable();
if (!exe) {
  console.error('smoke: Chrome or Edge not found. Install Chrome or set CHROME_PATH.');
  process.exit(1);
}

const serveBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'serve.cmd' : 'serve');
const server = spawn(serveBin, ['.', '-l', String(PORT)], {
  cwd: ROOT,
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || exe,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.type('#email', DEMO.email, { delay: 20 });
  await page.type('#password', DEMO.password, { delay: 20 });
  await page.click('#login-btn');
  await page.waitForSelector('#sidebar', { timeout: 15000 });
  const title = await page.$eval('#page-title', (el) => el.textContent?.trim());
  console.log(`smoke: OK — signed in, page title: "${title}"`);
} catch (err) {
  console.error('smoke: FAILED —', err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
