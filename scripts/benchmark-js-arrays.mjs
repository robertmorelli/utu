import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { linkFiles } from '../tools/dts/link.mjs';
import { compile } from '../src/selfhost/compiler.js';
import { loadNodeCompiler, nodeHost, nodeStdlib } from '../src/selfhost/node.js';
import { glueSource } from '../src/selfhost/loader.js';
import { formatDiagnostics } from '../src/selfhost/format.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abi = linkFiles({ files: [path.join(root, 'benchmarks/abi/arrays.d.ts')], prefix: 'Bench', moduleSpecifier: path.join(root, 'benchmarks/abi/arrays.mjs') });
const utu = await loadNodeCompiler();
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
const host = nodeHost({ root, stdlib: new Map([...nodeStdlib(), ['std:Bench', async () => ({ abi })]]) });
const result = await compile(utu, '/array-benchmark.utu', { ...host, optimize: 'size', readFile: async () => source, resolvePath: (_, p) => p });
const errors = result.diagnostics.filter(d => d.severity !== 'warning');
assert(result.wasm && !errors.length, formatDiagnostics(errors, new Map(result.files.map(f => [f.key, f.text]))));
const { wasm, spec } = result;
// Every body runs (as instantiate gives them, by field); the live ones are what ships.
const { measureInD8 } = await import('./benchmark-js-arrays-d8.mjs');
await measureInD8({ root, wasm, spec, glue: glueSource(spec), liveGlue: glueSource(spec, wasm) });
