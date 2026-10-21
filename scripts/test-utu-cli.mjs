// The utu CLI (on the self-hosted compiler): check, run, test, build, and
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
  // place, and the code, marked (a rule under it, without color).
  r = utu('check', 'bad.utu');
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), `ERROR  Expected I32, got Str
        type-mismatch · bad.utu:3:25

 2 │ export main() I32 {
 3 │     let x: I32 = add(1, "two");
   │                         ━━━━━
   │                         ╰─ Str

 ERROR  Unknown variable missing
        unknown-variable · bad.utu:4:9

 3 │     let x: I32 = add(1, "two");
 4 │     x + missing;
   │         ━━━━━━━
   │         ╰─ not defined`);
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
  // A file that ends early says so.
  await fs.writeFile(path.join(dir, 'short.utu'), 'export main() I32 {\n');
  assert.match(utu('check', 'short.utu').stderr, /Unexpected end of file/);

  r = utu('run', 'good.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '6');

  r = utu('test', 'good.utu');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^pass adds /m);
  assert.match(r.stdout, /^FAIL fails: /m);
  assert.match(r.stdout, /1 passed, 1 failed/);

  // The build modes: small (the default) and fast keep the checks Wasm does
  // not make itself, so past a Buffer's length is a trap; the unsafe ones
  // leave them out, and it reaches the capacity beyond.
  await write('past.utu', `using Buffer from std:Buffer;
export main() I32 { let b = Buffer[I32].new(); b.push(7); b[3]; }
`);
  for (const mode of [[], ['-O', 'fast']]) {
    r = utu('run', 'past.utu', ...mode);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /TRAP  fatal, failed assert, or failed check/);
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

  // A module and the least JavaScript that loads it.
  r = utu('build', 'good.utu', '-o', 'out');
  assert.equal(r.status, 0, r.stderr);
  const loaded = await import(pathToFileURL(path.join(dir, 'out', 'good.mjs')).href);
  assert.equal(loaded.exports.main(), 6);

  if (spawnSync('bun', ['--version']).status === 0) {
    r = utu('build-exe', 'good.utu', '-o', 'good');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(spawnSync(path.join(dir, 'good'), { encoding: 'utf8' }).stdout.trim(), '6');
  }
  console.log('utu cli: check, run, test, build, build-exe pass');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
