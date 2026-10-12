// Compile a Foundry entry file (which imports the sim module) with the
// repository's compiler.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportObject, createCompiler, emitBinary, initParser, instantiateLowered } from '../../../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

export async function compileFoundry(entry = 'headless.utu', { optimize = 'size' } = {}) {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize,
    readFile: file => fs.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const file = path.join(HERE, '../utu', entry);
  const started = performance.now();
  const doc = await compiler.compileFile(file);
  const errors = [...doc.querySelectorAll('[data-error]')].map(node => {
    const line = node.dataset.row ? ` (line ${node.dataset.row})` : '';
    return `${node.dataset.errorMessage ?? node.dataset.error}${line}`;
  });
  if (errors.length) throw new Error(`foundry ${entry}:\n  ${[...new Set(errors)].slice(0, 20).join('\n  ')}`);
  const wasm = emitBinary(doc);
  const compileMs = performance.now() - started;
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc));
  return { exports: instance.exports, wasm, compileMs, doc };
}
