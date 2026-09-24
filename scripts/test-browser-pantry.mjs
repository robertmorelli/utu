// Builds examples/browser-pantry and drives it in Chromium: fetch + JSON, search
// debounce with URL state, filter chips, sorting, persisted favorites, keyboard
// shortcut, canvas drawing, and form validation.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'examples/browser-pantry');
const outDir = path.join(ROOT, 'dist/browser-pantry');
const report = await buildBrowserApp({ entry: path.join(source, 'main.utu'), outDir });
for (const file of ['index.html', 'style.css', 'items.json']) await fs.copyFile(path.join(source, file), path.join(outDir, file));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const file = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html';
  if (!['index.html', 'style.css', 'app.js', 'app.wasm', 'items.json'].includes(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)]);
  res.end(await fs.readFile(path.join(outDir, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/`);
  const names = () => page.locator('.item h2').allTextContents();
  await page.locator('.item').nth(7).waitFor();
  assert.equal(await page.locator('.item').count(), 8);
  assert.deepEqual((await names()).slice(0, 2), ['Basmati rice', 'Baby spinach'].sort());
  await page.waitForFunction(() => document.querySelector('#total-value').textContent === '$116.60');

  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
  await page.keyboard.type('oat');
  await page.waitForFunction(() => document.querySelectorAll('.item').length === 2);
  assert.deepEqual(await names(), ['Oat milk', 'Rolled oats']);
  assert.equal(new URL(page.url()).searchParams.get('q'), 'oat');

  await page.locator('#search').fill('');
  await page.waitForFunction(() => document.querySelectorAll('.item').length === 8);
  await page.getByRole('button', { name: 'Dairy', exact: true }).click();
  assert.deepEqual(await names(), ['Greek yogurt', 'Oat milk']);
  assert.equal(await page.locator('.chip.active').textContent(), 'Dairy');
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.selectOption('#sort', 'price');
  assert.deepEqual((await names()).slice(0, 2), ['Honeycrisp apples', 'Baby spinach']);

  await page.getByLabel('Favorite Oat milk').click();
  assert.equal(await page.locator('.item.favorite h2').textContent(), 'Oat milk');
  await page.goto(`${origin}/?q=milk`);
  await page.locator('.item').first().waitFor();
  assert.equal(await page.locator('#search').inputValue(), 'milk');
  assert.equal(await page.locator('.item.favorite').count(), 1, 'favorites persist across reloads');

  await page.goto(`${origin}/`);
  await page.locator('.item').nth(7).waitFor();
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#chart');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) ink++;
    return ink;
  });
  assert(painted > 1000, `the chart should be drawn (${painted} painted pixels)`);

  await page.getByRole('button', { name: 'Add item' }).click();
  assert.match(await page.locator('#form-error').textContent(), /name and a price/);
  await page.getByLabel('Item name').fill('Blueberries');
  await page.getByLabel('Price').fill('4.5');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.item').length === 9);
  assert.equal(await page.locator('#form-error').textContent(), '');
  assert((await names()).includes('Blueberries'));
  assert.match(await page.locator('#status').textContent(), /^9 of 9 items · updated /);

  await page.waitForFunction(() => document.querySelector('#total-value').textContent === '$121.10');
  await page.screenshot({ path: path.join(outDir, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout overflows');
  await page.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ total: report.total, imports: report.imports }, null, 2));
  console.log('PASS pantry: fetch, search, URL state, chips, sort, favorites, shortcut, canvas and form');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
