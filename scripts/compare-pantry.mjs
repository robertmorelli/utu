// Compare the Pantry dashboard written in UTU (-Oz and -O3) with the same app
// in plain JavaScript: shipped bytes, and load / render / scale timings in
// Chromium. Both apps use the same HTML, CSS and data.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'examples/browser-pantry');
const out = path.join(ROOT, 'dist/compare-pantry');
const variants = { 'UTU -Oz': 'utu-oz', 'UTU -O3': 'utu-o3', JavaScript: 'js' };

await fs.rm(out, { recursive: true, force: true });
await buildBrowserApp({ entry: path.join(source, 'main.utu'), outDir: path.join(out, 'utu-oz'), optimize: 'size' });
await buildBrowserApp({ entry: path.join(source, 'main.utu'), outDir: path.join(out, 'utu-o3'), optimize: 'speed' });
await build({ entryPoints: [path.join(source, 'js/main.js')], bundle: true, minify: true, format: 'esm', target: 'es2022',
  outfile: path.join(out, 'js/app.js'), logLevel: 'silent' });
for (const dir of Object.values(variants)) {
  for (const file of ['index.html', 'style.css', 'items.json']) await fs.copyFile(path.join(source, file), path.join(out, dir, file));
}

// ── Bytes: the code each variant ships (HTML, CSS and data are identical) ──
const bytes = {};
for (const [name, dir] of Object.entries(variants)) {
  const files = ['app.js', 'app.wasm'].map(f => path.join(out, dir, f));
  const contents = (await Promise.all(files.map(f => fs.readFile(f).catch(() => null)))).filter(Boolean);
  const sum = transform => contents.reduce((n, buffer) => n + transform(buffer).length, 0);
  bytes[name] = { raw: sum(b => b), gzip: sum(b => gzipSync(b, { level: 9 })), brotli: sum(b => brotliCompressSync(b)) };
}

// ── Browser timings ──
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const file = path.join(out, new URL(req.url, 'http://local').pathname);
  try {
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await fs.readFile(file.endsWith('/') ? path.join(file, 'index.html') : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];
const browser = await chromium.launch({ headless: true });
const timings = Object.fromEntries(Object.keys(variants).map(name => [name, { load: [], render: [], scale: [] }]));

async function open(dir) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/${dir}/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('.item').length === 8);
  return { context, page, errors };
}

try {
  // Same DOM from both implementations.
  const snapshots = [];
  for (const dir of Object.values(variants)) {
    const { context, page, errors } = await open(dir);
    await page.selectOption('#sort', 'price');
    snapshots.push(await page.locator('#items').innerHTML());
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert(snapshots.every(html => html === snapshots[0]), 'the implementations render different DOM');

  const rounds = Number(process.env.ROUNDS ?? 12);
  for (let round = 0; round < rounds; round++) {
    // Rotate the order so no variant always runs first.
    const order = Object.entries(variants);
    for (let i = 0; i < round % order.length; i++) order.push(order.shift());
    for (const [name, dir] of order) {
      const { context, page } = await open(dir);
      timings[name].load.push(await page.evaluate(() => performance.now()));
      // 300 synchronous re-renders through the sort control.
      timings[name].render.push(await page.evaluate(() => {
        const select = document.querySelector('#sort');
        const values = ['price', 'quantity', 'name'];
        const start = performance.now();
        for (let i = 0; i < 300; i++) {
          select.value = values[i % 3];
          select.dispatchEvent(new Event('change'));
        }
        return performance.now() - start;
      }));
      // Adding 300 items, each re-rendering the whole growing list.
      timings[name].scale.push(await page.evaluate(() => {
        const form = document.querySelector('#add');
        const name = form.querySelector('[name=name]'), price = form.querySelector('[name=price]');
        const start = performance.now();
        for (let i = 0; i < 300; i++) {
          name.value = `Item ${i}`;
          price.value = String(1 + (i % 17));
          form.requestSubmit();
        }
        return performance.now() - start;
      }));
      assert.equal(await page.locator('.item').count(), 308);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

const report = { engine: 'Chromium (Playwright headless)', rounds: timings.JavaScript.load.length, bytes, browser: {} };
for (const [name, samples] of Object.entries(timings)) {
  report.browser[name] = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, Number(median(v).toFixed(2))]));
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
