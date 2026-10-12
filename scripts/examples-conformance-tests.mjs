import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitBinary } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One test per file, so the runner can spread them across workers. Codegen is
// validated at -O0; `wasm-fingerprints.mjs --optimized` runs Binaryen's
// optimizer over every example.
export function registerExamplesConformanceTests({ test, assertNoErrors, makeCompiler }) {
  for (const file of utuFiles(path.join(ROOT, 'examples'))) {
    const name = path.relative(ROOT, file);
    test(`examples: ${name} analyses and emits valid Wasm`, async ({ ROOT }) => {
      const analyzed = await (await makeCompiler({ ROOT, target: 'analysis' })).analyzeFile(file);
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
