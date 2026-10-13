// Host declarations kept from program to program build what fresh ones do.
//
// A loaded compiler keeps the declaration documents it has read (and what it
// learned of them) for the programs after; anything kept wrongly would make
// a program's build depend on the ones before it. Programs that import
// std:Browser, std:JS, std:Web, node: modules, or nothing are built in turns
// on one compiler, and each must come out as it does on a fresh one.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const programs = [
  'examples/browser-pantry/main.utu',
  'examples/fannkuch.utu',
  'examples/jpl/jpl.utu',
  'examples/wutu-more/supper/main.utu',
  'baselines/corpus/c1da2c2d2028916e893f2cf5e6404a21e8e1b2b6.utu',
  'examples/browser-pantry/main.utu',
  'examples/promises.utu',
  'examples/jpl/jpl.utu',
  'examples/browser-pantry/main.utu',
].map(file => path.join(ROOT, file));

const summary = built => ({
  wasm: built.wasm ? Buffer.from(built.wasm).toString('base64') : null,
  spec: JSON.stringify(built.spec),
  diagnostics: built.diagnostics.map(d => `${d.kind} ${d.message} ${d.start}`),
});

const kept = await loadNodeCompiler();
for (const file of programs) {
  const fresh = summary(await compileFile(await loadNodeCompiler(), file, { root: ROOT }));
  for (const target of ['normal', 'test']) {
    const again = summary(await compileFile(kept, file, { root: ROOT, target }));
    if (target === 'normal') assert.deepEqual(again, fresh, `${path.relative(ROOT, file)} differs after the programs before it`);
  }
}
console.log(`kept host declarations: ${programs.length} programs build as on a fresh compiler`);
