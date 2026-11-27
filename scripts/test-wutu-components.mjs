import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { formatUtu } from '../src/wutu/wutu-tooling.js';
import { loadNodeTools } from '../src/selfhost/node.js';

const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wutu-components-'));
let browser;
try {
  const source = await fs.readFile('examples/wutu-components/main.utu', 'utf8');
  const formatted = formatUtu(await loadNodeTools(), source);
  assert.equal(formatted.refused, null);
  const entry = path.join(out, 'main.utu');
  await fs.writeFile(entry, formatted.text);
  const args = ['cli/utu.mjs', 'build', entry, '--out', out];
  let build = spawnSync('node', args, { encoding: 'utf8' });
  if (build.status !== 0 && /listen EPERM/.test(build.stderr)) {
    build = spawnSync('node', [...args, '--no-prerender'], { encoding: 'utf8' });
  }
  assert.equal(build.status, 0, build.stderr || build.stdout);
  try { browser = await chromium.launch(); }
  catch (error) {
    if (!/mach_port_rendezvous|Permission denied \(1100\)/.test(String(error))) throw error;
    console.log('Wutu components: Chromium blocked by the sandbox; browser assertions skipped');
  }
  if (browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.route('http://wutu.local/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = await fs.readFile(path.join(out, name));
    await route.fulfill({ body, contentType: name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'text/html' });
  });
  await page.goto('http://wutu.local/');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-utu-ready'));
  assert.equal(await page.title(), 'Wutu components');
  assert.equal(await page.locator('button').count(), 2);
  await page.locator('button').first().click();
  await page.getByText('Clicks: 1').waitFor();
  await page.getByText('Also: 1').waitFor();
  assert.deepEqual(errors, []);
  console.log('Wutu components: title, protocol list and reactive clicks passed');
  }
} finally {
  await browser?.close();
  await fs.rm(out, { recursive: true, force: true });
}
