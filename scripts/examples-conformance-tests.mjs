import fs from 'node:fs/promises';
import path from 'node:path';
import { emitBinary } from '../src/index.js';

export function registerExamplesConformanceTests({ test, assertNoErrors, makeCompiler }) {
  test('examples: every .utu file analyses and emits valid Wasm', async ({ ROOT }) => {
    const files = await utuFiles(path.join(ROOT, 'examples'));
    const analysis = await makeCompiler({ ROOT, target: 'analysis' });
    const normal = await makeCompiler({ ROOT, target: 'normal' });

    for (const file of files) {
      const analyzed = await analysis.analyzeFile(file);
      try {
        assertNoErrors(analyzed.doc);
      } catch (error) {
        throw new Error(`${path.relative(ROOT, file)} (analysis): ${error.message}`);
      }

      const compiled = await normal.analyzeFile(file);
      try {
        assertNoErrors(compiled.doc);
        emitBinary(compiled.doc);
      } catch (error) {
        throw new Error(`${path.relative(ROOT, file)} (codegen): ${error.message}`);
      }
    }
  });
}

async function utuFiles(directory) {
  const out = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    // Intentionally-invalid programs used to demonstrate editor diagnostics.
    if (entry.isDirectory() && entry.name === 'error_demo') continue;
    if (entry.isDirectory()) out.push(...await utuFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.utu')) out.push(file);
  }
  return out.sort();
}
