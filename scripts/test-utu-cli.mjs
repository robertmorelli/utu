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

  // Each problem where it is, in source order, underlined.
  r = utu('check', 'bad.utu');
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), `bad.utu:3:25: error: Type mismatch: expected I32, got Str
 2 | export main() I32 {
 3 |     let x: I32 = add(1, "two");
   |                         ^^^^^

bad.utu:4:9: error: Unknown variable 'missing'
 3 |     let x: I32 = add(1, "two");
 4 |     x + missing;
   |         ^^^^^^^`);
  // On a terminal, colored as the compiler reads it: \`add\` a function, \`I32\` a type, the string a string.
  const colored = spawnSync(process.execPath, [cli, 'check', 'bad.utu'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' } }).stderr;
  assert.match(colored, /\x1b\[34madd\x1b\[0m/);
  assert.match(colored, /\x1b\[36mI32\x1b\[0m/);
  assert.match(colored, /\x1b\[32m"two"\x1b\[0m/);
  // NO_COLOR wins; FORCE_COLOR=0 is no.
  for (const env of [{ NO_COLOR: '1', FORCE_COLOR: '1' }, { FORCE_COLOR: '0' }]) {
    const plain = spawnSync(process.execPath, [cli, 'check', 'bad.utu'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).stderr;
    assert.ok(!plain.includes('\x1b['), JSON.stringify(env));
  }
  // The underline is under the code, past wide characters.
  await fs.writeFile(path.join(dir, 'wide.utu'), 'export main() I32 {\n    let s: Str = "漢字"; nope;\n}\n');
  assert.match(utu('check', 'wide.utu').stderr, /^ {3}\| {26}\^{4}$/m);
  // A file that ends early says so.
  await fs.writeFile(path.join(dir, 'short.utu'), 'export main() I32 {\n');
  assert.match(utu('check', 'short.utu').stderr, /error: Syntax error: unexpected end of the file/);

  r = utu('run', 'good.utu');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '6');

  r = utu('test', 'good.utu');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^pass adds /m);
  assert.match(r.stdout, /^FAIL fails: /m);
  assert.match(r.stdout, /1 passed, 1 failed/);

  // --safe keeps the checks wasm makes anyway: past a Buffer's length is a
  // trap, where otherwise it reaches the capacity beyond (at -Oz and -O3).
  await write('past.utu', `using Buffer from std:Buffer;
export main() I32 { let b = Buffer[I32].new(); b.push(7); b[3]; }
`);
  for (const level of [[], ['-O3']]) {
    r = utu('run', 'past.utu', ...level);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '7');
    r = utu('run', 'past.utu', '--safe', ...level);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unreachable/);
  }

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
