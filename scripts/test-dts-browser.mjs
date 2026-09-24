import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, 'dist/browser-board');
const report = await buildBrowserApp({ entry: path.join(ROOT, 'examples/browser-board/main.utu'), outDir });
for (const file of ['index.html', 'style.css']) await fs.copyFile(path.join(ROOT, 'examples/browser-board', file), path.join(outDir, file));
assert(report.total.gzip < 6000, `app code exceeded 6 KB gzip: ${report.total.gzip}`);
assert(report.imports < 40, 'unused browser ABI imports reached the output');
const server = http.createServer(async (req, res) => {
  const file = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html';
  if (!['index.html', 'style.css', 'app.js', 'app.wasm'].includes(file)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(outDir, file)));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('.task').nth(2).waitFor();
  assert.equal(await page.locator('.task').count(), 3);
  await page.getByLabel('New task').fill('Ship portable bindings 🌱');
  await page.getByRole('button', { name: 'Add task' }).click();
  assert.equal(await page.locator('.task').count(), 4);
  await page.getByLabel('Complete task').last().click();
  assert.equal(await page.locator('.task.done').count(), 1);
  await page.reload();
  await page.locator('.task').nth(3).waitFor();
  assert.equal(await page.locator('.task.done').count(), 1, 'completion survives reload');
  await page.getByLabel('Reopen task').click();
  assert.equal(await page.locator('.task.done').count(), 0);
  await page.getByLabel('Delete task').last().click();
  assert.equal(await page.locator('.task').count(), 3);
  await page.getByLabel('New task').fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('New task').press('Enter');
  assert.equal(await page.locator('img').count(), 0, 'user text must remain text');
  assert.equal(await page.locator('.task').count(), 4);
  await page.getByLabel('Delete task').last().click();
  await page.screenshot({ path: path.join(outDir, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout overflows');
  await page.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true });
  const interactionMs = await page.evaluate(() => {
    const input = document.querySelector('input'), form = document.querySelector('form');
    const start = performance.now();
    for (let i = 0; i < 200; i++) { input.value = `Task ${i}`; form.requestSubmit(); }
    for (const button of document.querySelectorAll('.toggle')) button.click();
    return performance.now() - start;
  });
  assert.equal(await page.locator('.task.done').count(), 203);
  assert(interactionMs < 5000, `200 inserts and 203 toggles took ${interactionMs}ms`);
  assert.deepEqual(errors, []);
  report.browser = { engine: await browser.version(), inserted: 200, toggled: 203, interactionMs: Math.round(interactionMs) };
  await fs.writeFile(path.join(outDir, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
