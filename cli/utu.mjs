#!/usr/bin/env node
// cli/utu.mjs — the utu command line, on the self-hosted compiler.
//
//   utu check <file.utu>                 report what is wrong
//   utu run <file.utu> [-O…]             build, then call main
//   utu test <file.utu> [-O…]            build the tests, then run each
//   utu build <file.utu> [-o dir] [-O…]  a Go package: NAME.wasm made Go by gosm, and its host
//     [--package name] [--host=js]       (package main runs it) … or NAME.mjs, a JavaScript loader
//   utu build-exe <file.utu> [-o out]    a standalone executable (bun)
//   utu lsp                              a language server, on stdin and stdout
//   utu grep <pattern> <paths…>          utu code by syntax, names, and types
//
// -Oz (the default) builds the smallest module, -O3 the fastest (it inlines,
// selfhost/inline.utu), -O0 the module as code generation leaves it. --safe
// keeps the checks wasm makes anyway. `display` and `graph` show stage 0's
// IR and graphs, so they use stage 0.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { formatDiagnostics } from '../src/selfhost/format.js';
import { glueSource, loaderSource } from '../src/selfhost/loader.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNTIME = path.join(ROOT, 'src', 'runtime', 'host-imports.js');

const STAGE0_COMMANDS = new Set(['display', 'display:tests', 'display:benches', 'display:modules', 'display:exports', 'display:debug', 'graph']);

async function main() {
  const [command, fileArg, ...rest] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help') usage(0);
  if (STAGE0_COMMANDS.has(command)) return (await import('./stage0.mjs')).main(command, fileArg, rest);
  if (command === 'lsp') return lsp();
  if (command === 'grep') return grepCommand(process.argv.slice(3));
  const commands = { check, run, test, build, 'build-exe': buildExe };
  if (!commands[command]) {
    console.error(`unknown command: ${command}`);
    usage(1);
  }
  if (!fileArg) {
    console.error('missing file');
    usage(1);
  }
  const file = path.resolve(fileArg);
  try {
    await fs.access(file);
  } catch {
    console.error(`${fileArg}: file not found`);
    process.exit(1);
  }
  const optimize = rest.includes('-O3') ? 'speed' : rest.includes('-O0') ? 'none' : 'size';
  const safe = rest.includes('--safe');
  const out = option(rest, '-o') ?? option(rest, '--out');
  const host = rest.includes('--host=js') ? 'js' : 'go';
  const pkg = option(rest, '--package');
  await commands[command](file, { optimize, safe, out, host, pkg, utu: await loadNodeCompiler() });
}

