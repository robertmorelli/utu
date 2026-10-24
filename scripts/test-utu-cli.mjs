// The utu CLI (on the self-hosted compiler): check, run, test, bench, build, and
// build-exe when bun is installed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const cli = path.resolve('cli/utu.mjs');
const dir = await fs.mkdtemp(path.resolve('.tmp-utu-cli-'));
const utu = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: dir });
const write = (name, text) => fs.writeFile(path.join(dir, name), text);

try {
  await write('good.utu', `let twice: fun(I32) I32 = @es/\\ (n) => n * 2 \\/;
fn add(a: I32, b: I32) I32 { a + b; }
export main() I32 { twice(add(1, 2)); }
test "adds" { assert add(1, 2) == 3; }
test "fails" { assert add(1, 2) == 4; }
`);
  await write('bad.utu', `fn add(a: I32, b: I32) I32 { a + b; }
export main() I32 {
    let x: I32 = add(1, "two");
    x + missing;
}
`);

  let r = utu('check', 'good.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ok');

  // Each problem where it is, in source order: the problem, its kind and
  // place, and about five lines of the code, the mistake marked (a rule
  // under it, without color).
  r = utu('check', 'bad.utu');
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), `ERROR  add takes I32, got Str
        type-mismatch · bad.utu:3:25

 1 │ fn add(a: I32, b: I32) I32 { a + b; }
   │                ──────
   │                ╰─ I32
 2 │ export main() I32 {
 3 │     let x: I32 = add(1, "two");
   │                         ━━━━━
   │                         ╰─ Str
 4 │     x + missing;
 5 │ }

 ERROR  Unknown variable missing
        unknown-variable · bad.utu:4:9

 2 │ export main() I32 {
 3 │     let x: I32 = add(1, "two");
 4 │     x + missing;
   │         ━━━━━━━
   │         ╰─ not defined
 5 │ }`);
  // On a terminal, colored as the compiler reads it: \`add\` a function, \`I32\` a type, the string a string.
  const colored = spawnSync(process.execPath, [cli, 'check', 'bad.utu'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1', COLORTERM: 'truecolor', UTU_THEME: 'dark' } }).stderr;
  assert.match(colored, /\x1b\[38;2;130;170;255madd/);
  assert.match(colored, /\x1b\[38;2;125;207;255mI32/);
  assert.match(colored, /\x1b\[38;2;158;206;106m"two"/);
  // Without 24-bit color, the nearest of the 256.
  const fewer = spawnSync(process.execPath, [cli, 'check', 'bad.utu'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1', COLORTERM: '', TERM_PROGRAM: '', UTU_THEME: 'dark' } }).stderr;
  assert.match(fewer, /\x1b\[38;5;\d+madd/);
  // NO_COLOR wins; FORCE_COLOR=0 is no.
  for (const env of [{ NO_COLOR: '1', FORCE_COLOR: '1' }, { FORCE_COLOR: '0' }]) {
    const plain = spawnSync(process.execPath, [cli, 'check', 'bad.utu'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).stderr;
    assert.ok(!plain.includes('\x1b['), JSON.stringify(env));
  }
  // The mark is under the code, past wide characters.
  await fs.writeFile(path.join(dir, 'wide.utu'), 'export main() I32 {\n    let s: Str = "漢字"; nope;\n}\n');
  assert.match(utu('check', 'wide.utu').stderr, /^ {3}│ {26}━{4}$/m);
  // A file that ends early says so, and which brace is left open.
  await fs.writeFile(path.join(dir, 'short.utu'), 'export main() I32 {\n');
  assert.match(utu('check', 'short.utu').stderr, /Unclosed \{[^]*╰─ never closed/);

  r = utu('run', 'good.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '6');

  r = utu('test', 'good.utu');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^pass adds /m);
  assert.match(r.stdout, /^FAIL fails: /m);
  assert.match(r.stdout, /1 passed, 1 failed/);

  // utu bench: a row per bench, its median time per iteration and how many
  // runs of how many iterations; a bench that traps is a FAIL row.
  await write('benches.utu', `fn add(a: I32, b: I32) I32 { a + b; }
bench "adding" {
    let total = 0;
    measure { total = add(total, 1); }
}
bench "trapping" {
    measure { assert false; }
}
`);
  r = utu('bench', 'benches.utu');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^bench +median +iterations$/m);
  assert.match(r.stdout, /^adding +[0-9.]+ (ns|µs|ms|s) +11 × \d+$/m);
  assert.match(r.stdout, /^trapping +FAIL: /m);
  r = utu('bench', 'good.utu');
  assert.equal(r.stdout.trim(), 'No benches');

  // A mod's tests and benches run, named by the mod (they were dropped).
  await write('mods.utu', `mod geo {
    fn two() I32 { 2; }
    test "two" { assert two() == 3; }
    bench "two" { let s = 0; measure { s += two(); } }
}
test "top" { assert true; }
`);
  r = utu('test', 'mods.utu');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL geo: two: /m);
  assert.match(r.stdout, /1 passed, 1 failed/);
  assert.match(utu('bench', 'mods.utu').stdout, /^geo: two +[0-9.]+ /m);

  // A test that waits on nothing fails, and the rest run; one that leaves
  // an interval ends the run all the same; what a callback throws after
  // the tests is a failure after them; the summary is always there.
  await write('waits.utu', `let never: fun() Promise[I32] = @es/\\ () => new Promise(() => {}) \\/;
let tick: fun() void = @es/\\ () => { setInterval(() => {}, 1000); } \\/;
let later: fun() void = @es/\\ () => { setTimeout(() => { throw new Error("boom"); }, 5); } \\/;
test "first" { assert true; }
test "hangs" { let a = await never(); assert a == 1; }
test "ticks" { tick(); assert true; }
test "last" { later(); assert true; }
`);
  r = spawnSync(process.execPath, [cli, 'test', 'waits.utu'], { encoding: 'utf8', cwd: dir, timeout: 30000 });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.replace(/ \([0-9.]+ ms\)/g, ''), `pass first
FAIL hangs: Never settled: nothing left to wait for
pass ticks
pass last
FAIL after tests: boom
3 passed, 1 failed, 1 uncaught error
`);
  assert.equal(r.stderr, '');

  // The build modes: small (the default) and fast keep the checks Wasm does
  // not make itself, so past a Buffer's length is a trap; the unsafe ones
  // leave them out, and it reaches the capacity beyond.
  await write('past.utu', `using Buffer from std:Buffer;
export main() I32 { let b = Buffer[I32].new(); b.push(7); b[3]; }
`);
  for (const mode of [[], ['-O', 'fast']]) {
    r = utu('run', 'past.utu', ...mode);
    assert.notEqual(r.status, 0);
    // The standard library's check, shown where the program used it.
    assert.match(r.stderr, /TRAP  Failed check in std:Buffer\n {7}trap · past\.utu:2:59/);
    assert.match(r.stderr, /in main  past\.utu:2:59/);
  }
  for (const mode of ['smallUnsafe', 'fastUnsafe']) {
    r = utu('run', 'past.utu', '-O', mode);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '7');
  }
  // One mode at a time, by name.
  assert.match(utu('run', 'past.utu', '-O', 'fast', '-O', 'small').stderr, /Two build modes/);
  assert.match(utu('run', 'past.utu', '-O', 'fastUnsfe').stderr, /did you mean fastUnsafe/);
  assert.match(utu('run', 'past.utu', '-O3').stderr, /Unknown option -O3/);

  // A trap at its line, with the functions it was in, by a source map:
  // each kind of trap, in debug (exact), small and fast (best effort).
  const traps = {
    assert: ['fn boom(x: I32) I32 {\n    assert x > 5;\n    x * 2;\n}\nexport main() I32 { boom(10) + boom(1); }\n', 'Failed assert', '2:5', 'boom'],
    fatal: ['fn check(x: I32) I32 {\n    if x < 0 { fatal; };\n    x;\n}\nexport main() I32 { check(-1); }\n', 'Reached fatal', '2:16', 'check'],
    divide: ['fn div(a: I32, b: I32) I32 {\n    a / b;\n}\nexport main() I32 { div(7, 0); }\n', 'Integer division by zero', '2:5', 'div'],
    bounds: ['fn at(xs: Array[I32], i: I32) I32 {\n    xs[i];\n}\nexport main() I32 { at([1, 2, 3], 5); }\n', 'Index out of bounds', '2:5', 'at'],
    // A mem's or vec's index past its length (within its capacity), as an array's.
    mem_bounds: ['mem b: U8;\nfn put(i: I32) void {\n    b[i] = 77;\n}\nexport main() I32 { b.push(9); put(1); put(4); b.len(); }\n', 'Index out of bounds', '3:5', 'put'],
    vec_bounds: ['vec b: I32;\nfn at(i: I32) I32 {\n    b[i] + 1;\n}\nexport main() I32 { b.reserve(8); b.push(9); at(0) + at(3); }\n', 'Index out of bounds', '3:5', 'at'],
    // `orelse fatal` is fatal's trap, not a null's.
    null: ['fn pick(x: ?Str) Str {\n    x orelse fatal;\n}\nexport main() Str { pick(null); }\n', 'Reached fatal', '2:14', 'pick'],
    slice: ['fn cut(xs: Array[I32]) I32 {\n    xs[2, 1].len();\n}\nexport main() I32 { cut([1, 2, 3]); }\n', 'Slice ends before it starts', '2:5', 'cut'],
    // In the slice helper every use shares: at this use, not the first.
    slice2: ['fn n(x: I32) I32 { x; }\nfn ok(xs: Array[I32]) I32 { xs[0, 1].len(); }\nfn cut(xs: Array[I32]) I32 {\n    xs[2, n(1)].len();\n}\nexport main() I32 { let xs = [1, 2, 3]; ok(xs) + cut(xs); }\n', 'Slice ends before it starts', '4:5', 'cut'],
    // (A safe build stops at from_i32, before the match could miss.)
    range: ['enum(U8) Color:\n    | Red\n    | Green\nfn name(c: Color) I32 {\n    match c { Color.Red => 1, Color.Green => 2, };\n}\nexport main() I32 { name(Color.from_i32(9)); }\n', 'Color.from_i32: no variant has this value', '7:26', 'main'],
  };
  for (const [name, [source, title, at, fn]] of Object.entries(traps)) {
    await write(`${name}.utu`, source);
    for (const mode of ['debug', 'small', 'fast']) {
      r = utu('run', `${name}.utu`, '-O', mode);
      assert.equal(r.status, 1, `${name} ${mode}: ${r.stdout}`);
      assert.ok(r.stderr.startsWith(` TRAP  ${title}\n       trap · ${name}.utu:${at}\n`), `${name} ${mode}:\n${r.stderr}`);
      assert.match(r.stderr, /╰─ here/, `${name} ${mode}`);
      // The function, at its line: inlined into main in fast, a frame of its own else.
      assert.ok(r.stderr.includes(`in ${fn}  ${name}.utu:${at}`), `${name} ${mode}:\n${r.stderr}`);
      assert.match(r.stderr, /in main  \S+\.utu:\d+:\d+/, `${name} ${mode}`);
    }
  }
  assert.match(utu('run', 'assert.utu', '-O', 'fast').stderr, /in boom  assert\.utu:2:5  \(inlined into main\)/);
  // A trap in a global's initializer, as any other (it showed JavaScript's stack).
  await write('global.utu', 'fn n(x: I32) I32 { x; }\nlet xs: Array[I32] = [1, 2];\nlet g: I32 = xs[n(5)];\nexport main() I32 { g; }\ntest "g" { assert g == 1; }\n');
  for (const command of ['run', 'test']) {
    r = utu(command, 'global.utu');
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.startsWith(' TRAP  Index out of bounds\n       trap · global.utu:3:14\n'), `${command}:\n${r.stderr}`);
  }
  // The unsafe modes keep no map: what, not where.
  r = utu('run', 'assert.utu', '-O', 'smallUnsafe');
  assert.match(r.stderr, /^ TRAP  fatal, failed assert, or failed check\n {7}trap · assert\.utu\n/);
  // A failed test says where.
  assert.match(utu('test', 'good.utu').stdout, /^FAIL fails: Failed assert {2}at good\.utu:5:16/m);

  // build writes a source map in debug, and in small or fast when asked.
  r = utu('build', 'assert.utu', '-O', 'debug', '-o', 'mapped');
  assert.equal(r.status, 0, r.stderr);
  const map = JSON.parse(await fs.readFile(path.join(dir, 'mapped', 'assert.wasm.map'), 'utf8'));
  assert.equal(map.version, 3);
  assert.deepEqual(map.sources, ['../assert.utu']);
  assert.match(map.mappings, /^[A-Za-z0-9+/,]+$/);
  const mapped = await fs.readFile(path.join(dir, 'mapped', 'assert.wasm'));
  const custom = WebAssembly.Module.customSections(new WebAssembly.Module(mapped), 'sourceMappingURL');
  assert.equal(new TextDecoder().decode(custom[0]).slice(1), 'assert.wasm.map');
  r = utu('build', 'assert.utu', '-o', 'plain');
  assert.equal(r.status, 0, r.stderr);
  await assert.rejects(fs.access(path.join(dir, 'plain', 'assert.wasm.map')));
  r = utu('build', 'assert.utu', '-O', 'fast', '--source-map', '-o', 'fastmap');
  assert.equal(r.status, 0, r.stderr);
  await fs.access(path.join(dir, 'fastmap', 'assert.wasm.map'));
  assert.match(utu('build', 'assert.utu', '-O', 'fastUnsafe', '--source-map').stderr, /No source map in fastUnsafe/);
  assert.match(utu('run', 'assert.utu', '--source-map').stderr, /--source-map is only for build/);

  // A program nested past the main thread's stack builds in a worker with a deeper one (Node).
  await write('deep.utu', `export main() I32 { ${'('.repeat(100000)}1${')'.repeat(100000)}; }\n`);
  r = utu('run', 'deep.utu');
  assert.equal(r.status, 0, r.stderr.slice(0, 300));
  assert.equal(r.stdout.trim(), '1');

  // Arguments after -- reach the program as process.argv.slice(2); -- is only run's.
  await write('args.utu', 'let count: fun() I32 = @es/\\ () => process.argv.length - 2 \\/;\nlet arg: fun(I32) Str = @es/\\ (i) => process.argv[i + 2] \\/;\nexport main() Str { `${count()} ${arg(1)}`; }\n');
  r = utu('run', 'args.utu', '--', 'a', 'b c');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '2 b c');
  assert.match(utu('build', 'args.utu', '--', 'a').stderr, /-- is only for run/);

  // A declaration file linked by tools/dts/cli.mjs (`using Api from "./bindings/Api.abi.json"`):
  // checked, run and built; its relative module is from the program's directory.
  await write('api.d.ts', 'export declare function twice(n: number): number;\n');
  await write('api.js', 'export function twice(n) { return n * 2; }\n');
  r = spawnSync(process.execPath, [path.resolve('tools/dts/cli.mjs'), '--input', 'api.d.ts', '--module', './api.js', '--prefix', 'Api', '--out', 'bindings'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  await write('abi.utu', 'using Api from "./bindings/Api.abi.json";\nexport main() F64 { Api.twice(21.0); }\n');
  r = utu('check', 'abi.utu');
  assert.equal(r.status, 0, r.stderr);
  r = utu('run', 'abi.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '42');
  r = utu('build', 'abi.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await import(pathToFileURL(path.join(dir, 'abi.mjs')).href)).exports.main(), 42);

  // A module and the least JavaScript that loads it.
  r = utu('build', 'good.utu', '-o', 'out');
  assert.equal(r.status, 0, r.stderr);
  const loaded = await import(pathToFileURL(path.join(dir, 'out', 'good.mjs')).href);
  assert.equal(loaded.exports.main(), 6);
  // Beside its source, the default.
  r = utu('build', 'good.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await import(pathToFileURL(path.join(dir, 'good.mjs')).href)).exports.main(), 6);

  if (spawnSync('bun', ['--version']).status === 0) {
    r = utu('build-exe', 'good.utu', '-o', 'good');
    assert.equal(r.status, 0, r.stderr);
    // main's I32 is the exit status.
    assert.equal(spawnSync(path.join(dir, 'good'), { encoding: 'utf8' }).status, 6);
  }
  console.log('utu cli: check, run, test, bench, build, build-exe pass');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
