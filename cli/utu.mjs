#!/usr/bin/env node
// cli/utu.mjs — the utu command line, on the self-hosted compiler.
//
//   utu check <file.utu>                 report what is wrong
//   utu run <file.utu> [-O mode]             build, then call main
//   utu test <file.utu> [-O mode]            build the tests, then run each
//   utu bench <file.utu> [-O mode]           build the benches, then time each
//   utu build <file.utu> [-o dir] [-O mode] [--source-map] [--blame] [--target browser|node]
//                                        NAME.wasm and NAME.mjs (its loader)
//   utu build-exe <file.utu> [-o out]    a standalone executable (bun)
//   utu lsp                              a language server, on stdin and stdout
//   utu grep <pattern> <paths…>          utu code by syntax, names, and types
//
// The build mode, `-O mode` (named as Zig names its own): small (the default)
// builds the smallest module, fast the fastest (it inlines,
// selfhost/inline.utu), both keeping the checks Wasm does not make itself (a
// Buffer's length, a last alt arm); smallUnsafe and fastUnsafe leave them
// out; debug is the module as code generation leaves it. `display` and
// `graph` show stage 0's IR and graphs, so they use stage 0.
//
// Source maps (src/selfhost/sourcemap.js): a trap in `run` or `test` is
// placed at its line, with the utu functions it was in. Debug's are exact;
// small's and fast's, best effort (code the optimizer made is placed at the
// code around it, coarser, never elsewhere); the unsafe modes have none.
// `build` writes NAME.wasm.map in debug, or with --source-map.

import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainThread, Worker, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { MODES } from '../src/selfhost/compiler.js';
import { formatDiagnostics, heading, notes, pen } from '../src/selfhost/format.js';
import { glueSource, loaderSource, moduleFunctions } from '../src/selfhost/loader.js';
import { sourceMapJson, wasmFrames, withMapUrl } from '../src/selfhost/sourcemap.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNTIME = path.join(ROOT, 'src', 'runtime', 'host-imports.js');

const STAGE0_COMMANDS = new Set(['display', 'display:tests', 'display:benches', 'display:modules', 'display:exports', 'display:debug', 'graph']);

async function main() {
  const [command, fileArg, ...rest] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help') usage(0);
  if (STAGE0_COMMANDS.has(command)) return (await import('./stage0.mjs')).main(command, [fileArg, ...rest].filter(a => a !== undefined), fail, notUtf8);
  if (command === 'lsp') {
    // (`--stdio`: what an editor's client may add.)
    const extra = [fileArg, ...rest].find(a => a !== undefined && a !== '--stdio');
    if (extra !== undefined) fail(extra.startsWith('-') ? `Unknown option ${extra}` : `Extra argument ${extra}`, extra.startsWith('-') ? 'unknown-option' : 'extra-argument', ['utu lsp takes nothing: it speaks on stdin and stdout.']);
    return lsp();
  }
  if (command === 'grep') return grepCommand(process.argv.slice(3));
  const commands = { check, run, test, bench, build, 'build-exe': buildExe };
  // (Own names only: `utu constructor` is no command.)
  if (!Object.hasOwn(commands, command)) {
    const near = closest(command, [...Object.keys(commands), 'lsp', 'grep', ...STAGE0_COMMANDS]);
    // A file given without a command: it was meant for one.
    if (command.endsWith('.utu')) fail(`No command for ${command}`, 'unknown-command', [], `utu check ${command}`);
    fail(`Unknown command ${command}${near ? `; did you mean ${near}?` : ''}`, 'unknown-command',
      [], near && fileArg ? `utu ${near} ${[fileArg, ...rest].join(' ')}` : null);
  }
  // Options anywhere: the build mode (-O small, the default; fast,
  // smallUnsafe, fastUnsafe, or debug), where build writes (-o), and one file.
  const args = [fileArg, ...rest].filter(arg => arg !== undefined);
  const given = [];
  const files = [];
  let out;
  // `--target node`: build bundles npm packages' Node builds, not their browser ones.
  let target;
  // `utu run FILE -- a b`: what follows -- is the program's (process.argv.slice(2)).
  let argv = [];
  // `--profile`: a profile build, sampled every `--interval` ms (src/runtime/profile.js).
  const ours = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
  const profile = ours.includes('--profile');
  let interval;
  // A second of an option that takes one value: which was meant?
  const once = (now, value, what) => { if (now !== undefined) fail(`Two ${what}: ${now}, ${value}`, 'unknown-option'); };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      if (command !== 'run') fail('-- is only for run', 'unknown-option', ['utu run FILE -- ARGS… gives the program ARGS as process.argv.slice(2).']);
      argv = args.slice(i + 1);
      break;
    }
    if (arg === '-O') given.push(args[++i] ?? '');
    else if (arg === '--profile') {
      if (command !== 'run') fail(`${arg} is only for run`, 'unknown-option', ['utu run FILE --profile samples the program and writes its profile.']);
    } else if (arg === '--interval') {
      const value = args[++i];
      if (!profile) fail(`${arg} is only with --profile`, 'unknown-option', [], `utu run ${files[0] ?? '<file.utu>'} --profile --interval ${value ?? '0.25'}`);
      once(interval, value, 'intervals');
      interval = Number(value);
      if (!(interval > 0)) fail(`--interval needs a time in ms, got ${value ?? 'nothing'}`, 'unknown-option', ['The sampler reads the stack every this many milliseconds (0.25 by default).']);
    } else if (arg === '-o' || arg === '--out') {
      const value = args[++i];
      const what = command === 'build-exe' ? 'file' : 'directory';
      if (!WRITES.has(command) && !(command === 'run' && profile)) fail(`${arg} is only for build and build-exe`, 'unknown-option', [`utu ${command} writes nothing.`]);
      if (value === undefined || value.startsWith('-')) fail(`${arg} needs a ${what}`, 'missing-output', [], `utu ${command} ${files[0] ?? '<file.utu>'} ${arg} <${what}>`);
      once(out, value, 'outputs');
      out = value;
    } else if (arg === '--target') {
      const value = args[++i];
      if (command !== 'build') fail(`${arg} is only for build`, 'unknown-option', ['utu build FILE --target node bundles npm packages for Node.']);
      if (value !== 'browser' && value !== 'node') fail(`--target needs browser or node, got ${value ?? 'nothing'}`, 'unknown-option', ['browser (the default) bundles npm packages\' browser builds, which Node runs too; node, their Node builds.']);
      once(target, value, 'targets');
      target = value;
    } else if (arg === '--blame') {
      if (command !== 'build') fail(`${arg} is only for build`, 'unknown-option', ['utu build FILE --blame writes NAME.blame.json and NAME.blame.html.']);
    } else if (arg === '--source-map') {
      if (command !== 'build') fail(`${arg} is only for build`, 'unknown-option', [`utu ${command} places traps by a map in every mode but the unsafe ones.`]);
    } else if (arg.startsWith('-') && arg !== '-') {
      fail(`Unknown option ${arg}`, 'unknown-option', ['-O small|fast|smallUnsafe|fastUnsafe|debug, -o dir, --source-map, --blame, --target browser|node, --profile [--interval ms]']);
    } else files.push(arg);
  }
  if (!files.length) fail('No file', 'missing-file', [], `utu ${command} <file.utu>`);
  if (files.length > 1) fail(`Extra argument ${files[1]}`, 'extra-argument', [`utu ${command} takes one file.`]);
  const file = path.resolve(files[0]);
  let stat = null;
  try { stat = await fs.stat(file); } catch {}
  if (!stat) fail(`No file ${files[0]}`, 'file-not-found');
  if (stat.isDirectory()) fail(`${files[0]} is a directory`, 'not-a-file');
  if (given.length > 1) fail(`Two build modes: ${given.join(', ')}`, 'build-mode');
  const mode = given[0] ?? 'small';
  if (!Object.hasOwn(MODES, mode)) {
    const near = closest(mode, Object.keys(MODES));
    fail(mode ? `Unknown build mode ${mode}${near ? `; did you mean ${near}?` : ''}` : '-O needs a build mode', 'build-mode',
      ['small, fast, smallUnsafe, fastUnsafe, debug']);
  }
  const { optimize, safe } = MODES[mode];
  // A map where the mode keeps one: always in debug, on asking in small and fast.
  // (Ours: what follows -- is the program's.)
  const asked = ours.includes('--source-map');
  if (asked && !safe) fail(`No source map in ${mode}`, 'source-map', ['The unsafe modes keep none; -O small, fast, or debug do.']);
  try {
    await commands[command](file, { optimize, safe, out, argv, sourceMap: mode === 'debug' || asked, blame: ours.includes('--blame'), target, profile, interval, utu: await loadNodeCompiler() });
  } catch (error) {
    // A place build cannot write (-o somewhere read-only, or under a file).
    if (!FS_REASONS[error?.code] || !error.path) throw error;
    fail(`cannot write ${displayPath(error.path)}: ${FS_REASONS[error.code]}`, 'write-failed', [`-o names where utu ${command} writes.`]);
  }
}

