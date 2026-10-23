// examples/wutu-regressions, built prerendered and hydrated in Chromium (and
// WebKit with --webkit): behaviors once broken (hydration, reuse, bindings,
// timers, @unmanaged, custom elements, SVG roots).
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const out = await fs.mkdtemp(path.resolve('.tmp-wutu-regressions-'));
let server, browser;
try {
  execFileSync('node', ['cli/wutu.mjs', 'build', 'examples/wutu-regressions/main.utu', '--out', out], { stdio: 'pipe' });
  server = http.createServer(async (req, res) => {
    try {
      const name = req.url === '/' ? 'index.html' : req.url.slice(1);
      res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'text/html');
      res.end(await fs.readFile(path.join(out, name)));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const engine = process.argv.includes('--webkit') ? webkit : chromium;
  browser = await engine.launch();
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-utu-ready'));
  const result = await page.evaluate(async () => {
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const o = {};
    o.pending = $$('[data-wutu-pending],[data-wutu-prerender]').length;
    o.enabled = !$('#q').disabled && !$('#go').disabled;
    o.hydrated = [$('#hid').hidden, $('#fill').style.width, $('#tip').title];
    o.label = $('label').htmlFor;
    o.card = $('my-card').textContent;
    o.chart = $('#chart').textContent;
    o.circle = $('circle').getAttribute('r');
    o.rows = $$('.row').map(r => r.children.length);
    o.method = $('#method').textContent;
    const clock = $('#clock').textContent;
    o.inputs = [$('#number').value, $('#pick').value];
    $('#bump').click(); await sleep(20);
    o.rowsAfter = $$('.row').map(r => r.children.length);
    o.methodAfter = $('#method').textContent;
    o.clockChanged = $('#clock').textContent !== clock;
    $('#go').click(); await sleep(20);
    o.submitted = $('#n').textContent;
    $('#numbers').click(); await sleep(20);
    o.numbers = [$('#number').value, $('#capped').value];
    $('#more').click(); await sleep(20);
    o.pickAfter = $('#pick').value;
    $('#stop').click(); await sleep(30);
    const beats = $('#beats').textContent;
    await sleep(150);
    o.beatsStill = $('#beats').textContent === beats;
    o.chartAfter = $('#chart').textContent;
    return o;
  });
  assert.deepEqual(result, {
    pending: 0, enabled: true, hydrated: [true, '40%', 'tip'], label: 'q', card: 'custom', chart: 'drawn;', circle: '0',
    rows: [1, 1], method: 'm0', inputs: ['2.5', 'c'],
    rowsAfter: [1, 1], methodAfter: 'm1', clockChanged: true, submitted: '2',
    numbers: ['7', '20'], pickAfter: 'd', beatsStill: true, chartAfter: 'drawn;',
  });
  assert.deepEqual(errors, []);
  console.log(`${engine.name()}: Wutu regressions (hydration, reuse, bindings, timers, @unmanaged, custom elements, SVG roots) passed`);
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await fs.rm(out, { recursive: true, force: true });
}
