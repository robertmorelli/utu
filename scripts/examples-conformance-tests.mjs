import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitBinary } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One test per file, so the runner can spread them across workers. Codegen is
// validated at -O0; `wasm-fingerprints.mjs --optimized` builds every example
// at -Oz and -O3 too.
export function registerExamplesConformanceTests({ test, assertNoErrors, makeCompiler }) {
  for (const file of utuFiles(path.join(ROOT, 'examples'))) {
    const name = path.relative(ROOT, file);
    test(`examples: ${name} analyses and emits valid Wasm`, async ({ ROOT }) => {
      // Wutu programs, and Result's try and errdefer, are built by the self-hosted compiler alone (stage 0 refuses them).
      const refusesWutu = (error) => String(error?.message ?? '').includes(' are compiled by the self-hosted compiler');
      let analyzed;
      try {
        analyzed = await (await makeCompiler({ ROOT, target: 'analysis' })).analyzeFile(file);
      } catch (error) {
        if (!refusesWutu(error)) throw error;
      }
      if (!analyzed || analyzed.artifacts?.diagnostics?.some(refusesWutu)) {
        await buildWithSelfhost(file, name);
        return;
      }
      try {
        assertNoErrors(analyzed.doc);
      } catch (error) {
        throw new Error(`${name} (analysis): ${error.message}`);
      }

      const compiled = await (await makeCompiler({ ROOT, target: 'normal', optimize: 'none' })).analyzeFile(file);
      try {
        assertNoErrors(compiled.doc);
        emitBinary(compiled.doc);
      } catch (error) {
        throw new Error(`${name} (codegen): ${error.message}`);
      }
    });
  }
}

/** A Wutu program: the self-hosted compiler builds it without errors, and the engine accepts its module. */
async function buildWithSelfhost(file, name) {
  const { compileFile, loadNodeCompiler } = await import('../src/selfhost/node.js');
  const result = await compileFile(await loadNodeCompiler(), file, { optimize: 'none' });
  const errors = result.diagnostics.filter(d => d.severity !== 'warning');
  if (!result.wasm || errors.length) throw new Error(`${name} (self-hosted): ${errors.map(d => d.message).join('; ')}`);
  new WebAssembly.Module(result.wasm, { builtins: ['js-string'], importedStringConstants: "'" });
}

function utuFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    // Intentionally-invalid programs used to demonstrate editor diagnostics.
    if (entry.isDirectory() && entry.name === 'error_demo') continue;
    if (entry.isDirectory()) out.push(...utuFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.utu')) out.push(file);
  }
  return out.sort();
}
