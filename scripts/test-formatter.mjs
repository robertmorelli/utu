// `wutu format` (formatUtuSource): every program in examples/, std/ and
// docs/src formats to text that parses to the same tree, and formatting
// twice is formatting once. Templates, `@wutu` attributes and selectors,
// `|` fields and trailing comments keep their meaning; a file that does not
// parse is left as it is.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatUtu, formatUtuSource } from '../src/compiler/wutu-tooling.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'error_demo') walk(file); }
    else if (file.endsWith('.utu')) files.push(file);
  }
};
for (const dir of ['examples', 'std', 'docs/src']) walk(path.join(ROOT, dir));

let formatted = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const { text, refused } = formatUtu(source);
  const name = path.relative(ROOT, file);
  assert.equal(refused, null, `${name}: left as is (${refused})`);
  assert.equal(formatUtuSource(text), text, `${name}: formatting twice differs from once`);
  if (text !== source) formatted++;
}

const cases = [
  // Templates are text: `${` stays whole.
  ['fn f(name: Str, age: I32) Str { `${name} is ${age}`; }\n', 'fn f(name: Str, age: I32) Str {\n    `${name} is ${age}`;\n}\n'],
  // `|` fields stay under their struct; a trailing comment stays on its line.
  ['struct P:\n| x: I32 // across\n| y: I32\n\nfn g() I32 { 1; } // one\n', 'struct P:\n    | x: I32 // across\n    | y: I32\n\nfn g() I32 {\n    1;\n} // one\n'],
  // Captures are not split at their comma; an empty block stays `{}`.
  ['fn h(xs: Array[I32]) I32 { xs fold(0) |a, b| { a + b; }; }\nfn k() void {}\n', 'fn h(xs: Array[I32]) I32 {\n    xs fold(0) |a, b| {\n        a + b;\n    };\n}\nfn k() void {}\n'],
  // Not a program: left alone.
  ['fn b(x: Bool) I32 {\n    if x { 1; }\n    else { 2; }\n}\n', null],
];
for (const [source, expected] of cases) {
  const { text, refused } = formatUtu(source);
  if (expected === null) assert.ok(refused && text === source, `left alone: ${source}`);
  else assert.equal(text, expected);
}

// Wutu: `for="x"` stays an attribute (`for = "x"` opens a loop), `#id` stays,
// CSS declarations keep their spacing.
{
  const source = 'using Browser from std:Browser;\n\nexport main() void {\n    let n = @wutu/\\\n    form { label { for="q"; "Find"; } input#q { display: grid; type="search"; } }\n    \\/;\n    Browser.document.body.append(n);\n}\n';
  const text = formatUtuSource(source);
  assert.match(text, /for="q";/);
  assert.match(text, /input#q \{/);
  assert.match(text, /display: grid;/);
  assert.equal(formatUtuSource(text), text);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-format-'));
  for (const [name, body] of [['wutu.utu', text], ['templates.utu', formatUtuSource(fs.readFileSync(path.join(ROOT, 'examples/templates.utu'), 'utf8'))]]) {
    fs.writeFileSync(path.join(dir, name), body);
    const check = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'check', path.join(dir, name)], { encoding: 'utf8' });
    assert.equal(check.status, 0, `${name} formatted does not compile:\n${check.stdout}${check.stderr}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`formatter: ${files.length} programs (${formatted} reformatted) keep their tree and are stable; ${cases.length + 1} cases passed`);
