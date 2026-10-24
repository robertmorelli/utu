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
  // The 5 ms timer lands after the last test, or (on a loaded machine) during it.
  const waits = r.stdout.replace(/ \([0-9.]+ ms\)/g, '');
  const late = `pass last
FAIL after tests: boom
3 passed, 1 failed, 1 uncaught error
`, during = `FAIL last: boom
2 passed, 2 failed
`;
  assert.ok([late, during].some(end => waits === `pass first
FAIL hangs: Never settled: nothing left to wait for
pass ticks
` + end), waits);
  assert.equal(r.stderr, '');

  // A callback a test scheduled for now fails that test, not the next.
  await write('soon.utu', `let soon: fun() void = @es/\\ () => { setTimeout(() => { throw new Error("soon"); }, 0); } \\/;
let wait: fun() Promise[I32] = @es/\\ () => new Promise(r => setTimeout(() => r(1), 20)) \\/;
test "schedules" { soon(); }
test "waits" { let x = await wait(); assert x == 1; }
`);
  // Benches as tests: one that waits on nothing fails (the rows before it
  // print); a callback's error fails its bench, once however often setup ran.
  await write('benchwaits.utu', `let never: fun() Promise[I32] = @es/\\ () => new Promise(() => {}) \\/;
let later: fun() void = @es/\\ () => { setTimeout(() => { throw new Error("late"); }, 0); } \\/;
bench "ok first" { let s = 0; measure { s = s + 1; } }
bench "never later" { let s = 0; let x = await never(); measure { s = s + x; } }
bench "throws later" { let s = 0; later(); measure { s = s + 1; } }
bench "ok last" { let s = 0; measure { s = s + 1; } }
`);
  const hasBun = spawnSync('bun', ['--version']).status === 0;
  for (const runtime of [process.execPath, ...(hasBun ? ['bun'] : [])]) {
    r = spawnSync(runtime, [cli, 'test', 'soon.utu'], { encoding: 'utf8', cwd: dir, timeout: 30000 });
    assert.equal(r.stdout.replace(/ \([0-9.]+ ms\)/g, ''), 'FAIL schedules: soon\npass waits\n1 passed, 1 failed\n', runtime);
    r = spawnSync(runtime, [cli, 'bench', 'benchwaits.utu'], { encoding: 'utf8', cwd: dir, timeout: 30000 });
    assert.equal(r.status, 1, `${runtime}: ${r.stderr}`);
    const rows = r.stdout.split('\n').slice(1, -1).map(row => row.replace(/ {2,}/g, '  ').trim());
    assert.equal(rows.length, 4, `${runtime}: ${r.stdout}`);
    assert.match(rows[0], /^ok first  [0-9.]+ (ns|µs|ms|s) /, runtime);
    assert.equal(rows[1], 'never later  FAIL: Never settled: nothing left to wait for', runtime);
    assert.match(rows[2], /^throws later  FAIL: late( \([0-9]+ times\))?$/, runtime);
    assert.match(rows[3], /^ok last  [0-9.]+ (ns|µs|ms|s) /, runtime);
  }

  // A thrown value with no text (no prototype, a throwing toString) fails its test, and the rest run;
  // a callback 300 ms after the last test is still a failure after them; a stray error thrown
  // thousands of times is one line, and past 20 distinct ones the rest are a count.
  await write('strange.utu', `let rej: fun(I32) void = @es/\\ (k) => { Promise.reject(k ? {toString() { throw new Error("ts"); }} : Object.create(null)); } \\/;
let thr: fun() void = @es/\\ () => { throw {toString() { throw new Error("ts"); }}; } \\/;
let many: fun() void = @es/\\ () => {
    for (let i = 0; i < 3000; i++) setTimeout(() => { throw new Error("same"); }, 0);
    for (let i = 0; i < 25; i++) setTimeout(() => { throw new Error("e" + i); }, 0);
} \\/;
let later: fun() void = @es/\\ () => { setTimeout(() => { throw new Error("late"); }, 300); } \\/;
test "no prototype" { rej(0); }
test "throwing toString" { rej(1); }
test "throws it" { thr(); }
test "many" { many(); }
test "last" { later(); }
bench "many" { many(); measure { } }
`);
  for (const runtime of [process.execPath, ...(hasBun ? ['bun'] : [])]) {
    r = spawnSync(runtime, [cli, 'test', 'strange.utu'], { encoding: 'utf8', cwd: dir, timeout: 30000 });
    assert.equal(r.status, 1, `${runtime}: ${r.stderr}`);
    assert.equal(r.stderr, '', runtime);
    assert.equal(r.stdout.replace(/ \([0-9.]+ ms\)/g, ''), `FAIL no prototype: [object Object]
FAIL throwing toString: [object Object]
FAIL throws it: [object Object]
FAIL many: same (3000 times)
${Array.from({ length: 19 }, (_, i) => `FAIL many: e${i}\n`).join('')}FAIL many: and 6 more
pass last
FAIL after tests: late
1 passed, 4 failed, 3025 uncaught errors
`, runtime);
    r = spawnSync(runtime, [cli, 'bench', 'strange.utu'], { encoding: 'utf8', cwd: dir, timeout: 60000 });
    assert.equal(r.status, 1, `${runtime}: ${r.stderr}`);
    const rows = r.stdout.split('\n').slice(1, -1).map(row => row.replace(/ {2,}/g, '  ').trim());
    assert.match(rows[0], /^many  FAIL: same \([0-9]+ times\)$/, runtime);
    assert.match(rows[19], /^many  FAIL: e18 \([0-9]+ times\)$/, runtime);
    assert.match(rows[20], /^many  FAIL: and [0-9]+ more$/, runtime);
    assert.equal(rows.length, 21, runtime);
  }

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
    // A column counts characters, as check's do (an emoji is one, not two UTF-16 units).
    emoji: ['fn at(xs: Array[I32], i: I32) I32 {\n    let s = "😀😀"; xs[i];\n}\nexport main() I32 { at([1, 2, 3], 5); }\n', 'Index out of bounds', '2:19', 'at'],
    // A lone \r ends a line, as \n and \r\n do.
    cr: ['fn at(xs: Array[I32], i: I32) I32 {\r    xs[i];\r}\rexport main() I32 { at([1, 2, 3], 5); }\r', 'Index out of bounds', '2:5', 'at'],
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
  // A callback's trap after main returned (a `.then`'s), placed as main's are.
  await write('later.utu', 'let delay: fun(I32) Promise[I32] = @es/\\ (v) => new Promise(r => setTimeout(() => r(v), 1)) \\/;\nexport main() void {\n    delay(0).then(cl(v) { let n = 10 / v; });\n}\n');
  r = utu('run', 'later.utu');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.startsWith(' TRAP  Integer division by zero\n       trap · later.utu:3:35\n'), r.stderr);
  // @json's place in the text counts characters, and a lone \r ends a line.
  await write('json.utu', 'struct P:\n    | s: Str\n    | x: I32\nexport main() Str {\n    @json/\\ error P "{\\"s\\": \\"😀\\",\\r\\"x\\": q}" \\/;\n}\n');
  assert.match(utu('run', 'json.utu').stdout, /at line 2, column 6$/m);
  // An @es body that is not JavaScript: at its block, when checked.
  await write('es.utu', 'let f: fun(I32) I32 = @es/\\ (a) => a +* 1 \\/;\nexport main() I32 { f(1); }\n');
  r = utu('check', 'es.utu');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /^ ERROR  @es body is not JavaScript: .+\n {8}es-syntax · es\.utu:1:23\n/);
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

  // A main's array prints as one (it was `[Object: null prototype] {}`), read by
  // the run build's `run:len:k`/`run:at:k`: nested, empty, of strings, of structs
  // (by name), of ?Array, of Bool and U32 (as JS has them); a trap is still main's.
  await write('arrays.utu', 'export main() Array[Array[I32]] { [[1, 2, 3], [], [4]]; }\n');
  await write('empty.utu', 'export main() Array[F64] { []; }\n');
  await write('strs.utu', 'export main() Array[Str] { ["a", "b\\"c", ""]; }\n');
  await write('structs.utu', 'struct P:\n    | x: I32\nexport main() Array[?P] { [P { x: 1 }, null]; }\n');
  await write('nullable.utu', 'export main() ?Array[?Array[Bool]] { [[true, false], null, []]; }\n');
  await write('u32s.utu', 'export main() Array[U32] { [4000000000, 0]; }\n');
  await write('arraytrap.utu', 'fn at(xs: Array[I32], i: I32) I32 { xs[i]; }\nexport main() Array[I32] { [at([1], 3)]; }\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    assert.equal(utu('run', 'arrays.utu', '-O', mode).stdout, '[[1, 2, 3], [], [4]]\n', mode);
    assert.equal(utu('run', 'empty.utu', '-O', mode).stdout, '[]\n', mode);
    assert.equal(utu('run', 'strs.utu', '-O', mode).stdout, '["a", "b\\"c", ""]\n', mode);
    assert.equal(utu('run', 'structs.utu', '-O', mode).stdout, '[P, null]\n', mode);
    assert.equal(utu('run', 'nullable.utu', '-O', mode).stdout, '[[true, false], null, []]\n', mode);
    assert.equal(utu('run', 'u32s.utu', '-O', mode).stdout, '[4000000000, 0]\n', mode);
  }
  for (const mode of ['debug', 'fast']) {
    r = utu('run', 'arraytrap.utu', '-O', mode);
    assert.ok(r.stderr.startsWith(' TRAP  Index out of bounds\n       trap · arraytrap.utu:1:37\n'), `${mode}:\n${r.stderr}`);
    assert.match(r.stderr, /in main  arraytrap\.utu:2:29/, `${mode}:\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /run:/, mode);
  }
  // A build has no readers.
  r = utu('build', 'arrays.utu', '-o', 'arrays');
  assert.equal(r.status, 0, r.stderr);
  const arrayExports = WebAssembly.Module.exports(new WebAssembly.Module(await fs.readFile(path.join(dir, 'arrays', 'arrays.wasm'))));
  assert.deepEqual(arrayExports.map(e => e.name).filter(n => n.startsWith('run:')), []);

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

  // An npm package's browser build, which Node runs too (nanoid's Node build needs
  // Buffer, which a browser lacks); --target node, its Node build.
  await write('nano.utu', 'using Nano from "npm:nanoid";\nexport main() I32 { Nano.nanoid(8).len(); }\n');
  for (const [target, buffer] of [[[], false], [['--target', 'browser'], false], [['--target', 'node'], true]]) {
    const where = `nano-${target[1] ?? 'default'}`;
    r = utu('build', 'nano.utu', '-o', where, ...target);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((await fs.readFile(path.join(dir, where, 'nano.mjs'), 'utf8')).includes('Buffer.'), buffer, where);
    assert.equal((await import(pathToFileURL(path.join(dir, where, 'nano.mjs')).href)).exports.main(), 8, where);
  }
  assert.match(utu('build', 'nano.utu', '--target', 'deno').stderr, /--target needs browser or node, got deno/);
  assert.match(utu('run', 'nano.utu', '--target', 'node').stderr, /--target is only for build/);

  // Stage 0's views: a mistake in the command is said, not thrown.
  await write('lost.utu', 'using nothere from "./nothere.utu";\nexport main() I32 { 1; }\n');
  // A byte that is not UTF-8, in the file or in one it imports: the self-hosted compiler's error, at the byte.
  await fs.writeFile(path.join(dir, 'latin1.utu'), Buffer.concat([Buffer.from('export main() I32 {\n    // caf'), Buffer.from([0xe9]), Buffer.from('\n    1;\n}\n')]));
  await write('uses-latin1.utu', 'using l from "./latin1.utu";\nexport main() I32 { 1; }\n');
  // Errors stage 0 throws without a diagnostic: said, not a stack.
  await write('unknown-module.utu', 'using geometri |Point|;\nexport main() I32 { 1; }\n');
  // A @comptime loop that never ends: stopped, as the self-hosted compiler stops it.
  await write('forever.utu', 'fn f() Array[I32] { while (true) { }; [1]; }\nconst mem t: I32 = @comptime/\\ f() \\/;\nexport main() I32 { t.len(); }\n');
  for (const [args, said] of [
    [['display'], /No file/],
    [['display', 'nope.utu'], /No file nope\.utu/],
    [['display', '.'], /\. is a directory/],
    [['graph', 'good.utu', '-o'], /-o needs a file/],
    [['display:modules', 'lost.utu'], /Cannot import "\.\/nothere\.utu"/],
    [['display', 'latin1.utu'], /Not UTF-8[^]*latin1\.utu:2:11/],
    [['graph', 'latin1.utu', '-o', 'l.html'], /Not UTF-8[^]*latin1\.utu:2:11/],
    [['display:debug', 'uses-latin1.utu'], /Not UTF-8[^]*latin1\.utu:2:11/],
    [['display', 'unknown-module.utu'], /geometri/],
    [['display', 'forever.utu'], /ran too long/],
    [['graph', 'forever.utu', '-o', 'f.html'], /ran too long/],
  ]) {
    r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: dir, timeout: 60000 });
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, said, args.join(' '));
    assert.doesNotMatch(r.stderr, /\n\s+at /, `${args.join(' ')}: no stack`);
  }

  if (spawnSync('bun', ['--version']).status === 0) {
    r = utu('build-exe', 'good.utu', '-o', 'good');
    assert.equal(r.status, 0, r.stderr);
    // main's I32 is the exit status.
    assert.equal(spawnSync(path.join(dir, 'good'), { encoding: 'utf8' }).status, 6);
    // No main, no executable: it would do nothing.
    await write('lib.utu', 'export lib {\n    fn inc(x: I32) I32 { x + 1; }\n}\n');
    r = utu('build-exe', 'lib.utu', '-o', 'lib');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No export main in lib\.utu/);
    await assert.rejects(fs.access(path.join(dir, 'lib')));
  }
  console.log('utu cli: check, run, test, bench, build, build-exe, stage 0 mistakes pass');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
