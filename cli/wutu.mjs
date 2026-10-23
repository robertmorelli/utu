#!/usr/bin/env node
// wutu — format, build, and preview Wutu browser apps.
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { previewClient } from '../tools/dts/preview-client.mjs';
import { formatUtu } from '../src/compiler/wutu-tooling.js';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';
import { prerender } from '../tools/dts/prerender.mjs';
import { initParser } from '../src/index.js';

const USAGE = `wutu format <files...> [--check]
wutu build <entry.utu> [--out dist/wutu] [--title Title] [--no-prerender]
wutu dev <entry.utu> [--out dist/wutu] [--port 4176]`;

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

function parseArgs(args) {
  const valueFlags = new Set(['--out', '--title', '--port']);
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (valueFlags.has(arg)) {
      if (i + 1 >= args.length) throw new Error(`${arg} needs a value`);
      options[arg] = args[++i];
    } else if (arg.startsWith('--')) {
      options[arg] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

async function formatCommand(files, { check }) {
  if (!files.length) throw new Error(`no files to format\n\n${USAGE}`);
  for (const name of files) {
    const source = await fs.readFile(name, 'utf8');
    const { text: formatted, refused } = formatUtu(source);
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

function shellHtml(title) {
  return '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${escapeHtml(title)}</title>`
    + '<body><noscript>Interactive controls require JavaScript and WebAssembly.</noscript>'
    + '<script type="module" src="./app.js"></script></body></html>';
}

async function compileApp({ entry, parser, title }, directory) {
  const report = await buildBrowserApp({ entry, outDir: directory, parser });
  await fs.writeFile(path.join(directory, 'index.html'), shellHtml(title));
  return report;
}

async function buildCommand(app, { prerender: shouldPrerender }) {
  const report = await compileApp(app, app.out);
  if (shouldPrerender) await prerender(app.out);
  console.log(`${app.out}: ${report.total.gzip} bytes gzip for JS + Wasm`);
}

/**
 * Rebuild on change into a fresh directory and swap it in only after a
 * successful build, so the browser never sees a half-written app. Connected
 * pages reload through server-sent events and show build errors in place.
 */
async function devCommand(app, { port }) {
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
    app.parser.delete();
    process.exit(0);
  });

  await rebuild();
  server.listen(Number(port ?? 4176), '127.0.0.1', () => {
    console.log(`Wutu preview: http://127.0.0.1:${server.address().port}`);
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, options } = parseArgs(rest);
  if (command === 'format') return formatCommand(positional, { check: options['--check'] === true });
  if (command !== 'build' && command !== 'dev') {
    console.log(USAGE);
    if (command && command !== '--help' && command !== '-h') process.exitCode = 1;
    return;
  }

  const entry = path.resolve(positional[0] ?? 'main.utu');
  const app = {
    entry,
    out: path.resolve(options['--out'] ?? 'dist/wutu'),
    title: options['--title'] ?? path.basename(path.dirname(entry)),
    parser: await initParser({ wasmDir: fileURLToPath(new URL('../', import.meta.url)) }),
  };
  if (command === 'dev') return devCommand(app, { port: options['--port'] });
  try {
    await buildCommand(app, { prerender: !options['--no-prerender'] });
  } finally {
    app.parser.delete();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