/** A file as the user would write it: relative to here, unless that is longer. */
function displayPath(key) {
  if (key.startsWith('std:')) return key;
  const relative = path.relative(process.cwd(), key);
  return relative.length < key.length ? relative : key;
}

/** The commands that write files (where -o says). */
const WRITES = new Set(['build', 'build-exe']);

/** Build, printing the diagnostics; exits on errors. */
async function buildOrExit(utu, file, options) {
  const result = await compileFile(utu, file, options).catch(error => {
    // A file of the program that cannot be read (no permission, say).
    if (!FS_REASONS[error?.code] || !error.path) throw error;
    fail(`cannot read ${displayPath(error.path)}: ${FS_REASONS[error.code]}`, 'read-failed');
  });
  if (deepens && result.diagnostics.some(d => d.code === 'nested-too-deeply')) throw new TooDeep();
  if (result.diagnostics.length) await report(utu, result, result.diagnostics);
  if (!result.wasm) process.exit(1);
  return result;
}

/** Write `diagnostics` (of the build `result`) to stderr, in file order, then by position. */
async function report(utu, result, diagnostics) {
  const files = new Map(result.files.map(f => [f.key, f.text]));
  const order = new Map(result.files.map((f, i) => [f.key, i]));
  const sorted = diagnostics.toSorted((a, b) => (order.get(a.file) ?? -1) - (order.get(b.file) ?? -1) || (a.start ?? 0) - (b.start ?? 0));
  // Colored as the compiler reads it: it still holds this build's program.
  const { highlighter } = await import('../src/selfhost/highlight.js');
  // All of it written before exiting: a pipe takes it in pieces.
  await written(process.stderr, `${formatDiagnostics(sorted, files, {
    color: colored(process.stderr), relative: displayPath,
    highlight: highlighter(utu, result.files),
  })}\n`);
}

/** A stage 0 view of a program with a file that is not UTF-8: the self-hosted compiler's "Not UTF-8", at the byte; exits 1. */
async function notUtf8(file) {
  const utu = await loadNodeCompiler();
  const result = await compileFile(utu, file, { target: 'normal' });
  const bad = result.diagnostics.filter(d => d.message === 'Not UTF-8');
  if (!bad.length) fail(`${displayPath(file)} is not UTF-8`, 'parse-error');
  await report(utu, result, bad);
  process.exit(1);
}

/** Write `text` to `stream`, resolving once the stream has taken it all. */
function written(stream, text) {
  return new Promise(resolve => stream.write(text, () => resolve()));
}

async function check(file, { utu }) {
  // Both builds: what the program exports, and its tests.
  await buildOrExit(utu, file, { target: 'normal' });
  await buildOrExit(utu, file, { target: 'test' });
  console.log('ok');
}