/** A file as the user would write it: relative to here, unless that is longer. */
function displayPath(key) {
  if (key.startsWith('std:')) return key;
  const relative = path.relative(process.cwd(), key);
  return relative.length < key.length ? relative : key;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Build, printing the diagnostics; exits on errors. */
async function buildOrExit(utu, file, options) {
  const result = await compileFile(utu, file, options);
  if (result.diagnostics.length) {
    const files = new Map(result.files.map(f => [f.key, f.text]));
    // In file order, then by position.
    const order = new Map(result.files.map((f, i) => [f.key, i]));
    const sorted = result.diagnostics.toSorted((a, b) => (order.get(a.file) ?? -1) - (order.get(b.file) ?? -1) || (a.start ?? 0) - (b.start ?? 0));
    // Colored as the compiler reads it: it still holds this build's program.
    const { highlighter } = await import('../src/selfhost/highlight.js');
    console.error(formatDiagnostics(sorted, files, {
      color: colored(process.stderr), relative: displayPath,
      highlight: highlighter(utu, result.files),
    }));
  }
  if (!result.wasm) process.exit(1);
  return result;
}

async function check(file, { utu }) {
  // Both builds: what the program exports, and its tests.
  await buildOrExit(utu, file, { target: 'normal' });
  await buildOrExit(utu, file, { target: 'test' });
  console.log('ok');
}

async function run(file, { utu, optimize, safe }) {
  const { wasm, spec } = await buildOrExit(utu, file, { optimize, safe });
  const { exports } = await instantiateNode(wasm, spec, { root: path.dirname(file) });
  if (typeof exports.main !== 'function') {
    console.error(`${displayPath(file)}: no \`export main\``);
    process.exit(1);
  }
  const result = await exports.main();
  if (result !== undefined) console.log(result);
}

async function test(file, { utu, optimize, safe }) {
  const { wasm, spec, tests } = await buildOrExit(utu, file, { target: 'test', optimize, safe });
  const { exports } = await instantiateNode(wasm, spec, { root: path.dirname(file) });
  const paint = (code, text) => colored(process.stdout) ? `\x1b[${code}m${text}\x1b[0m` : text;
  let failed = 0;
  for (const { export: name, name: title } of tests) {
    const started = performance.now();
    try {
      await exports[name]();
      console.log(`${paint('32', 'pass')} ${title} ${paint('2', `(${(performance.now() - started).toFixed(1)} ms)`)}`);
    } catch (error) {
      failed++;
      console.log(`${paint('31', 'FAIL')} ${title}: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
  console.log(`${tests.length - failed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

/** NAME.wasm and NAME.mjs: an ES module whose `exports` are the instance's. */
async function build(file, { utu, optimize, safe, out, host, pkg }) {
  const { wasm, spec } = await buildOrExit(utu, file, { optimize, safe });
  const name = path.basename(file, '.utu');
  const dir = path.resolve(out ?? '.');
  await fs.mkdir(dir, { recursive: true });
  if (host === 'go') return buildGo(file, { wasm, spec, name, dir, pkg });
  const glue = glueSource(spec);
  const { build: bundle } = await import('esbuild');
  const loader = loaderSource(spec, wasm, {
    runtime: RUNTIME, glue: glue ? './glue.mjs' : null, streaming: false,
    wasm: `await (typeof process === 'object' && process.versions?.node ? import('node:fs/promises').then(fs => fs.readFile(new URL(${JSON.stringify(`./${name}.wasm`)}, import.meta.url))) : fetch(new URL(${JSON.stringify(`./${name}.wasm`)}, import.meta.url)).then(r => r.arrayBuffer()))`,
  });
  // The loader bundled with the runtime pieces and the glue it imports.
  await bundle({
    stdin: { contents: loader, resolveDir: path.dirname(file), sourcefile: `${name}.mjs`, loader: 'js' },
    plugins: glue ? [virtualGlue(glue)] : [],
    outfile: path.join(dir, `${name}.mjs`), bundle: true, minify: true, format: 'esm', platform: 'neutral',
    target: 'es2022', legalComments: 'none', logLevel: 'error', external: ['node:*'],
  });
  await fs.writeFile(path.join(dir, `${name}.wasm`), wasm);
  const js = await fs.stat(path.join(dir, `${name}.mjs`));
  console.log(`${displayPath(path.join(dir, `${name}.wasm`))}  ${wasm.length} bytes`);
  console.log(`${displayPath(path.join(dir, `${name}.mjs`))}   ${js.size} bytes`);
}

/**
 * A Go package of the module: NAME.wasm, made Go by gosm (NAME_gosm.go), and
 * its host (host.go, and the runtime's utu_*.go), in package `pkg` (from
 * NAME by default). Package main is a program: it runs `export main`.
 * Without gosm, the module and its host, for gosm to make Go of later.
 */
async function buildGo(file, { wasm, spec, name, dir, pkg }) {
  const { goHostFiles, parseHostInterface, readSidecars, stdHostSites, wasmImportSignatures } = await import('../src/selfhost/go-host.js');
  const readDir = async (from, keep) => Object.fromEntries(await Promise.all((await fs.readdir(from)).filter(keep)
    .map(async f => [f, await fs.readFile(path.join(from, f), 'utf8')])));
  const std = path.join(ROOT, 'std');
  pkg ??= goPackageName(name);
  const wasmFile = path.join(dir, `${name}.wasm`);
  await fs.writeFile(wasmFile, wasm);
  console.log(`${displayPath(wasmFile)}  ${wasm.length} bytes`);

  const gosm = findGosm();
  let host = null, main = null;
  if (gosm) {
    // Not NAME_wasm.go: Go builds a file named so only for GOARCH=wasm.
    const out = path.join(dir, `${name}_gosm.go`);
    // Imports, host.go's, is the host: calls to it are direct, and inline.
    gosm.run(['-pkg', pkg, '-host-type', '*Imports', '-o', out, wasmFile]);
    host = parseHostInterface(gosm.run(['-emit-host', '-pkg', pkg, wasmFile]));
    if (pkg === 'main') {
      const found = (await fs.readFile(out, 'utf8')).match(/^func \(m \*Instance\) Main\(\)\s*([^{]*)\{/m);
      if (!found) {
        console.error(`${displayPath(file)}: package main runs \`export main\`, and there is none`);
        process.exit(1);
      }
      main = found[1].trim();
    }
    console.log(`${displayPath(out)}  (gosm)`);
  } else {
    console.error('utu build: no gosm (UTU_GOSM, `gosm` on PATH, or a checkout beside utu): the host is written for the module as it is, for gosm to make Go of');
  }
  let files;
  try {
    files = goHostFiles(spec, wasmImportSignatures(wasm), {
      pkg, source: path.basename(file), host, main,
      stdSites: stdHostSites(await readDir(std, f => f.endsWith('.utu'))),
      sidecars: readSidecars(await readDir(path.join(std, 'go'), f => f.endsWith('.go') && !f.endsWith('_test.go'))),
    });
  } catch (error) {
    console.error(`${displayPath(file)}: ${error.message}`);
    process.exit(1);
  }
  // Formatted, which checks the `@go` bodies are Go, when there is a gofmt.
  const formatted = spawnSync('gofmt', [], { input: files['host.go'], encoding: 'utf8' });
  if (formatted.status === 0) files['host.go'] = formatted.stdout;
  else if (!formatted.error) {
    console.error(`${displayPath(file)}: the Go host is not Go (an \`@go\` body?):\n${formatted.stderr.replaceAll('<standard input>', 'host.go')}`);
    process.exit(1);
  }
  for (const [f, text] of Object.entries(files)) await fs.writeFile(path.join(dir, f), text);
  console.log(`${displayPath(path.join(dir, 'host.go'))}  and ${Object.keys(files).length - 1} runtime files`);
  // A module of its own, when it is in none, that finds gosm's runtime.
  if (gosm?.dir && !(await inGoModule(dir))) {
    await fs.writeFile(path.join(dir, 'go.mod'), `module utu.local/${pkg === 'main' ? goPackageName(name) : pkg}\n\ngo 1.24\n\nrequire gosm v0.0.0\n\nreplace gosm => ${gosm.dir}\n`);
    console.log(`${displayPath(path.join(dir, 'go.mod'))}`);
  }
}

/**
 * gosm: UTU_GOSM (a checkout, or the command), `gosm` on PATH, or a
 * checkout beside utu. `run` runs it, and is what it prints; `dir` is the
 * checkout, when there is one (for a go.mod's replace).
 */
function findGosm() {
  const checkout = dir => {
    try { return fsSync.statSync(path.join(dir, 'cmd', 'gosm')).isDirectory() ? path.resolve(dir) : null; } catch { return null; }
  };
  const command = (cmd, args = [], cwd = undefined, dir = null) => ({
    dir,
    run(more) {
      const r = spawnSync(cmd, [...args, ...more], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
      if (r.error) throw r.error;
      if (r.status !== 0) {
        console.error(`gosm ${more.join(' ')}:\n${r.stderr}`);
        process.exit(1);
      }
      return r.stdout;
    },
  });
  const fromCheckout = dir => command('go', ['run', './cmd/gosm'], dir, dir);
  const env = process.env.UTU_GOSM;
  if (env) return checkout(env) ? fromCheckout(checkout(env)) : command(env);
  for (const bin of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(bin, 'gosm');
    try { fsSync.accessSync(candidate, fsSync.constants.X_OK); return command(candidate); } catch {}
  }
  const beside = checkout(path.join(ROOT, '..', 'gosm'));
  return beside ? fromCheckout(beside) : null;
}

/** Whether dir is in a Go module (a go.mod here or above). */
async function inGoModule(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { await fs.access(path.join(d, 'go.mod')); return true; } catch {}
    if (path.dirname(d) === d) return false;
  }
}

/** A Go package name from a file's: lower case, letters, digits, and underscores. */
function goPackageName(name) {
  const clean = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return /^[a-z_]/.test(clean) ? clean : `utu_${clean}`;
}

/** The glue module, given to esbuild without being written. */
function virtualGlue(source) {
  return {
    name: 'utu-glue',
    setup(build) {
      build.onResolve({ filter: /^\.\/glue\.mjs$/ }, args => ({ path: path.join(args.resolveDir, '__utu_glue.mjs'), namespace: 'utu-glue' }));
      build.onLoad({ filter: /.*/, namespace: 'utu-glue' }, args => ({ contents: source, loader: 'js', resolveDir: path.dirname(args.path) }));
    },
  };
}

/** A standalone executable: bun compiles the loader, the glue, and the module. */
async function buildExe(file, { utu, optimize, safe, out }) {
  const { wasm, spec } = await buildOrExit(utu, file, { optimize, safe });
  const target = path.resolve(out ?? path.basename(file, '.utu'));
  // In the project when it has dependencies, so an `@es` body's imports
  // resolve as its own source's would, and bun bundles them in.
  const dir = await buildDirectory(path.dirname(file));
  const glue = glueSource(spec);
  if (glue) await fs.writeFile(path.join(dir, 'glue.mjs'), glue);
  const loader = loaderSource(spec, wasm, {
    runtime: RUNTIME, glue: glue ? './glue.mjs' : null,
    wasm: `Uint8Array.from(atob(${JSON.stringify(Buffer.from(wasm).toString('base64'))}), c => c.charCodeAt(0))`,
  });
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `${loader}if (typeof exports.main === 'function') {\n  const result = await exports.main();\n  if (result !== undefined) console.log(result);\n}\n`);
  const result = spawnSync('bun', ['build', runner, '--compile', '--outfile', target], { cwd: process.cwd(), stdio: 'inherit' });
  await fs.rm(dir, { recursive: true, force: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.error(`wrote ${displayPath(target)}`);
}

async function buildDirectory(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    try {
      await fs.access(path.join(dir, 'node_modules'));
      const nested = path.join(dir, 'node_modules', '.utu', `exe-${process.pid}`);
      await fs.mkdir(nested, { recursive: true });
      return nested;
    } catch {}
    if (path.dirname(dir) === dir) return fs.mkdtemp(path.join(os.tmpdir(), 'utu-exe-'));
  }
}

/** The language server (src/selfhost/lsp.js), speaking LSP's framing on stdin and stdout. */
async function lsp() {
  const { createLanguageServer } = await import('../src/selfhost/lsp.js');
  const { nodeHost } = await import('../src/selfhost/node.js');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { existsSync } = await import('node:fs');
  const hosts = new Map();
  const write = message => {
    const body = Buffer.from(JSON.stringify(message));
    process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };
  const server = createLanguageServer({
    utu: await loadNodeCompiler(),
    // One host per directory: packages resolve from where the program is.
    hostFor: key => {
      const root = key.startsWith('std:') ? process.cwd() : path.dirname(key);
      if (!hosts.has(root)) hosts.set(root, nodeHost({ root }));
      return hosts.get(root);
    },
    toKey: uri => uri.startsWith('file:') ? fileURLToPath(uri) : uri,
    // The standard library's files, where this repository has them.
    toUri: key => {
      if (!key.startsWith('std:')) return pathToFileURL(key).href;
      const file = path.join(ROOT, 'std', `${key.slice(4)}.utu`);
      return existsSync(file) ? pathToFileURL(file).href : null;
    },
    send: write,
    log: text => process.stderr.write(`[utu lsp] ${text}\n`),
  });
  let buffer = Buffer.alloc(0);
  let pending = Promise.resolve();
  let shutDown = false;
  process.stdin.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const length = Number(/Content-Length: *(\d+)/i.exec(buffer.subarray(0, end).toString('ascii'))?.[1] ?? 0);
      if (buffer.length < end + 4 + length) return;
      const body = buffer.subarray(end + 4, end + 4 + length).toString('utf8');
      buffer = buffer.subarray(end + 4 + length);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'the message is not JSON' } });
        continue;
      }
      if (message?.method === 'shutdown') shutDown = true;
      // In order: an edit is seen before the questions after it.
      pending = pending
        .then(() => server.handle(message))
        .then(result => { if (result?.exit != null) process.exit(result.exit); })
        .catch(error => process.stderr.write(`[utu lsp] ${error?.stack ?? error}\n`));
    }
  });
  // The editor gone without asking: as `exit` would, after what is pending.
  process.stdin.on('end', () => pending.then(() => process.exit(shutDown ? 0 : 1)));
}

/**
 * `utu grep '$v.push($x)' src/ --where 'x: I32'`, `utu grep --refs name src/`:
 * each match as `file:line:col: line`, or JSON. Exits 1 when nothing matches.
 */
async function grepCommand(args) {
  const { grep } = await import('../src/selfhost/grep.js');
  const { nodeHost } = await import('../src/selfhost/node.js');
  const where = {};
  let references = null;
  let json = false;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--where') {
      const [name, ...type] = (args[++i] ?? '').split(':');
      where[name.trim().replace(/^\$/, '')] = type.join(':').trim();
    } else if (args[i] === '--refs') references = args[++i];
    else if (args[i] === '--json') json = true;
    else rest.push(args[i]);
  }
  const pattern = references ? null : rest.shift();
  if ((!pattern && !references) || !rest.length) {
    console.error("usage: utu grep <pattern> <paths…> [--where 'x: Type'] [--json]\n       utu grep --refs <name> <paths…>");
    process.exit(2);
  }
  const entries = [];
  const walk = async target => {
    const stat = await fs.stat(target);
    if (stat.isFile()) { if (target.endsWith('.utu')) entries.push(path.resolve(target)); return; }
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.startsWith('.')) continue;
      await walk(path.join(target, entry.name));
    }
  };
  for (const target of rest) {
    try {
      await walk(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.error(`utu grep: there is no ${target}`);
      process.exit(2);
    }
  }
  const hosts = new Map();
  const hostFor = file => {
    const root = path.dirname(file);
    if (!hosts.has(root)) hosts.set(root, nodeHost({ root }));
    return hosts.get(root);
  };
  const { matches, texts, error, skipped = [] } = await grep(await loadNodeCompiler(), entries, hostFor, { pattern, where, references });
  if (error) {
    console.error(error);
    process.exit(2);
  }
  for (const file of skipped) console.error(`${displayPath(file)}: skipped: it does not parse (utu check ${displayPath(file)})`);
  const color = colored(process.stdout);
  const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const located = matches.map(match => {
    const text = texts.get(match.at.file) ?? '';
    const lineStart = text.lastIndexOf('\n', match.at.start - 1) + 1;
    const line = text.slice(0, match.at.start).split('\n').length;
    const lineEnd = text.indexOf('\n', match.at.start);
    return { ...match, line, column: match.at.start - lineStart + 1, source: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd), lineStart };
  });
  if (json) {
    console.log(JSON.stringify(located.map(({ at, line, column, kind, declaration, bindings }) => ({
      file: at.file, line, column, start: at.start, end: at.end, kind, declaration, bindings,
    })), null, 2));
  } else {
    for (const m of located) {
      const from = m.at.start - m.lineStart;
      const to = Math.min(m.source.length, m.at.end - m.lineStart);
      const shown = `${m.source.slice(0, from)}${paint('1;31', m.source.slice(from, to))}${m.source.slice(to)}`.trim();
      const tag = m.kind ? ` ${paint('2', m.declaration ? `${m.kind.toLowerCase()} declared` : m.kind.toLowerCase())}` : '';
      console.log(`${paint('35', displayPath(m.at.file))}:${paint('32', m.line)}:${m.column}:${tag} ${shown}`);
    }
  }
  if (!matches.length) process.exitCode = 1;
}

