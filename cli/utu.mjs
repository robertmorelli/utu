#!/usr/bin/env node
// cli/utu.mjs — the utu command line, on the self-hosted compiler.
//
//   utu check <file.utu>                 report what is wrong
//   utu run <file.utu> [-O…]             build, then call main
//   utu test <file.utu> [-O…]            build the tests, then run each
//   utu build <file.utu> [-o dir] [-O…]  NAME.wasm and NAME.mjs (its loader)
//   utu build-exe <file.utu> [-o out]    a standalone executable (bun)
//   utu lsp                              a language server, on stdin and stdout
//   utu grep <pattern> <paths…>          utu code by syntax, names, and types
//
// -Oz (the default) builds the smallest module, -O3 the fastest (it inlines,
// selfhost/inline.utu), -O0 the module as code generation leaves it. --safe
// keeps the checks wasm makes anyway. `display` and `graph` show stage 0's
// IR and graphs, so they use stage 0.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { formatDiagnostics, heading, notes, pen } from '../src/selfhost/format.js';
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
    const near = closest(command, [...Object.keys(commands), 'lsp', 'grep', ...STAGE0_COMMANDS]);
    // A file given without a command: it was meant for one.
    if (command.endsWith('.utu')) fail(`${command} is a file; say what to do with it`, 'unknown-command', [], `utu check ${command}`);
    fail(`${command} is not a utu command${near ? `; did you mean ${near}?` : ''}`, 'unknown-command',
      ['utu --help lists the commands.'], near && fileArg ? `utu ${near} ${[fileArg, ...rest].join(' ')}` : null);
  }
  if (!fileArg) fail(`utu ${command} needs a file`, 'missing-file', [], `utu ${command} <file.utu>`);
  const file = path.resolve(fileArg);
  let stat = null;
  try { stat = await fs.stat(file); } catch {}
  if (!stat) fail(`${fileArg} does not exist`, 'file-not-found');
  if (stat.isDirectory()) fail(`${fileArg} is a directory, not a .utu file`, 'not-a-file');
  const optimize = rest.includes('-O3') ? 'speed' : rest.includes('-O0') ? 'none' : 'size';
  const safe = rest.includes('--safe');
  const out = option(rest, '-o') ?? option(rest, '--out');
  await commands[command](file, { optimize, safe, out, utu: await loadNodeCompiler() });
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
  // Named functions, so a trap says which.
  const { wasm, spec } = await buildOrExit(utu, file, { optimize, safe, debugNames: true });
  const { exports } = await instantiateNode(wasm, spec, { root: path.dirname(file) });
  if (typeof exports.main !== 'function') fail(`${displayPath(file)} has no export main to run`, 'no-main', ['utu run calls export main; utu test runs the tests.']);
  let result;
  try {
    result = await exports.main();
  } catch (error) {
    trap(error, file);
  }
  if (result !== undefined) console.log(result);
}

async function test(file, { utu, optimize, safe }) {
  const { wasm, spec, tests } = await buildOrExit(utu, file, { target: 'test', optimize, safe, debugNames: true });
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
      const { title: what, frames } = trapText(error);
      const where = frames.length ? paint('2', `  in ${frames.map(f => f.fn).join(' ← ')}`) : '';
      console.log(`${paint('31', 'FAIL')} ${title}: ${what}${where}`);
    }
  }
  console.log(tests.length ? `${tests.length - failed} passed, ${failed} failed` : 'no tests: a test is test "name" { … }');
  if (failed) process.exitCode = 1;
}

/** NAME.wasm and NAME.mjs: an ES module whose `exports` are the instance's. */
async function build(file, { utu, optimize, safe, out }) {
  const { wasm, spec } = await buildOrExit(utu, file, { optimize, safe });
  const name = path.basename(file, '.utu');
  const dir = path.resolve(out ?? '.');
  await fs.mkdir(dir, { recursive: true });
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
  build <file> [-o dir] [-O…]  NAME.wasm, and NAME.mjs that loads it
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

/**
 * Report a problem with how utu was run, in the shape of every other problem
 * it reports, with the corrected command when there is one; then exit 1.
 */
function fail(title, code, list = [], command = null) {
  const ink = pen({ color: colored(process.stderr) });
  const lines = [...heading(ink, 'error', title, code)];
  if (list.length) lines.push('', ...notes(ink, list));
  if (command) lines.push('', `  ${ink.paint(ink.palette.add, `${ink.bold}try`)}   ${ink.paint(ink.palette.add, `$ ${command}`)}`);
  console.error(lines.join('\n'));
  process.exit(1);
}

/** The closest of `names` to a mistyped `word` (at most two edits away), or null. */
function closest(word, names) {
  const distance = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  };
  const ranked = names.map(n => [n, distance(word.toLowerCase(), n)]).sort((a, b) => a[1] - b[1]);
  const [best, second] = ranked;
  return best && best[1] <= 2 && (!second || second[1] > best[1]) ? best[0] : null;
}

// What the engine says when Wasm traps, in utu's terms.
const TRAPS = [
  [/^unreachable/, 'The program stopped: a fatal, a failed assert, or a failed check'],
  [/null (pointer|reference)|dereferencing a null/, 'A null value was used where a value was needed (orelse fatal, or a null reference)'],
  [/divide by zero|division by zero/, 'Integer division by zero'],
  [/remainder by zero/, 'Integer remainder by zero'],
  [/integer overflow|divide result unrepresentable/, 'Integer overflow: the result does not fit its type'],
  [/out of bounds/, 'An index is outside the array'],
  [/illegal cast|type incompatibility/, 'A value had the wrong type where it crossed into utu'],
  [/array (is )?too large|requested new array is too large/, 'An array of that size cannot be made'],
  [/Maximum call stack|stack overflow/i, 'The call stack ran out: recursion went too deep'],
];

/** A trap, or a JavaScript error from the host, as what happened and the utu functions it was in. */
function trapText(error) {
  const message = String(error?.message ?? error).split('\n')[0];
  const wasm = error instanceof WebAssembly.RuntimeError || /Maximum call stack/.test(message);
  const title = wasm ? (TRAPS.find(([pattern]) => pattern.test(message))?.[1] ?? message) : message;
  const frames = [];
  for (const line of String(error?.stack ?? '').split('\n')) {
    const at = line.match(/^\s*at (?:async )?(\S+) \(wasm:/) ?? line.match(/^\s*at (?:async )?(\S+) .*wasm-function/);
    // Not the engine's numbers, nor the test runner's own exports.
    if (at && !/^wasm-function|^__test_/.test(at[1])) frames.push({ fn: at[1].replace(/^[$]/, '') });
  }
  // Endless recursion: one frame, many times; say it once.
  const folded = frames.filter((f, i) => i === 0 || f.fn !== frames[i - 1].fn);
  return { title, frames: folded.slice(0, 12), wasm };
}

/** A trap in `utu run`: in the shape of every other problem, with the utu functions it was in. */
function trap(error, file) {
  const ink = pen({ color: colored(process.stderr) });
  const { title, frames, wasm } = trapText(error);
  const lines = [...heading(ink, wasm ? 'trap' : 'error', title, `${wasm ? 'trap' : 'uncaught-exception'} · ${displayPath(file)}`)];
  if (frames.length) lines.push('', ...frames.map(f => `  ${ink.paint(ink.palette.dim, 'in')} ${ink.bold}${f.fn}${ink.reset}`));
  console.error(lines.join('\n'));
  process.exit(1);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