async function run(file, { utu, optimize, safe, argv, profile, interval = 0.25, out }) {
  // Profiled, on the stack a plain run has, so --profile changes no output but at
  // the edge: the instrumentation takes about 3100 frames of it (docs/profiling.md).
  // Named functions and a source map, so a trap says which and where.
  // An array main's result is read by the build's readers (`run`), to print as one.
  const built = await buildOrExit(utu, file, { optimize, safe, debugNames: true, sourceMap: safe, profile, run: true });
  const profiler = profile ? (await import('../src/runtime/profile.js')).createProfiler({ frames: built.frames, interval }) : null;
  // A global's initializer runs here, and may trap.
  // (It runs before the sampler can start: its profile is empty, but written.)
  const { exports, instance } = await instantiateNode(built.wasm, built.spec, { root: path.dirname(file), profiler })
    .catch(async error => {
      if (profiler) await writeProfile(file, profiler, out);
      return trap(error, file, built, utu);
    });
  if (typeof exports.main !== 'function') fail(`No export main in ${displayPath(file)}`, 'no-main');
  // A main with parameters is for a host that passes them; run passes none.
  // (The Wasm function's own length: Bun's WebAssembly.promising wrapper says 1.)
  if (instance.exports.main.length > 0) {
    const params = /export\s+main\s*\(([^)]*)\)/.exec(await fs.readFile(file, 'utf8'))?.[1].trim();
    fail(`main takes ${params ? `(${params})` : `${exports.main.length} arguments`}, but utu run calls it with none`, 'main-arguments',
      ['Give main no parameters to run it, or call it from JavaScript (utu build).']);
  }
  // The program's arguments where a built one finds them: process.argv.slice(2).
  process.argv = [process.argv[0], file, ...argv];
  // The profile, written once: after main, or before a trap's exit (main's, or a callback's).
  let profiled = null;
  const profileOnce = () => (profiler ? (profiled ??= writeProfile(file, profiler, out)) : null);
  // A callback's trap, after main returned (a `.then`'s, a timer's): placed as main's are.
  // (Bun ends with 0 if the handler's exit comes after an await: the code is set first.)
  // The first only: reporting one that fails (stderr closed) is not reported again.
  let failing = false;
  const later = async error => {
    process.exitCode = 1;
    if (failing) return;
    failing = true;
    await profileOnce();
    return trap(error, file, built, utu);
  };
  process.on('uncaughtException', later);
  process.on('unhandledRejection', later);
  let result;
  await profiler?.start();
  try {
    result = await exports.main();
  } catch (error) {
    // (What ran until the trap is still a profile.)
    await profileOnce();
    await trap(error, file, built, utu);
  }
  await profileOnce();
  if (result !== undefined) console.log(built.array ? shown(exports, built.array, result) : result);
}

/**
 * An array, tuple, or handle main's result as text: `[[1, 2], []]`,
 * `["a", "b\"c"]`, `[1, P]`, null as `null`, any other value of the innermost
 * type by that type's name (`P`). Read by the build's exports `run:len:k` and
 * `run:at:k`, for level k.
 */
function shown(exports, { levels, leaf }, value, k = 0) {
  if (value === null) return 'null';
  if (k === levels && Array.isArray(value)) {
    // A tuple: leaf is `.{T1, T2}`; split at its top-level commas.
    const types = [];
    let depth = 0, from = 2;
    for (let i = 2; i < leaf.length - 1; i++) {
      depth += '([{'.includes(leaf[i]) ? 1 : ')]}'.includes(leaf[i]) ? -1 : 0;
      if (!depth && leaf[i] === ',') types.push(leaf.slice(from, i).trim()), from = i + 1;
    }
    types.push(leaf.slice(from, -1).trim());
    return `[${value.map((v, i) => shown(exports, { levels, leaf: types[i] ?? '' }, v, k)).join(', ')}]`;
  }
  if (k === levels) return typeof value === 'string' ? JSON.stringify(value)
    : typeof value === 'object' || typeof value === 'function' ? leaf.replace(/^\?/, '') : String(value);
  const items = [];
  for (let i = 0, n = exports[`run:len:${k}`](value); i < n; i++) items.push(shown(exports, { levels, leaf }, exports[`run:at:${k}`](value, i), k + 1));
  return `[${items.join(', ')}]`;
}

/** Stop sampling; write NAME.folded, NAME.speedscope.json, and NAME.flame.html (in `out`), and the top functions to stderr. */
async function writeProfile(file, profiler, out) {
  const { profileReport } = await import('../src/runtime/profile.js');
  const name = path.basename(file, '.utu');
  const report = profileReport(await profiler.stop(), profiler.frames, { title: `${name}.utu` });
  const dir = path.resolve(out ?? '.');
  await fs.mkdir(dir, { recursive: true });
  const outputs = [[`${name}.folded`, report.folded], [`${name}.speedscope.json`, report.speedscope], [`${name}.flame.html`, report.html]];
  for (const [base, text] of outputs) await fs.writeFile(path.join(dir, base), text);
  const dim = text => colored(process.stderr) ? `\x1b[2m${text}\x1b[0m` : text;
  const share = n => report.samples ? `${(100 * n / report.samples).toFixed(1)}%` : '-';
  const place = new Map(profiler.frames.map(f => [f.name, f.file ? `${displayPath(f.file)}:${f.line}` : '']));
  const lines = [`profile: ${report.samples} samples over ${(report.elapsed / 1000).toFixed(2)} s${report.dropped ? `, ${report.dropped} dropped` : ''}`];
  lines.push(dim('   self   total  function'));
  for (const row of report.top.slice(0, 10)) {
    lines.push(`${share(row.self).padStart(7)} ${share(row.total).padStart(7)}  ${row.name}${place.get(row.name) ? dim(`  ${place.get(row.name)}`) : ''}`);
  }
  lines.push(dim(`wrote ${outputs.slice(0, 2).map(([base]) => displayPath(path.join(dir, base))).join(', ')}`));
  lines.push(`flame graph: ${displayPath(path.join(dir, outputs[2][0]))}`);
  await written(process.stderr, `${lines.join('\n')}\n`);
}