/**
 * Whether to color what goes to `stream`: NO_COLOR (set, not empty) says
 * no, FORCE_COLOR says yes (unless it is `0` or `false`), else a terminal.
 */
function colored(stream) {
  if (process.env.NO_COLOR) return false;
  const force = process.env.FORCE_COLOR;
  if (force != null && force !== '') return force !== '0' && force !== 'false';
  return !!stream.isTTY;
}

function usage(code) {
  console.log(`usage: utu <command> <file.utu> [options]

  check <file>                 report what is wrong with the program
  run <file> [-O…]             build it, then call its main
  test <file> [-O…]            build its tests, then run each
  build <file> [-o dir] [-O…]  a Go package: NAME.wasm made Go by gosm, and its host
    [--package name]           the Go package (NAME by default); main is a program
    [--host=js]                NAME.mjs, a JavaScript loader, in place of the Go host
  build-exe <file> [-o out]    a standalone executable (needs bun)
  lsp                          a language server on stdin and stdout
  grep <pattern> <paths…>      code by its syntax and types: '$v.push($x)' [--where 'x: I32']
  grep --refs <name> <paths…>  a name's declaration and every use, by what it resolves to

  -Oz  the smallest module (the default)
  -O3  the fastest module
  -O0  the module as code generation leaves it
  --safe  keep the checks wasm makes anyway (Buffer indexing, a last alt arm, …)

  display[:tests|:benches|:modules|:exports|:debug] <file>, graph <file> [-o out.html]
                               stage 0's IR and graphs`);
  process.exit(code);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
