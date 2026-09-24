import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { linkFiles } from '../tools/dts/link.mjs';
import { initParser, createCompiler, emitBinary } from '../src/index.js';
import { PLATFORM_SOURCES } from '../src/compiler/platform-sources.generated.js';
import { glueModuleSource, liveGlueFields } from '../src/runtime/host-imports.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abi = linkFiles({ files: [path.join(root, 'benchmarks/abi/arrays.d.ts')], prefix: 'Bench', moduleSpecifier: path.join(root, 'benchmarks/abi/arrays.mjs') });
const parser = await initParser({ wasmDir: root + '/' });
try {
  const source = `using Bench from std:Bench;
    export lib {
      fn indexed(values: Bench.Numbers) F64 {
        let n: F64 = values.length; let total: F64 = 0.0; let i: F64 = 0.0;
        while (i < n) { total = total + values[i]; i = i + 1.0; }; total;
      }
      fn generic(values: Bench.OpaqueNumbers) F64 {
        let n: F64 = values.length; let total: F64 = 0.0; let i: F64 = 0.0;
        while (i < n) { total = total + values[i]; i = i + 1.0; }; total;
      }
      fn callback(values: Bench.Numbers) F64 { values.reduce( cl(a, b) { a + b; }, 0.0); }
      fn batch(values: Bench.Numbers) F64 { Bench.sum(values); }
    }`;
  const compiler = createCompiler({ parser, target: 'normal', stdlib: new Map([...PLATFORM_SOURCES, ['std:Bench', async () => ({ source: 'mod Bench {}', abi })]]), readFile: async()=>source, resolvePath:(_,p)=>p });
  const doc = await compiler.compileFile('/array-benchmark.utu');
  assert(!doc.querySelector('[data-error]'), doc.querySelector('[data-error]')?.dataset.errorMessage);
  const wasm = emitBinary(doc);
  const glue = glueModuleSource(JSON.parse(doc.body.firstChild.dataset.dslImportsJs), await liveGlueFields(wasm));
  const { measureInD8 } = await import('./benchmark-js-arrays-d8.mjs');
  await measureInD8({ root, wasm, doc, glue });
} finally { parser.delete(); }