async function test(file, { utu, optimize, safe }) {
  const built = await buildOrExit(utu, file, { target: 'test', optimize, safe, debugNames: true, sourceMap: safe });
  const { wasm, spec, tests, map } = built;
  const { exports } = await instantiateNode(wasm, spec, { root: path.dirname(file) })
    .catch(error => trap(error, file, built, utu));
  const paint = (code, text) => colored(process.stdout) ? `\x1b[${code}m${text}\x1b[0m` : text;
  const report = (title, error, times = 1) => {
    const { title: what, frames, at } = trapText(error, map);
    const place = at?.entry?.file ? paint('2', `  at ${placeText(at.entry)}`) : '';
    const where = frames.length ? paint('2', `  in ${frames.map(f => f.fn).join(' ← ')}`) : '';
    console.log(`${paint('31', 'FAIL')} ${title}: ${what}${times > 1 ? ` (${times} times)` : ''}${place}${where}`);
  };
  const strays = strayErrors();
  let failed = 0;
  let uncaught = 0;
  // Each distinct error once, with how often it came; the first of a passing test's fails it.
  const reportStrays = (failing = false) => {
    const { groups, more } = strays.take();
    for (const { error, during, times } of groups) report(during ?? 'after tests', error, times);
    for (const [during, n] of more) console.log(`${paint('31', 'FAIL')} ${during ?? 'after tests'}: and ${n} more`);
    uncaught += groups.reduce((n, g) => n + g.times, 0) + [...more.values()].reduce((a, b) => a + b, 0) - (failing ? 1 : 0);
  };
  for (const { export: name, name: title } of tests) {
    const started = performance.now();
    strays.running = title;
    try {
      await settled(exports[name](), TEST_TIMEOUT_MS);
      const ms = performance.now() - started;
      // What it scheduled for now runs (and throws) before the next test.
      await nextTask();
      strays.running = null;
      if (strays.count) {
        failed++;
        reportStrays(true);
        continue;
      }
      console.log(`${paint('32', 'pass')} ${title} ${paint('2', `(${ms.toFixed(1)} ms)`)}`);
    } catch (error) {
      failed++;
      report(title, error);
      await nextTask();
    }
    strays.running = null;
    reportStrays();
  }
  await drain();
  reportStrays();
  const summary = tests.length ? `${tests.length - failed} passed, ${failed} failed` : 'No tests';
  await written(process.stdout, `${summary}${uncaught ? `, ${uncaught} uncaught error${uncaught > 1 ? 's' : ''}` : ''}\n`);
  process.exit(failed || uncaught ? 1 : 0);
}

/**
 * Errors nothing awaited (a callback's, thrown later), each with the test or
 * bench `running` when it came: it fails that one, or is one more failure.
 */
function strayErrors() {
  // By test and text: the first error of each and a count (a callback can throw millions);
  // past STRAY_KINDS texts, a count by test alone.
  let groups = new Map();
  let more = new Map();
  const strays = {
    running: null,
    count: 0,
    take() {
      const taken = { groups: [...groups.values()], more };
      groups = new Map();
      more = new Map();
      strays.count = 0;
      return taken;
    },
  };
  const add = error => {
    const during = strays.running;
    const key = `${during}\0${valueText(error)}`;
    const group = groups.get(key);
    strays.count++;
    if (group) group.times++;
    else if (groups.size < STRAY_KINDS) groups.set(key, { error, during, times: 1 });
    else more.set(during, (more.get(during) ?? 0) + 1);
  };
  process.on('uncaughtException', add);
  process.on('unhandledRejection', add);
  return strays;
}

/** How many distinct stray errors are kept (and shown) at a time. */
const STRAY_KINDS = 20;

/**
 * After the last test or bench: until nothing but the runner is left (its
 * callbacks have thrown, or not), at most DRAIN_MS; then the run ends,
 * whatever is still pending (an interval would keep it alive).
 */
const drain = () => settled(new Promise(() => {}), DRAIN_MS).catch(() => {});

/** After the callbacks already due (a `setTimeout(f, 0)`'s). */
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

/** A test's run, or why it never ended: the event loop emptied while it waited, or `ms` went by. */
function settled(result, ms) {
  let drained, timer;
  const stuck = new Promise((_, reject) => {
    // (Bun runs no promise job after beforeExit: a task, then.)
    drained = () => setImmediate(() => reject(new Error('Never settled: nothing left to wait for')));
    process.once('beforeExit', drained);
    timer = setTimeout(() => reject(new Error(`No result after ${ms / 1000} s`)), ms);
    timer.unref();
  });
  return Promise.race([result, stuck]).finally(() => {
    process.off('beforeExit', drained);
    clearTimeout(timer);
  });
}

/** How long a test may wait (on a timer, say) before it fails. */
const TEST_TIMEOUT_MS = 10000;
/** How long after the last test its callbacks may still throw, if they keep the event loop busy. */
const DRAIN_MS = 2000;

/**
 * Each bench, timed: `__bench_k(n)` runs its setup once and its measured
 * block n times. It runs for BENCH_WARMUP_MS first (the engine compiles
 * hot code again, optimized); then n doubles until a run takes
 * BENCH_SAMPLE_MS, and SAMPLES runs are timed, less the median of runs with
 * n = 0 (the setup alone). Prints the median time per iteration.
 */
