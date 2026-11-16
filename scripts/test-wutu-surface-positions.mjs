import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';
import { programIndex } from '../src/selfhost/query.js';
import { highlighter } from '../src/selfhost/highlight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'scripts/fixtures/wutu-positions.utu');
const checked = spawnSync('bun', [path.join(root, 'cli/utu.mjs'), 'check', fixture], { encoding: 'utf8' });
assert.equal(checked.status, 1);
for (const [kind, line, column] of [['unknown-field', 9, 15], ['unknown-variable', 17, 15], ['wutu-hole', 18, 11]]) {
  assert.match(checked.stdout + checked.stderr, new RegExp(`${kind} · [^\\n]*wutu-positions\\.utu:${line}:${column}`));
}

const entry = path.join(root, 'examples/wutu-components/main.utu');
const utu = await loadNodeCompiler();
const built = await compileFile(utu, entry, { root, target: 'analysis' });
assert.equal(built.diagnostics.filter(d => d.severity === 'error').length, 0);
const index = programIndex(utu, built.files);
const file = built.files.find(f => f.key === entry);
const lines = file.text.split('\n');
for (const [word, line, definitionLine, cls] of [['text', 14, 13, 'parameter'], ['heading_value', 50, 38, 'function']]) {
  const offset = lines.slice(0, line - 1).reduce((n, s) => n + s.length + 1, 0) + lines[line - 1].indexOf(word);
  const decl = index.declarationAt(entry, offset);
  const definition = index.definition(decl);
  assert.equal(definition?.file, entry);
  assert.equal(file.text.slice(0, definition.start).split('\n').length, definitionLine);
  assert.ok(highlighter(utu, built.files)(entry, offset, offset + word.length).some(piece => piece.class === cls && piece.start === offset));
}
console.log('Wutu body errors, definitions, and highlights use original source positions');
