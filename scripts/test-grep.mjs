// `utu grep`: patterns with holes (one node, a recurring one, a run), type
// filters, references by resolution (a local of the same name is another
// declaration), JSON, and the exit status.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = `struct Box:
    | items : Array[I32]
    | label : Str

fn count(b: Box) I32 { b.items.len(); }

fn total(xs: Array[I32]) I32 {
    let sum = 0;
    for (xs) |x| { sum += x; };
    sum + sum;
}

fn twice(s: Str) Str { s + s; }

fn other() I32 {
    let count = 3;
    count * 2;
}

export lib {
    fn run() I32 { count(Box { items: [1, 2], label: "a" }) + total([3, 4]) + other(); }
    fn name() Str { twice("x"); }
}
`;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-grep-'));
try {
  const file = path.join(dir, 'main.utu');
  await fs.writeFile(file, SOURCE);
  const run = (...args) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'grep', ...args, '--json', file], { encoding: 'utf8' });
    return { status: r.status, matches: r.stdout.trim() ? JSON.parse(r.stdout) : [], stderr: r.stderr };
  };
  const lines = result => result.matches.map(m => m.line);

  // A recurring hole: the same code on both sides.
  const doubled = run('$a + $a');
  assert.deepEqual(lines(doubled), [10, 13]);
  // Filtered by the checked type of a hole.
  assert.deepEqual(lines(run('$a + $a', '--where', 'a: Str')), [13]);
  assert.deepEqual(lines(run('$a + $a', '--where', 'a: I32')), [10]);
  // Bindings, as places.
  assert.equal(SOURCE.slice(doubled.matches[1].bindings.a.start, doubled.matches[1].bindings.a.end), 's');
  // Methods by name, on any receiver; then only arrays.
  assert.deepEqual(lines(run('$v.len()')), [5]);
  assert.deepEqual(lines(run('$v.len()', '--where', 'v: Array[*]')), [5]);
  assert.deepEqual(lines(run('$v.len()', '--where', 'v: Str')), []);
  // A run of arguments, and a lone hole over every expression of a type.
  assert.deepEqual(lines(run('count($...args)')), [21]);
  assert.ok(lines(run('$e', '--where', 'e: Box')).includes(21));
  // Statements in a row.
  assert.deepEqual(lines(run('let $n = $v; $_;')), [8, 16]);
  assert.deepEqual(lines(run('let $n = $v; $_;', '--where', 'v: I32')), [8, 16]);
  // References follow resolution: `count` the function, not the local.
  const refs = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'grep', '--refs', 'count', '--json', file], { encoding: 'utf8' });
  const found = JSON.parse(refs.stdout).map(m => [m.line, m.kind, Boolean(m.declaration)]);
  assert.deepEqual(found, [[5, 'Fn', true], [16, 'Local', true], [17, 'Local', false], [21, 'Fn', false]]);
  // Nothing found: exit 1; a pattern that is not utu: exit 2.
  assert.equal(run('nothing($x)').status, 1);
  assert.equal(run('if if').status, 2);
  console.log('grep: holes, recurring holes, runs, type filters, statements, references by resolution, exit status');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