async function bench(file, { utu, optimize, safe }) {
  const { wasm, spec, benches } = await buildOrExit(utu, file, { target: 'bench', optimize, safe, debugNames: true });
  if (!benches.length) {
    console.log('No benches');
    return;
  }
  const { exports } = await instantiateNode(wasm, spec, { root: path.dirname(file) });
  // A run that awaits ends as a test must (see @settled).
  const run = (f, n) => {
    const result = f(n);
    return typeof result?.then === 'function' ? settled(result, TEST_TIMEOUT_MS) : result;
  };
  const time = async (f, n) => {
    const started = performance.now();
    await run(f, n);
    return performance.now() - started;
  };
  const median = values => values.toSorted((a, b) => a - b)[values.length >> 1];
  const rows = [];
  const strays = strayErrors();
  let failed = false;
  const fail = (title, error, times = 1) => {
    rows.push([title, `FAIL: ${trapText(error).title}${times > 1 ? ` (${times} times)` : ''}`, '']);
    failed = true;
  };
  // A bench's setup runs many times: each distinct stray error is one row.
  const reportStrays = () => {
    const { groups, more } = strays.take();
    for (const { error, during, times } of groups) fail(during ?? 'after benches', error, times);
    for (const [during, n] of more) rows.push([during ?? 'after benches', `FAIL: and ${n} more`, '']);
  };
  for (const { export: name, name: title } of benches) {
    const f = exports[name];
    strays.running = title;
    try {
      const warm = performance.now();
      while (performance.now() - warm < BENCH_WARMUP_MS) await run(f, 1);
      let n = 1;
      while (n < 2 ** 30 && await time(f, n) < BENCH_SAMPLE_MS) n *= 2;
      const runs = [];
      const setups = [];
      for (let k = 0; k < SAMPLES; k++) {
        setups.push(await time(f, 0));
        runs.push(await time(f, n));
      }
      const per = Math.max(0, median(runs) - median(setups)) / n;
      await nextTask();
      if (!strays.count) rows.push([title, duration(per), `${SAMPLES} × ${n}`]);
    } catch (error) {
      fail(title, error);
      await nextTask();
    }
    strays.running = null;
    reportStrays();
  }
  await drain();
  reportStrays();
  const header = ['bench', 'median', 'iterations'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(row => row[i].length)));
  const line = row => row.map((cell, i) => i === 1 ? cell.padStart(widths[i]) : cell.padEnd(widths[i])).join('  ').trimEnd();
  const dim = text => colored(process.stdout) ? `\x1b[2m${text}\x1b[0m` : text;
  await written(process.stdout, `${[dim(line(header)), ...rows.map(line)].join('\n')}\n`);
  // Done, whatever a bench left running.
  process.exit(failed ? 1 : 0);
}

const BENCH_WARMUP_MS = 100;
const BENCH_SAMPLE_MS = 20;
const SAMPLES = 11;

/** A time per iteration in milliseconds, in the unit that suits it. */
function duration(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  if (ms >= 1e-3) return `${(ms * 1e3).toFixed(2)} µs`;
  return `${(ms * 1e6).toFixed(2)} ns`;
}

/** NAME.wasm and NAME.mjs: an ES module whose `exports` are the instance's. */
async function build(file, { utu, optimize, safe, out, sourceMap, blame, target }) {
  const built = await buildOrExit(utu, file, { optimize, safe, sourceMap, blame });
  const { spec } = built;
  const name = path.basename(file, '.utu');
  const dir = path.resolve(out ?? '.');
  // What build writes, as [file, contents]: all of it, or (on a failure) none.
  const outputs = [];
  // The map beside the module, which names it (devtools read it).
  let wasm = built.wasm;
  if (built.map) {
    const texts = new Map(built.files.map(f => [f.key, f.text]));
    const relative = key => key.startsWith('std:') ? key : path.relative(dir, key).split(path.sep).join('/');
    outputs.push([path.join(dir, `${name}.wasm.map`), sourceMapJson(built.map, { file: `${name}.wasm`, relative, texts })]);
    wasm = withMapUrl(wasm, `${name}.wasm.map`);
  }
  const glue = glueSource(spec, wasm);
  const { build: bundle } = await import('esbuild');
  const loader = loaderSource(spec, wasm, {
    runtime: RUNTIME, glue: glue ? './glue.mjs' : null, streaming: false,
    // Node's fetch reads no file: URL.
    wasm: `await (url => globalThis.process?.versions?.node ? import('node:fs/promises').then(fs => fs.readFile(url)) : fetch(url).then(r => r.arrayBuffer()))(new URL(${JSON.stringify(`./${name}.wasm`)}, import.meta.url))`,
  });
  // The loader bundled with the runtime pieces and the glue it imports.
  const bundled = await bundle({
    // (Not named NAME.mjs: esbuild refuses an output that is its input.)
    stdin: { contents: loader, resolveDir: path.dirname(file), sourcefile: '<utu loader>', loader: 'js' },
    plugins: glue ? [virtualGlue(glue)] : [],
    // An npm package's browser build (package.json's "browser" field or
    // condition) unless --target node: it runs in Node too, where a Node
    // build does not run in a browser (nanoid's needs Buffer).
    outfile: path.join(dir, `${name}.mjs`), bundle: true, minify: optimize !== 'none', format: 'esm', platform: target ?? 'browser',
    target: 'es2022', legalComments: 'none', logLevel: 'error', external: ['node:*'],
    // Written below, with the rest.
    write: false,
  });
  const js = bundled.outputFiles[0].contents;
  outputs.push([path.join(dir, `${name}.mjs`), js], [path.join(dir, `${name}.wasm`), wasm]);
  const top = built.blame ? await blameOutputs(built, wasm, dir, name, outputs) : null;
  await fs.mkdir(dir, { recursive: true });
  await writeAll(outputs);
  console.log(`${displayPath(path.join(dir, `${name}.wasm`))}  ${wasm.length} bytes`);
  console.log(`${displayPath(path.join(dir, `${name}.mjs`))}   ${js.length} bytes`);
  if (built.map) console.log(displayPath(path.join(dir, `${name}.wasm.map`)));
  if (top) console.log(top);
}

