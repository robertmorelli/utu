import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wutu-fragments-'));
try {
  await fs.writeFile(path.join(dir, 'lazy.utu'), `using Browser from std:Browser
mod deferred {
    wn page() {
        p { "lazy first" }
        p { "lazy second" }
    }
}
`);
  await fs.writeFile(path.join(dir, 'main.utu'), `using Browser from std:Browser
using deferred lazy from "./lazy.utu"
struct State:
    | visible: Bool
    | reverse: Bool
let state: State = State { visible: false, reverse: false }
wn pair(n: I32) { input { .value = n.str() }; span { = n } }
wn island() {
    @island "details"
    if state.visible { em { "island first" }; em { "island second" } }
}
wn app() {
    @reactive
    button#toggle { "toggle"; on click { state.visible = not state.visible; wutu.invalidate("details") } }
    button#reverse { "reverse"; on click { state.reverse = not state.reverse } }
    for (if state.reverse { [2, 1] } else { [1, 2] }) |n| key n { |> { let result = pair(n); result } }
    |> island()
    if state.visible { b { "visible first" }; b { "visible second" } }
    section { width: { if state.reverse { "20px" } else { "10px" } }; |> deferred.page() }
}
main { Browser.document.body.append(app()) }
`);
  const out = path.join(dir, 'out');
  const built = spawnSync(process.execPath, ['cli/utu.mjs', 'build', path.join(dir, 'main.utu'), '--out', out], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /wutu:/); assert.match(html, /lazy second/); assert.match(html, /data-wutu-pending/);
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://fragments.test/**', async route => {
        const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
        await route.fulfill({ body: await fs.readFile(path.join(out, file)), contentType: file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      });
      await page.goto('http://fragments.test/');
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-utu-ready') && !document.documentElement.hasAttribute('data-wutu-loading'));
      assert.equal(await page.locator('input').count(), 2);
      assert.equal(await page.locator('section p').count(), 2);
      assert.equal(await page.locator('section').evaluate(node => node.style.width), '10px');
      assert.equal(await page.locator('[data-wutu-pending],[data-wutu-prerender]').count(), 0);
      await page.evaluate(() => { window.firstInput = document.querySelector('input'); window.firstInput.focus(); window.firstInput.setSelectionRange(0, 1); });
      await page.locator('#reverse').evaluate(button => button.click());
      assert.deepEqual(await page.evaluate(() => ({ same: document.querySelectorAll('input')[1] === window.firstInput, focused: document.activeElement === window.firstInput, selection: [window.firstInput.selectionStart, window.firstInput.selectionEnd] })), { same: true, focused: true, selection: [0, 1] });
      assert.equal(await page.locator('section').evaluate(node => node.style.width), '20px');
      await page.locator('#toggle').click();
      assert.equal(await page.locator('em').count(), 2); assert.equal(await page.locator('b').count(), 2);
      await page.locator('#toggle').click();
      assert.equal(await page.locator('em').count(), 0); assert.equal(await page.locator('b').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()}: fragment prerender, hydration, keyed focus/selection, empty islands, dynamic siblings and lazy multi-root output passed`);
    } finally { await browser.close(); }
  }
} finally { await fs.rm(dir, { recursive: true, force: true }); }
