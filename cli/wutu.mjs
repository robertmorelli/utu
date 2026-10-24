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
import { MODES } from '../src/selfhost/compiler.js';

const USAGE = `wutu format <files...> [--check]
wutu build <entry.utu> [--out dist/wutu] [--title Title] [--no-prerender] [-O small|fast|smallUnsafe|fastUnsafe|debug]
wutu dev <entry.utu> [--out dist/wutu] [--title Title] [--port 4176] [-O mode]

exit status: 0 done; 1 the program is wrong or the build failed; 2 wutu was run wrong`;

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

/** A mistake in how wutu was run: said with the usage, exit 2. */
class Usage extends Error {}

/** Each command's options: what each takes (a value, or none: true). */
const OPTIONS = {
  format: { '--check': true },
  build: { '--out': 'outputs', '--title': 'titles', '-O': 'build modes', '--no-prerender': true },
  dev: { '--out': 'outputs', '--title': 'titles', '-O': 'build modes', '--port': 'ports' },
};

function parseArgs(command, args) {
  const known = OPTIONS[command];
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-') && arg !== '-') {
      if (!Object.hasOwn(known, arg)) throw new Usage(`unknown option ${arg} for wutu ${command}`);
      if (known[arg] === true) { options[arg] = true; continue; }
      if (i + 1 >= args.length) throw new Usage(`${arg} needs a value`);
      if (options[arg] !== undefined) throw new Usage(`two ${known[arg]}: ${options[arg]}, ${args[i + 1]}`);
      options[arg] = args[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

async function formatCommand(files, { check }) {
  if (!files.length) throw new Usage('no files to format');
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

async function compileApp({ entry, parser, title, mode }, directory) {
  const report = await buildBrowserApp({ entry, outDir: directory, parser, ...MODES[mode] });
  await fs.writeFile(path.join(directory, 'index.html'), shellHtml(title));
  return report;
}

/**
 * Build (and prerender) into a fresh directory beside `out`, then move what
 * it made into out, all or none: each file first to a temporary beside its
 * place, then each renamed over its name. Out's other files stay.
 */
async function buildCommand(app, { prerender: shouldPrerender }) {
  const candidate = path.join(path.dirname(app.out), `.${path.basename(app.out)}.building-${process.pid}`);
  if ((await fs.stat(app.out).catch(() => null))?.isDirectory() === false) throw new Error(`cannot write ${app.out}: a file is in the way`);
  try {
    const report = await compileApp(app, candidate);
    if (shouldPrerender) await prerender(candidate);
    await moveInto(candidate, app.out);
    console.log(`${app.out}: ${report.total.gzip} bytes gzip for JS + Wasm`);
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

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') return console.log(USAGE);
  if (!Object.hasOwn(OPTIONS, command)) throw new Usage(`unknown command ${command}`);
  const { positional, options } = parseArgs(command, rest);
  if (command === 'format') return formatCommand(positional, { check: options['--check'] === true });
  if (positional.length > 1) throw new Usage(`extra argument ${positional[1]}: wutu ${command} takes one entry`);
  const entry = path.resolve(positional[0] ?? 'main.utu');
  const stat = await fs.stat(entry).catch(() => null);
  if (!stat) throw new Usage(`no file ${positional[0] ?? 'main.utu'}`);
  if (stat.isDirectory()) throw new Usage(`${positional[0]} is a directory`);
  const mode = options['-O'] ?? 'small';
  if (!Object.hasOwn(MODES, mode)) throw new Usage(`unknown build mode -O ${mode}: small, fast, smallUnsafe, fastUnsafe, debug`);
  const port = options['--port'] ?? '4176';
  // 0: any free port.
  if (command === 'dev' && !(/^\d+$/.test(port) && Number(port) <= 65535)) throw new Usage(`--port needs a port, 0 to 65535, got ${port}`);
  const app = {
    entry,
    out: path.resolve(options['--out'] ?? 'dist/wutu'),
    title: options['--title'] ?? path.basename(path.dirname(entry)),
    // Like `utu build`: small (checked) unless asked.
    mode,
    parser: await initParser({ wasmDir: fileURLToPath(new URL('../', import.meta.url)) }),
  };
  if (command === 'dev') return devCommand(app, { port: Number(port) });
  try {
    await buildCommand(app, { prerender: !options['--no-prerender'] });
  } finally {
    app.parser.delete();
  }
}

main().catch((error) => {
  console.error(error instanceof Usage ? `wutu: ${error.message}\n\n${USAGE}` : error.message);
  process.exitCode = error instanceof Usage ? 2 : 1;
});
