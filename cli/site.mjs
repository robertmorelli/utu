#!/usr/bin/env node
// Site building, preview, and formatting shared by the utu CLI.
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { previewClient } from '../tools/dts/preview-client.mjs';
import { createSyntaxShape, formatUtu } from '../src/wutu/wutu-tooling.js';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';
import { prerender } from '../tools/dts/prerender.mjs';
import { loadNodeCompiler } from '../src/selfhost/node.js';
import { MODES } from '../src/selfhost/compiler.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export async function formatCommand(files, { check }) {
  if (!files.length) throw new Error('no files to format');
  const shape = createSyntaxShape(await loadNodeCompiler());
  for (const name of files) {
    let source;
    try { source = await fs.readFile(name, 'utf8'); }
    catch (error) {
      // (The other files are still formatted.)
      console.error(`utu: ${error.code === 'ENOENT' ? `no file ${name}` : `cannot read ${name}: ${error.message}`}`);
      process.exitCode = 1;
      continue;
    }
    const { text: formatted, refused } = await formatUtu(source, { shape });
    if (refused) {
      // A file is formatted only when its layout keeps its meaning.
      console.error(`${name}: left as is: ${refused}`);
      if (check) process.exitCode = 1;
      continue;
    }
    if (source === formatted) continue;
    if (check) {
      console.error(`${name}: needs formatting`);
      process.exitCode = 1;
    } else {
      await fs.writeFile(name, formatted);
      console.log(name);
    }
  }
}

function shellHtml(title, cssName) {
  return '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${escapeHtml(title)}</title>`
    + (cssName ? `<link rel="stylesheet" href="./${cssName}" data-wutu-style>` : '')
    + '<body><noscript>Interactive controls require JavaScript and WebAssembly.</noscript>'
    + '<script type="module" src="./app.js"></script></body></html>';
}

async function compileApp({ entry, title, mode, compiled }, directory) {
  const report = await buildBrowserApp({ entry, outDir: directory, ...MODES[mode], compiled, externalCss: true });
  await fs.writeFile(path.join(directory, 'index.html'), shellHtml(title, report.cssName));
  return report;
}

/**
 * Build (and prerender) into a fresh directory beside `out`, then move what
 * it made into out, all or none: each file first to a temporary beside its
 * place, then each renamed over its name. Out's other files stay.
 */
export async function buildCommand(app, { prerender: shouldPrerender, extra = [] }) {
  const candidate = path.join(path.dirname(app.out), `.${path.basename(app.out)}.building-${process.pid}`);
  if ((await fs.stat(app.out).catch(() => null))?.isDirectory() === false) throw new Error(`cannot write ${app.out}: a file is in the way`);
  try {
    const report = await compileApp(app, candidate);
    if (shouldPrerender) await prerender(candidate);
    // [file under app.out, contents]: made with the rest, moved with it.
    for (const [file, contents] of extra) await fs.writeFile(path.join(candidate, path.relative(app.out, file)), contents);
    await moveInto(candidate, app.out);
    // An earlier build's stylesheet, named by other bytes.
    for (const name of await fs.readdir(app.out)) if (/^app\.[0-9a-f]{10}\.css$/.test(name) && name !== report.cssName) await fs.rm(path.join(app.out, name), { force: true });
    console.log(`${app.out}: ${report.total.gzip} bytes gzip for JS + Wasm${report.css ? ' + CSS' : ''}`);
  } finally {
    await fs.rm(candidate, { recursive: true, force: true });
  }
}

/** Each file under `from` to its place under `to`, all or none; on a failure, `to` is as it was (the directories made for it removed). */
async function moveInto(from, to) {
  const files = (await fs.readdir(from, { recursive: true, withFileTypes: true })).filter(entry => !entry.isDirectory())
    .map(entry => path.relative(from, path.join(entry.parentPath, entry.name)));
  const made = [], moved = [];
  try {
    for (const name of files) {
      const target = path.join(to, name);
      if ((await fs.stat(target).catch(() => null))?.isDirectory()) throw new Error(`cannot write ${target}: it is a directory`);
      const first = await fs.mkdir(path.dirname(target), { recursive: true });
      if (first) made.push(first);
      const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
      await fs.rename(path.join(from, name), temp);
      moved.push([temp, target]);
    }
  } catch (error) {
    await Promise.all(moved.map(([temp]) => fs.rm(temp, { force: true })));
    for (const dir of made.reverse()) await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
  for (const [temp, target] of moved) await fs.rename(temp, target);
}

/**
 * Rebuild on change into a fresh directory and swap it in only after a
 * successful build, so the browser never sees a half-written app. Connected
 * pages reload through server-sent events and show build errors in place.
 */
export async function serveCommand(app, { port }) {
  const clients = new Set();
  let active = null, lastError = '', revision = 0, busy = false, again = false, timer;

  const send = (payload) => {
    for (const client of clients) client.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  async function rebuild() {
    if (busy) { again = true; return; }
    busy = true;
    const candidate = path.join(app.out, `.preview-${revision + 1}`);
    try {
      const report = await compileApp(app, candidate);
      const previous = active;
      active = candidate;
      revision++;
      lastError = '';
      send({ reload: true });
      console.log(`Built in ${report.compileMs}ms · ${report.total.gzip} bytes gzip`);
      if (previous) await fs.rm(previous, { recursive: true, force: true });
    } catch (error) {
      lastError = error.message;
      console.error(lastError);
      send({ error: lastError });
      await fs.rm(candidate, { recursive: true, force: true });
    } finally {
      busy = false;
      if (again) { again = false; void rebuild(); }
    }
  }

  const liveReload = `<script>(${previewClient.toString()})();</script>`;

  async function serveFile(pathname, res) {
    if (!active) throw new Error('no successful build yet');
    const file = path.resolve(active, '.' + decodeURIComponent(pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(active + path.sep)) throw new Error('outside the preview directory');
    let data = await fs.readFile(file);
    const extension = path.extname(file);
    if (extension === '.html') data = Buffer.from(data.toString().replace('</body>', liveReload + '</body>'));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
    res.end(data);
  }

  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/__wutu_events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(': connected\n\n');
      clients.add(res);
      if (lastError) res.write(`data: ${JSON.stringify({ error: lastError })}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }
    try {
      await serveFile(pathname, res);
    } catch {
      res.writeHead(404, { 'Content-Type': CONTENT_TYPES['.html'] }).end(`<body>Waiting for a successful build.${liveReload}</body>`);
    }
  });

  // Watch project imports as well as the entry file; ignore generated output and dependencies.
  const root = process.cwd();
  const isWatched = (name) => name?.endsWith('.utu')
    && !name.split(path.sep).some(part => IGNORED_DIRECTORIES.has(part))
    && !path.resolve(root, name).startsWith(app.out + path.sep);
  const watcher = watch(root, { recursive: true }, (_event, name) => {
    if (!isWatched(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 100);
  });

  process.once('SIGINT', async () => {
    watcher.close();
    server.close();
    for (const client of clients) client.end();
    if (active) await fs.rm(active, { recursive: true, force: true });
    process.exit(0);
  });

  // A server that cannot start (the port taken, say) ends the command.
  server.on('error', async error => {
    console.error(`cannot serve on 127.0.0.1:${port}: ${error.code === 'EADDRINUSE' ? 'the port is in use' : error.message}`);
    watcher.close();
    if (active) await fs.rm(active, { recursive: true, force: true });
    process.exit(1);
  });
  await rebuild();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Wutu preview: http://127.0.0.1:${server.address().port}`);
  });
}

