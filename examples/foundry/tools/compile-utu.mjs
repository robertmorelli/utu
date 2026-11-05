// Compile a Foundry entry file (which imports the sim module).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../../../src/selfhost/node.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

export async function compileFoundry(entry = 'headless.utu', { optimize = 'size' } = {}) {
  const file = path.join(HERE, '../utu', entry);
  const started = performance.now();
  const result = await compileFile(await loadNodeCompiler(), file, { root: ROOT, optimize });
  const errors = result.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  if (!result.wasm || errors.length) throw new Error(`foundry ${entry}:\n  ${errors.map(error => error.message).slice(0, 20).join('\n  ')}`);
  const compileMs = performance.now() - started;
  const { instance } = await instantiateNode(result.wasm, result.spec, { root: ROOT });
  return { exports: instance.exports, wasm: result.wasm, compileMs, result };
}
