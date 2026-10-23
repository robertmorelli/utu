// The sampling profiler (selfhost/profile.utu, src/runtime/profile.js):
// a profile build's shadow stack is the source's at each probe, in -O small
// and -O fast (inlined), through recursion, closures, generators, defers
// and exceptions, an early return, and await; the sampler finds the hot
// function; and a normal build has no trace of it.
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
fs.rmSync(dir, { recursive: true, force: true });

// The report from samples alone.
const report = profileReport({ counts: [['0,1', 3], ['', 1]], runs: [['0,1', 3], ['', 1]], dropped: 0, total: 4, elapsed: 1, interval: 0.25 },
  [{ name: 'main', file: 'a.utu', line: 1 }, { name: 'f', file: 'a.utu', line: 2 }]);
assert.equal(report.folded, '(idle) 1\nmain;f 3\n');
assert.deepEqual(report.top.map(r => [r.name, r.self, r.total]), [['f', 3, 3], ['(idle)', 1, 1], ['main', 0, 3]]);

console.log('profile: stacks in small, fast and debug; sampling; reports');