/** NAME.blame.json and NAME.blame.html (to `outputs`): each byte of the module on its source (src/selfhost/blame.js); returns what to print, the top. */
async function blameOutputs(built, wasm, dir, name, outputs) {
  const B = await import('../src/selfhost/blame.js');
  const blamed = B.blameModule(wasm, built.blame);
  B.checkTiling(blamed.records, wasm.length);
  const rep = B.report({ wasm, tables: built.blame, blamed, compressed: await B.estimateCompressed(wasm), glue: B.blameGlue(built.spec, blamed.esPlaces), name: `${name}.wasm` });
  outputs.push([path.join(dir, `${name}.blame.json`), JSON.stringify(rep)]);
  outputs.push([path.join(dir, `${name}.blame.html`), B.blameHtml(rep, new Map(built.files.map(f => [f.key, f.text])), { relative: displayPath })]);
  return `${displayPath(path.join(dir, `${name}.blame.json`))}\n${displayPath(path.join(dir, `${name}.blame.html`))}\n\n${B.formatTop(rep, { relative: displayPath })}`;
}

/**
 * Write each [file, contents] of `outputs`, all or none (as far as a file
 * system allows): each to a temporary file beside it, then each renamed
 * over its name. An error names the file that could not be written.
 */
async function writeAll(outputs) {
  const temps = [];
  try {
    for (const [file, data] of outputs) {
      // (A rename would put a file in a directory's place, or fail later.)
      if ((await fs.stat(file).catch(() => null))?.isDirectory()) throw Object.assign(new Error(`${file} is a directory`), { code: 'EISDIR', path: file });
      const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
      temps.push(temp);
      await fs.writeFile(temp, data).catch(error => { throw Object.assign(error, { path: file }); });
    }
    for (const [i, [file]] of outputs.entries()) await fs.rename(temps[i], file).catch(error => { throw Object.assign(error, { path: file }); });
  } finally {
    await Promise.all(temps.map(temp => fs.rm(temp, { force: true })));
  }
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
  // The executable calls main: without one it would do nothing (utu run says so too).
  if (!moduleFunctions(wasm).includes('main')) {
    fail(`No export main in ${displayPath(file)}`, 'no-main', ['An executable runs main; utu build makes a module for a library.']);
  }
  const target = path.resolve(out ?? path.basename(file, '.utu'));
  // Not over a directory, nor a file that is not to be written (bun would replace it).
  const there = await fs.stat(target).catch(() => null);
  if (there?.isDirectory()) throw Object.assign(new Error(), { code: 'EISDIR', path: target });
  if (there) await fs.access(target, fsConstants.W_OK).catch(error => { throw Object.assign(error, { path: target }); });
  // In the project when it has dependencies, so an `@es` body's imports
  // resolve as its own source's would, and bun bundles them in.
  const dir = await buildDirectory(path.dirname(file));
  const glue = glueSource(spec, wasm);
  if (glue) await fs.writeFile(path.join(dir, 'glue.mjs'), glue);
  const loader = loaderSource(spec, wasm, {
    runtime: RUNTIME, glue: glue ? './glue.mjs' : null,
    wasm: `Uint8Array.from(atob(${JSON.stringify(Buffer.from(wasm).toString('base64'))}), c => c.charCodeAt(0))`,
  });
  const runner = path.join(dir, 'runner.mjs');
  // A main that returns I32 gives the exit status; any other result is printed.
  const status = /export\s+main\s*\([^)]*\)\s*I32\b/.test(await fs.readFile(file, 'utf8'));
  const finish = status ? 'process.exitCode = result' : 'if (result !== undefined) console.log(result)';
  await fs.writeFile(runner, `${loader}if (typeof exports.main === 'function') {\n  const result = await exports.main();\n  ${finish};\n}\n`);
  const result = spawnSync('bun', ['build', runner, '--compile', '--outfile', target], { cwd: process.cwd(), stdio: 'inherit' });
  await fs.rm(dir, { recursive: true, force: true });
  if (result.error?.code === 'ENOENT') fail('bun was not found', 'no-bun', ['build-exe compiles with bun: install it (https://bun.sh), or put it on PATH.']);
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
  const { nodeHost, utuFiles } = await import('../src/selfhost/node.js');
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
    // A standard library file is its std: module (as a program importing it sees it).
    toKey: uri => {
      if (!uri.startsWith('file:')) return uri;
      const file = fileURLToPath(uri);
      const std = path.relative(path.join(ROOT, 'std'), file);
      return /^[A-Za-z]\w*\.utu$/.test(std) ? `std:${std.slice(0, -4)}` : file;
    },
    // The standard library's files, where this repository has them.
    toUri: key => {
      // (A key that is a URI, `untitled:…`, is its own.)
      if (!key.startsWith('std:')) return /^[a-z][\w+.-]+:/i.test(key) ? key : pathToFileURL(key).href;
      const file = path.join(ROOT, 'std', `${key.slice(4)}.utu`);
      return existsSync(file) ? pathToFileURL(file).href : null;
    },
    send: write,
    // The .utu files under the workspace's folders: what may import a file renamed.
    listFiles: async dirs => utuFiles(dirs),
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
      const hole = name.trim().replace(/^\$/, '');
      if (!hole || !type.join(':').trim()) {
        console.error(`utu grep: --where needs a name and a type: --where '${hole || 'x'}: I32'`);
        process.exit(2);
      }
      // One type a hole: a second would only say which one wins.
      if (hole in where) {
        console.error(`utu grep: --where gives $${hole} twice`);
        process.exit(2);
      }
      where[hole] = type.join(':').trim();
    } else if (args[i] === '--refs') {
      references = args[++i];
      if (!references?.trim()) {
        console.error('utu grep: --refs needs a name');
        process.exit(2);
      }
    }
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
  const { matches, texts, error, skipped = [], unmatched = [] } = await grep(await loadNodeCompiler(), entries, hostFor, { pattern, where, references });
  if (error) {
    console.error(error);
    process.exit(2);
  }
  for (const file of skipped) console.error(`${displayPath(file)}: skipped: it does not parse (utu check ${displayPath(file)})`);
  // A type no candidate had: likely misspelled, or not a type at all.
  for (const { hole, type, seen } of unmatched) {
    console.error(`utu grep: no $${hole} has type ${type}${seen.length ? ` (they have ${seen.slice(0, 6).join(', ')}${seen.length > 6 ? ', …' : ''})` : ''}`);
  }
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
  // In the worker (see STACK_MB), the terminal is the main thread's.
  if (!isMainThread && workerData?.tty) return workerData.tty[stream === process.stdout ? 'stdout' : 'stderr'];
  return !!stream.isTTY;
}

