// The sampling profiler (selfhost/profile.utu, src/runtime/profile.js):
// a profile build's shadow stack is the source's at each probe, in -O small
// and -O fast (inlined), through recursion, closures, generators, defers
// and exceptions, an early return, and await; the sampler finds the hot
// function, and runs recursion as deep as a normal run does; and a normal
// build has no trace of it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { createProfiler, profileReport } from '../src/runtime/profile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STACKS = path.join(ROOT, 'scripts', 'profile-stacks.utu');
const utu = await loadNodeCompiler();

const expected = [
  ['main', 'main'],
  ['bottom', 'main > down > down > down'],
  ['closure', 'main > apply > closure in main'],
  ['push', 'main > Stack[I32].push'],
  ['gen', 'main > Stack[I32].each'],
  ['body', 'main'],
  ['deferred', 'main > guarded'],
  ['caught', 'main'],
  ['after-early', 'main'],
  ['before', 'main > sleepy'],
  ['after', 'main > sleepy'],
];

for (const mode of ['small', 'fast', 'debug']) {
  const built = await compileFile(utu, STACKS, { mode, profile: true });
  assert.ok(built.wasm, `${mode}: ${built.diagnostics.map(d => d.message).join('; ')}`);
  const profiler = createProfiler({ frames: built.frames });
  const seen = [];
  globalThis.__probe = label => seen.push([label, profiler.stack().join(' > ')]);
  const { exports } = await instantiateNode(built.wasm, built.spec, { root: path.dirname(STACKS), profiler });
  assert.equal(await exports.main(), 3);
  assert.deepEqual(seen, expected, mode);
  assert.deepEqual(profiler.stack(), [], `${mode}: the stack is empty after main`);
  // The frames' places.
  const down = built.frames.find(f => f.name === 'down');
  assert.equal(down.file, STACKS);
  assert.equal(down.line, 16);
}

// A normal build is untouched: no profile memory, no frames.
const plain = await compileFile(utu, STACKS, { mode: 'fast' });
assert.equal(plain.frames, undefined);
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(plain.wasm, { builtins: ['js-string'], importedStringConstants: "'" })).some(e => e.name === 'utu_profile'));

// Sampled: the hot function shows, as folded stacks and speedscope.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-profile-'));
const hot = path.join(dir, 'hot.utu');
fs.writeFileSync(hot, `fn fib(n: I32) I32 { if n < 2 { return n; }; fib(n - 1) + fib(n - 2); }
fn spin() I32 { let t = 0; for (0 ..< 400) |_i| { t += fib(20); }; t; }
export main() I32 { spin(); }
`);
const run = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'run', hot, '--profile', '-o', dir], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
const folded = fs.readFileSync(path.join(dir, 'hot.folded'), 'utf8');
assert.match(folded, /^main;spin;fib(;fib)* \d+$/m);
const scope = JSON.parse(fs.readFileSync(path.join(dir, 'hot.speedscope.json'), 'utf8'));
assert.equal(scope.profiles[0].type, 'sampled');
assert.ok(scope.shared.frames.some(f => f.name === 'fib' && f.line === 1));
assert.match(run.stderr, /hot\.flame\.html/);
assert.ok(fs.existsSync(path.join(dir, 'hot.flame.html')));
// Deep recursion a normal run survives: profiled too, in every mode.
const deep = path.join(dir, 'deep.utu');
fs.writeFileSync(deep, `fn down(n: I32) I32 { if n == 0 { return 0; }; 1 + down(n - 1); }
export main() I32 { let t = 0; for (0 ..< 3000) |_i| { t = down(10000); }; t; }
`);
for (const mode of ['debug', 'small', 'fast']) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'run', deep, '-O', mode, '--profile', '-o', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${mode}: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '10000', mode);
  assert.match(fs.readFileSync(path.join(dir, 'deep.folded'), 'utf8'), /^main;down(;down)* \d+$/m, mode);
}
// --profile changes no output: a recursion too deep traps both ways, one that fits runs both ways.
for (const n of [10000, 10000000]) {
  const file = path.join(dir, `rec${n}.utu`);
  fs.writeFileSync(file, `fn deep(n: I32) I32 { if n == 0 { 0; } else { 1 + deep(n - 1); }; }\nexport main() I32 { deep(${n}); }\n`);
  for (const mode of ['debug', 'small', 'fast']) {
    const go = (...more) => spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'run', file, '-O', mode, ...more], { encoding: 'utf8' });
    const plain = go();
    const profiled = go('--profile', '-o', dir);
    assert.equal(profiled.status, plain.status, `${n} ${mode}: ${plain.stderr} / ${profiled.stderr}`);
    assert.equal(profiled.stdout, plain.stdout, `${n} ${mode}`);
    if (n === 10000) assert.equal(plain.stdout.trim(), '10000', mode);
    else assert.match(plain.stderr, /Stack overflow/, mode);
  }
}
// A trap in a global's initializer, before sampling can start: an empty profile, written.
const early = path.join(dir, 'early.utu');
fs.writeFileSync(early, 'fn pick(xs: Array[I32], i: I32) I32 { xs[i]; }\nlet v: I32 = pick([1], 4);\nexport main() I32 { v; }\n');
const trapped = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'run', early, '--profile', '-o', dir], { encoding: 'utf8' });
assert.equal(trapped.status, 1);
assert.match(trapped.stderr, /Index out of bounds/);
for (const ext of ['folded', 'speedscope.json', 'flame.html']) assert.ok(fs.existsSync(path.join(dir, `early.${ext}`)), ext);
// A trap in a `.then`'s callback, after main: the profile is written before the trap's exit.
const later = path.join(dir, 'later.utu');
fs.writeFileSync(later, `let delay: fun(I32, I32) Promise[I32] =
    @es/\\ (v, ms) => new Promise(r => setTimeout(() => r(v), ms)) \\/;
fn subscribe(n: I32) void { delay(n, 0).then(cl(v) void { let z = v - v; 10 / z; }); }
export main() I32 { subscribe(3); 1; }
`);
for (let i = 0; i < 3; i++) {
  for (const ext of ['folded', 'speedscope.json', 'flame.html']) fs.rmSync(path.join(dir, `later.${ext}`), { force: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'run', later, '--profile', '-o', dir], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /Integer division by zero/);
  for (const ext of ['folded', 'speedscope.json', 'flame.html']) assert.ok(fs.existsSync(path.join(dir, `later.${ext}`)), `${i}: ${ext}`);
}
fs.rmSync(dir, { recursive: true, force: true });

// The report from samples alone.
const report = profileReport({ counts: [['0,1', 3], ['', 1]], runs: [['0,1', 3], ['', 1]], dropped: 0, total: 4, elapsed: 1, interval: 0.25 },
  [{ name: 'main', file: 'a.utu', line: 1 }, { name: 'f', file: 'a.utu', line: 2 }]);
assert.equal(report.folded, '(idle) 1\nmain;f 3\n');
assert.deepEqual(report.top.map(r => [r.name, r.self, r.total]), [['f', 3, 3], ['(idle)', 1, 1], ['main', 0, 3]]);

console.log('profile: stacks in small, fast and debug; sampling; output as unprofiled at depth; a trap in an initializer and in a callback; reports');
