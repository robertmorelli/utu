// `utu format` (formatUtuSource): every program in examples/, std/ and
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
import { createSyntaxShape, formatUtu, formatUtuSource } from '../src/wutu/wutu-tooling.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { loadNodeCompiler } from '../src/selfhost/node.js';
const shape = createSyntaxShape(await loadNodeCompiler());


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
  const { text, refused } = await formatUtu(source, { shape });
  const name = path.relative(ROOT, file);
  assert.equal(refused, null, `${name}: left as is (${refused})`);
  assert.equal(await formatUtuSource(text, { shape }), text, `${name}: formatting twice differs from once`);
  if (text !== source) formatted++;
}

const cases = [
  // Templates are text: `${` stays whole.
  ['fn f(name: Str, age: I32) Str { `${name} is ${age}`; }\n', 'fn f(name: Str, age: I32) Str {\n    `${name} is ${age}`;\n}\n'],
  // `|` fields stay under their struct; a trailing comment stays on its line.
  ['struct P:\n| x: I32 // across\n| y: I32\n\nfn g() I32 { 1; } // one\n', 'struct P:\n    | x: I32 // across\n    | y: I32\n\nfn g() I32 {\n    1;\n} // one\n'],
  // Captures are not split at their comma; an empty block stays `{}`.
  ['fn h(xs: Array[I32]) I32 { xs fold(0) |a, b| { a + b; }; }\nfn k() Void {}\n', 'fn h(xs: Array[I32]) I32 {\n    xs fold(0) |a, b| {\n        a + b;\n    };\n}\nfn k() Void {}\n'],
  // Not a program: left alone.
  ['fn b(x: Bool) I32 {\n    if x { 1; } else { 2; } 3;\n}\n', null],
];
for (const [source, expected] of cases) {
  const { text, refused } = await formatUtu(source, { shape });
  if (expected === null) assert.ok(refused && text === source, `left alone: ${source}`);
  else assert.equal(text, expected);
}

// Brace declarations are formatted even inside modules and alongside ordinary Utu.
{
  const source = 'using Browser from std:Browser\nmod ui {\nwn greeting(text: Str) { span { = text; } }\n}\nhtml { body { = ui.greeting("Hello  世界"); } }\n';
  const expected = `using Browser from std:Browser
mod ui {
    wn greeting(text: Str) {
        span {
            = text;
        }
    }
}
html {
    body {
        = ui.greeting("Hello  世界");
    }
}
`;
  const result = await formatUtu(source, { shape });
  assert.equal(result.refused, null);
  assert.equal(result.text, expected);
  assert.equal(await formatUtuSource(result.text, { shape }), expected);
  assert.notEqual(shape(source), shape(source.replace('Hello  世界', 'Hello 世界')), 'string whitespace is meaningful');
  assert.notEqual(shape(source), shape(source.replace('= text;', '= text; "extra";')), 'Wutu children are meaningful');
}

// Compile formatted brace bodies, including comments, CSS, handlers, and opaque JS.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-format-braces-'));
  try {
    for (const [name, source] of [
      ['components.utu', fs.readFileSync(path.join(ROOT, 'examples/wutu-components/main.utu'), 'utf8')],
      ['reactive.utu', 'using Browser from std:Browser\nwn greeting() { @reactive; div { \"Hello\"; } }\nhtml { body { = greeting(); } }\n'],
      ['page.utu', 'using Browser from std:Browser\nhtml { body { form { label { for="q"; "Find  世界"; } input#q { display: grid; type="search"; } } } }\n'],
    ]) {
      const { text, refused } = await formatUtu(source, { shape });
      assert.equal(refused, null, name);
      assert.notEqual(text, source, `${name}: actually formats`);
      assert.equal(await formatUtuSource(text, { shape }), text, name);
      if (name === 'components.utu') {
        assert.ok(text.includes('// A brace in a comment does not end this wn: }'));
        assert.ok(text.includes('() => { return 1 }'));
      }
      const file = path.join(dir, name);
      fs.writeFileSync(file, source);
      const needsFormatting = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'format', file, '--check'], { encoding: 'utf8' });
      assert.equal(needsFormatting.status, 1, needsFormatting.stderr);
      const formatted = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'format', file], { encoding: 'utf8' });
      assert.equal(formatted.status, 0, formatted.stderr);
      assert.equal(fs.readFileSync(file, 'utf8'), text);
      const checked = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'check', file], { encoding: 'utf8' });
      assert.equal(checked.status, 0, `${name}: ${checked.stderr}`);
      const cliCheck = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'format', file, '--check'], { encoding: 'utf8' });
      assert.equal(cliCheck.status, 0, cliCheck.stderr);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Wutu: `}else{` formats like `} else {` (the island was once left as written).
{
  const text = await formatUtuSource('using Browser from std:Browser;\n\nmain {\n    let n = @wutu/\\\n    main{ if true {b{"a";}}else{u{"b";}} }\n    \\/;\n    Browser.document.body.append(n);\n}\n', { shape });
  assert.match(text, /\} else \{/);
}

// Wutu: `for="x"` stays an attribute (`for = "x"` opens a loop), `#id` stays,
// CSS declarations keep their spacing.
{
  const source = 'using Browser from std:Browser;\n\nmain {\n    let n = @wutu/\\\n    form { label { for="q"; "Find"; } input#q { display: grid; type="search"; } }\n    \\/;\n    Browser.document.body.append(n);\n}\n';
  const text = await formatUtuSource(source, { shape });
  assert.match(text, /for="q"\n/);
  assert.match(text, /input#q \{/);
  assert.match(text, /display: grid\n/);
  assert.equal(await formatUtuSource(text, { shape }), text);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-format-'));
  for (const [name, body] of [['wutu.utu', text], ['templates.utu', await formatUtuSource(fs.readFileSync(path.join(ROOT, 'examples/templates.utu'), 'utf8'), { shape })]]) {
    fs.writeFileSync(path.join(dir, name), body);
    const check = spawnSync(process.execPath, [path.join(ROOT, 'cli/utu.mjs'), 'check', path.join(dir, name)], { encoding: 'utf8' });
    assert.equal(check.status, 0, `${name} formatted does not compile:\n${check.stdout}${check.stderr}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`formatter: ${files.length} programs (${formatted} reformatted) keep their tree and are stable; targeted layout, CLI, and compilation checks passed`);