function usage(code) {
  console.log(`usage: utu <command> <file.utu> [options]

  check <file>                 report what is wrong with the program
  run <file> [-O mode] [-- args]  build it, then call its main
    [--profile [--interval ms] [-o dir]]  sampled: NAME.folded, NAME.speedscope.json, NAME.flame.html
  test <file> [-O mode]           build its tests, then run each
  bench <file> [-O mode]          build its benches, then time each (median per iteration)
  build <file> [-o dir] [-O mode] NAME.wasm, and NAME.mjs that loads it
    [--source-map]             and NAME.wasm.map (always in debug)
    [--blame]                  and NAME.blame.json, NAME.blame.html: each byte on its source
    [--target browser|node]    npm packages' browser builds (the default), or Node's
  build-exe <file> [-o out]    a standalone executable (needs bun)
  lsp                          a language server on stdin and stdout
  grep <pattern> <paths…>      code by its syntax and types: '$v.push($x)' [--where 'x: I32']
  grep --refs <name> <paths…>  a name's declaration and every use, by what it resolves to

  -O small        the smallest module (the default)
  -O fast         the fastest module: it inlines
  -O smallUnsafe  small, without the checks Wasm does not make itself
  -O fastUnsafe   fast, without them (Buffer indexing, a last alt arm, …)
  -O debug        the module as code generation leaves it, checked

  display[:tests|:benches|:modules|:exports|:debug] <file>, graph <file> [-o out.html]
                               stage 0's IR and graphs

  exit status: 0 done; 1 the program is wrong, failed, or could not be
  read or written (grep: nothing matched); 2 utu was run wrong (a command,
  an option, a file)`);
  process.exit(code);
}

/** What a file-system error code means, for a command that could not read or write. */
const FS_REASONS = {
  EACCES: 'permission denied', EPERM: 'permission denied', EROFS: 'the file system is read-only',
  ENOTDIR: 'a part of the path is a file, not a directory', EISDIR: 'it is a directory',
  ENOSPC: 'the disk is full', EEXIST: 'a file is in the way', ENOENT: 'a part of the path does not exist',
};

/** The problems with how utu was run (not with the program): they exit 2, as grep's do. */
const USAGE = new Set(['unknown-command', 'unknown-option', 'missing-output', 'missing-file', 'extra-argument', 'file-not-found', 'not-a-file', 'build-mode', 'source-map']);

/**
 * Report a problem, in the shape of every other problem utu reports, with
 * the corrected command when there is one; then exit 2 for one with how utu
 * was run (USAGE), 1 for any other.
 */
function fail(title, code, list = [], command = null) {
  const ink = pen({ color: colored(process.stderr) });
  const lines = [...heading(ink, 'error', title, code)];
  if (list.length) lines.push('', ...notes(ink, list));
  if (command) lines.push('', `  ${ink.paint(ink.palette.add, `${ink.bold}try`)}   ${ink.paint(ink.palette.add, `$ ${command}`)}`);
  console.error(lines.join('\n'));
  process.exit(USAGE.has(code) ? 2 : 1);
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
// V8's words and JavaScriptCore's (Bun's), in either case.
const TRAPS = [
  [/^unreachable/i, 'fatal, failed assert, or failed check'],
  [/null (pointer|reference)|dereferencing a null/i, 'Null'],
  [/remainder by zero/i, 'Integer remainder by zero'],
  [/divide by zero|division by zero/i, 'Integer division by zero'],
  [/integer overflow|divide result unrepresentable|unrepresentable in integer|out of bounds trunc/i, 'Integer overflow'],
  [/out of bounds/i, 'Index out of bounds'],
  [/illegal cast|type incompatibility|failed to cast/i, 'Wrong type from JavaScript'],
  [/array (is )?too large|requested new array is too large|failed to allocate new array/i, 'Array too large'],
  [/Maximum call stack|stack overflow/i, 'Stack overflow'],
];

// The functions the compiler makes, shared by every use (selfhost `helper`).
const HELPERS = /^(array\.slice|Str\.from_codes|closure\.(new|call)|enum\.name|mem\.(reserve|push|resize)|\w+\.from_i32)$/;

// An `unreachable`, by the syntax it was made for: which trap it is.
const UNREACHABLE = {
  assert_expr: 'Failed assert', fatal_expr: 'Reached fatal',
  slice_expr: 'Slice ends before it starts', match_expr: 'No arm for the value', loop_match_expr: 'No arm for the value', alt_expr: 'No arm for the value',
};

/**
 * A trap, or a JavaScript error from the host, as what happened, the utu
 * functions it was in (each placed, given a source map), and `at`: the
 * frame to show, the innermost in the program's own files.
 */
function trapText(error, map = null) {
  try {
    return trapParts(error, map);
  } catch {
    // A value no stack or text can be read from (a revoked proxy, say).
    return { title: valueText(error), frames: [], wasm: false, at: null, placed: false };
  }
}

/** A thrown value's first line, whatever it is: `String` throws for some (no prototype, a throwing toString). */
function valueText(value) {
  try {
    return String(value?.message ?? value).split('\n')[0];
  } catch {}
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[object]';
  }
}

