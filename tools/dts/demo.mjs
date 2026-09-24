#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildBrowserApp } from './build-app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'dist/browser-board');
const report = await buildBrowserApp({ entry: path.join(root, 'examples/browser-board/main.utu'), outDir });
for (const file of ['index.html', 'style.css']) {
  await fs.copyFile(path.join(root, 'examples/browser-board', file), path.join(outDir, file));
}
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--serve')) {
  const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
    '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/app.wasm': ['app.wasm', 'application/wasm'] };
  const server = http.createServer(async (req, res) => {
    const asset = assets[new URL(req.url, 'http://local').pathname];
    if (!asset) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': asset[1] }); res.end(await fs.readFile(path.join(outDir, asset[0]))); }
    catch { res.end(); }
  });
  server.listen(0, '127.0.0.1', () => console.log(`Demo: http://127.0.0.1:${server.address().port}/`));
}
