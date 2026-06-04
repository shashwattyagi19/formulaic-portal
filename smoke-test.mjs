import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5173';
const errors = [];
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.includes('localhost')) errors.push('requestfailed: ' + u + ' ' + r.failure()?.errorText);
});

async function step(name, fn) {
  try { await fn(); log('  PASS:', name); }
  catch (e) { errors.push(`step "${name}": ${e.message}`); log('  FAIL:', name, '-', e.message); }
}

log('Loading login page…');
await page.goto(BASE, { waitUntil: 'networkidle2' });

await step('login form rendered', async () => {
  await page.waitForSelector('#login-form', { timeout: 8000 });
  const chips = await page.$$('.demo-chip');
  if (chips.length < 6) throw new Error('expected demo chips, got ' + chips.length);
});

await step('login as Managing Director', async () => {
  await page.type('#email', 'md@formulaic.in');
  await page.type('#password', 'demo1234');
  await page.click('#login-btn');
  await page.waitForSelector('.shell', { timeout: 8000 });
  await page.waitForSelector('.stat .value', { timeout: 8000 });
});

const routes = ['tracking', 'visits', 'attendance', 'expenses', 'employees', 'profile', 'dashboard'];
for (const r of routes) {
  await step(`navigate → ${r}`, async () => {
    await page.evaluate((rt) => { location.hash = '#/' + rt; }, r);
    await new Promise((res) => setTimeout(res, 900));
    const hasLoader = await page.$('#view-root .spinner');
    if (hasLoader) { await new Promise((res) => setTimeout(res, 1200)); }
    const errBox = await page.$('#view-root .empty pre');
    if (errBox) throw new Error('view error box present');
    const html = await page.$eval('#view-root', (e) => e.innerHTML.length);
    if (html < 50) throw new Error('view root nearly empty');
  });
}

await step('map renders engineer markers', async () => {
  await page.evaluate(() => { location.hash = '#/tracking'; });
  await page.waitForSelector('#map .leaflet-marker-icon', { timeout: 8000 });
  await new Promise((res) => setTimeout(res, 6000)); // wait for a couple of sim ticks
  const items = await page.$$('.eng-item');
  if (items.length < 1) throw new Error('no engineers in list');
});

await step('live markers move (simulation)', async () => {
  const pos1 = await page.$$eval('#map .leaflet-marker-icon', (els) => els.map((e) => e.style.transform).join('|'));
  await new Promise((res) => setTimeout(res, 6000));
  const pos2 = await page.$$eval('#map .leaflet-marker-icon', (els) => els.map((e) => e.style.transform).join('|'));
  if (pos1 === pos2) throw new Error('markers did not move between ticks');
});

await step('open Add expense modal', async () => {
  await page.evaluate(() => { location.hash = '#/expenses'; });
  await page.waitForSelector('#add-exp', { timeout: 8000 });
  await page.click('#add-exp');
  await page.waitForSelector('.modal #exp-form', { timeout: 5000 });
});

await step('login as Site Engineer (role scoping)', async () => {
  await page.evaluate(() => { localStorage.removeItem('formulaic-session'); });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#login-form');
  await page.type('#email', 'imran@formulaic.in');
  await page.type('#password', 'demo1234');
  await page.click('#login-btn');
  await page.waitForSelector('.shell', { timeout: 8000 });
  const navItems = await page.$$eval('.nav a', (els) => els.map((e) => e.dataset.route));
  if (navItems.includes('employees')) throw new Error('engineer should not see Employees nav');
  if (!navItems.includes('tracking')) throw new Error('engineer should see tracking');
});

await browser.close();

log('\n' + '='.repeat(50));
if (errors.length) {
  log('SMOKE TEST FAILED with', errors.length, 'issue(s):');
  errors.forEach((e) => log('  •', e));
  process.exit(1);
} else {
  log('ALL SMOKE TESTS PASSED ✔');
}
