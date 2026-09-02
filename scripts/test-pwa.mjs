/**
 * Assert the iPhone 15 Pro PWA contract: valid manifest (no trailing comma),
 * required icons/splashes at the right pixel sizes, Apple meta tags, SW shell.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

function pngSize(rel) {
  const buf = readFileSync(path.join(ROOT, rel));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${rel} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('manifest.json is valid JSON with no trailing comma', () => {
  const raw = read('manifest.json');
  assert.doesNotMatch(raw, /,\s*}/, 'trailing comma before } would break iOS install');
  const manifest = JSON.parse(raw);
  assert.equal(manifest.name, 'Formulaic Valuers');
  assert.equal(manifest.short_name, 'Formulaic');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#2563eb');
  assert.equal(manifest.background_color, '#0b1020');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('home-screen icons exist at the declared sizes', () => {
  assert.deepEqual(pngSize('icons/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(pngSize('icons/icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), { width: 180, height: 180 });
  assert.deepEqual(pngSize('icons/icon-maskable-512.png'), { width: 512, height: 512 });
});

test('iPhone 15 Pro splash screens are 3x 393×852', () => {
  assert.deepEqual(pngSize('icons/splash-iphone15pro-portrait.png'), { width: 1179, height: 2556 });
  assert.deepEqual(pngSize('icons/splash-iphone15pro-landscape.png'), { width: 2556, height: 1179 });
});

test('index.html has Apple PWA tags for iPhone standalone', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-mobile-web-app-title" content="Formulaic"/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /splash-iphone15pro-portrait/);
  assert.match(html, /device-width: 393px/);
  assert.match(html, /device-height: 852px/);
  assert.match(html, /-webkit-device-pixel-ratio: 3/);
});

test('service worker caches the app shell and skips /api/', () => {
  const sw = read('sw.js');
  assert.match(sw, /formulaic-pwa-v1/);
  assert.match(sw, /\/index\.html/);
  assert.match(sw, /\/manifest\.json/);
  assert.match(sw, /\/js\/app\.js/);
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
});

test('service worker file and pwa helper are present', () => {
  assert.equal(existsSync(path.join(ROOT, 'sw.js')), true);
  assert.equal(existsSync(path.join(ROOT, 'js/pwa.js')), true);
  const pwa = read('js/pwa.js');
  assert.match(pwa, /registerServiceWorker/);
  assert.match(pwa, /Add to Home Screen/);
});
