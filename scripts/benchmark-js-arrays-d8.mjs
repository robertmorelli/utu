import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

/** Node only builds the fixture. Every warmup and timing runs inside d8. */
export async function measureInD8({ root, wasm, doc, glue }) {
  const out = path.join(root, 'dist/benchmarks');
  await fs.mkdir(out, { recursive: true });
  const gluePath = path.join(out, 'array-glue.mjs');
  await fs.writeFile(gluePath, glue);
  const spec = JSON.parse(doc.body.firstChild.dataset.dslImportsJs);
  const closure = JSON.parse(doc.body.firstChild.dataset.closureRuntime);
  const source = `
    import * as glue from ${JSON.stringify(gluePath)};
    import { importObjectFromGlue, closureImports } from ${JSON.stringify(path.join(root,'src/runtime/host-imports.js'))};
    import { sum } from ${JSON.stringify(path.join(root,'benchmarks/abi/arrays.mjs'))};
    import { measureArrays } from ${JSON.stringify(path.join(root,'benchmarks/abi/measure.mjs'))};
    const imports=importObjectFromGlue(${JSON.stringify(spec)},glue);
    imports.utu=closureImports(${JSON.stringify(closure)},imports.utu);
    const module=new WebAssembly.Module(new Uint8Array(${JSON.stringify([...wasm])}),{builtins:['js-string'],importedStringConstants:"'"});
    const {exports:e}=new WebAssembly.Instance(module,imports);
    const result=measureArrays({javascript:sum,javascriptReduce:v=>v.reduce((a,b)=>a+b,0),utuIndexed:e.indexed,utuGeneric:e.generic,utuCallback:e.callback,utuBatch:e.batch});
    print('RESULT '+JSON.stringify(result));
  `;
  const script = path.join(out, 'js-arrays-d8.js');
  await build({ stdin:{contents:source,resolveDir:root,loader:'js'},bundle:true,outfile:script,platform:'neutral',format:'iife',target:'es2022' });
  await fs.unlink(gluePath);
  const executable = process.env.D8_BIN ?? path.join(os.homedir(), '.jsvu/bin/v8');
  const version = spawnSync(executable, ['--version'], { encoding:'utf8' });
  if (version.error || version.status !== 0) throw new Error('d8 unavailable: set D8_BIN to the d8 executable');
  const run = spawnSync(executable, [script], { encoding:'utf8', timeout:120000 });
  if (run.error || run.status !== 0) throw new Error(run.error?.message ?? `${run.stdout}\n${run.stderr}`);
  const line = run.stdout.split('\n').find(line=>line.startsWith('RESULT '));
  if (!line) throw new Error(`d8 produced no results: ${run.stdout}`);
  const report = { engine:version.stdout.trim(), flags:[], platform:process.platform,arch:process.arch,
    methodology:'15 rotating-order samples after 10 warmup rounds. Same JS arrays and sums; setup/compilation excluded. Median and p10/p90 nanoseconds per element. Batch makes one crossing per entire sum.',
    wasmBytes:wasm.length,wasmGzip:gzipSync(wasm).length,liveGlueBytes:Buffer.byteLength(glue),...JSON.parse(line.slice(7)) };
  await fs.writeFile(path.join(out,'js-arrays-d8.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
