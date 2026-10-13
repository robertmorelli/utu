import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve('webdemo');
const server = http.createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const file = path.resolve(directory, name);
  if (!file.startsWith(directory + path.sep)) return response.writeHead(404).end();
  const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
  try { response.writeHead(200, { 'Content-Type': type }).end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('status').getByText('Preview ready').waitFor({ timeout: 30000 });
  const preview = page.frameLocator('#preview');
  await preview.getByRole('heading', { name: 'Hello, Wutu' }).waitFor();
  assert.match(await preview.locator('style').textContent(), /background:honeydew/);
  await preview.getByRole('button', { name: 'Click me' }).click();
  await preview.getByText('Clicks: 1').waitFor();
  const editor = page.getByRole('textbox', { name: 'Wutu source code' });
  const original = await editor.inputValue();
  await editor.fill(original.replace('"Hello, Wutu";', '"Hello, Wutu"'));
  await page.getByRole('status').getByText('Compile error').waitFor({ timeout: 30000 });
  assert.match(await page.locator('#diagnostics').textContent(), /expected ;/);
  await editor.fill(original);
  await page.getByRole('status').getByText('Preview ready').waitFor({ timeout: 30000 });
  console.log('Wutu playground render, interaction, diagnostics, and recovery passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