function trapParts(error, map) {
  let message = valueText(error);
  const wasm = error instanceof WebAssembly.RuntimeError || /Maximum call stack/i.test(message);
  // JavaScriptCore says what it was evaluating: not part of the trap.
  if (wasm) message = message.replace(/ \(evaluating '[^']*'\)$/, '');
  let frames = wasmFrames(error, map).map(f => ({ ...f, fn: f.fn ?? `function ${f.index}` }));
  if (!frames.length) {
    // No offsets (JavaScriptCore's stacks): the names alone.
    for (const line of String(error?.stack ?? '').split('\n')) {
      const at = line.match(/^\s*at (?:async )?(\S+) \(wasm:/);
      if (at) frames.push({ fn: at[1].replace(/^[$]/, '') });
    }
  }
  const inner = frames[0]?.entry;
  let title = wasm ? (TRAPS.find(([pattern]) => pattern.test(message))?.[1] ?? message) : message;
  if (wasm && /unreachable/i.test(message) && inner?.kind) {
    // The standard library's own: a check of how it was used.
    title = inner.file?.startsWith('std:') ? `Failed check in ${inner.file}` : UNREACHABLE[inner.kind] ?? 'Reached unreachable code';
  }
  // A safe build's `Tag.from_i32(v)` (its own function) with no variant of value v.
  if (wasm && /unreachable/i.test(message) && /^\w+\.from_i32$/.test(frames[0]?.fn ?? '')) title = `${frames[0].fn}: no variant has this value`;
  // A stack overflows as a function is entered (placed at its body): the call that entered it is the place.
  if (title === 'Stack overflow' && frames.length > 1 && /^(block|fn_decl)$/.test(frames[0].entry?.kind ?? '')) frames = frames.slice(1);
  // A helper the compiler made is shared, and mapped to its first use: placed by its caller.
  frames = frames.map(f => HELPERS.test(f.fn) ? { ...f, entry: null, helper: true } : f);
  const at = frames.find(f => f.entry?.file && !f.entry.file.startsWith('std:')) ?? frames.find(f => f.entry?.file) ?? null;
  // Not the test runner's own exports; endless recursion (one frame, many times) once.
  frames = frames.filter(f => !/^__test_/.test(f.fn));
  const folded = frames.filter((f, i) => i === 0 || f.fn !== frames[i - 1].fn || f.entry !== frames[i - 1].entry);
  return { title, frames: folded.slice(0, 12), wasm, at, placed: !!map && frames.some(f => f.offset != null) };
}

/** An entry's place, as `file:line:col`. */
function placeText(entry) {
  return `${displayPath(entry.file)}:${entry.line}:${entry.column}`;
}

/** A trap in `utu run`: in the shape of every other problem, at its line, with the utu functions it was in. */
async function trap(error, file, built, utu) {
  const color = colored(process.stderr);
  const ink = pen({ color });
  const { title, frames, wasm, at, placed } = trapText(error, built.map);
  const stack = frames.map(f => `  ${ink.paint(ink.palette.dim, 'in')} ${ink.bold}${f.fn}${ink.reset}`
    + (f.entry?.file ? `  ${ink.paint(ink.palette.dim, placeText(f.entry))}` : '')
    + (f.inlined ? ink.paint(ink.palette.dim, `  (inlined into ${f.inlined})`) : ''));
  const code = wasm ? 'trap' : 'uncaught-exception';
  const texts = new Map(built.files.map(f => [f.key, f.text]));
  if (at && texts.has(at.entry.file)) {
    const { highlighter } = await import('../src/selfhost/highlight.js');
    const { entry } = at;
    const shown = formatDiagnostics([{
      severity: wasm ? 'trap' : 'error', message: title, code, file: entry.file,
      start: entry.start, end: entry.end, line: entry.line, column: entry.column, label: at === frames.find(f => !f.helper) ? 'here' : 'called here',
    }], texts, { color, relative: displayPath, highlight: highlighter(utu, built.files) });
    await written(process.stderr, `${[shown, ...stack.length ? ['', ...stack] : []].join('\n')}\n`);
  } else {
    const lines = [...heading(ink, wasm ? 'trap' : 'error', title, `${code} · ${displayPath(file)}`)];
    if (stack.length) lines.push('', ...stack);
    // A map, and no offsets to place the trap by: JavaScriptCore's stacks (bun) have none.
    if (wasm && built.map && !placed) lines.push('', ...notes(ink, ["No line: this engine's stack has no Wasm offsets; node's does."]));
    await written(process.stderr, `${lines.join('\n')}\n`);
  }
  process.exit(1);
}

// The compiler recurses as a program nests, so a deep program needs a deep
// stack. Under Node, a build too deep for the main thread's is done again
// in a worker with STACK_MB (200k nested parentheses compile in 1 GB), and
// the language server runs in one. Bun's workers ignore the setting, so
// under Bun too deep a program is reported as such.
const STACK_MB = 1024;

/** Whether this thread can hand a command to a worker with a deeper stack. */
const deepens = isMainThread && !process.versions.bun && !process.env.UTU_NO_WORKER;

/** Thrown when a build was too deep for this thread: the command starts again in a worker with an `mb` MB stack. */
class TooDeep extends Error { constructor(mb = STACK_MB) { super(); this.mb = mb; } }

/** The command, run in a worker with a deep stack; exits as it does. */
function inWorker(mb = STACK_MB) {
  const worker = new Worker(new URL(import.meta.url), {
    argv: process.argv.slice(2), stdin: true, resourceLimits: { stackSizeMb: mb },
    workerData: { tty: { stdout: !!process.stdout.isTTY, stderr: !!process.stderr.isTTY } },
  });
  process.stdin.pipe(worker.stdin);
  worker.on('error', error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
  worker.on('exit', code => process.exit(code));
}

if (deepens && process.argv[2] === 'lsp') inWorker();
else {
  main().catch(error => {
    if (error instanceof TooDeep) return inWorker(error.mb);
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
