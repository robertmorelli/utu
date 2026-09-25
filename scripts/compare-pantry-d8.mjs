// Pantry's data work in d8, without a DOM: UTU (-Oz and -O3) against the same
// code in plain JavaScript. Node compiles and bundles; every warmup and timing
// runs inside d8. Set D8_BIN to choose the d8 executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { initParser, createCompiler, emitBinary } from '../src/index.js';
import { glueModuleSource, liveGlueFields } from '../src/runtime/host-imports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist/compare-pantry');
await fs.mkdir(out, { recursive: true });
const parser = await initParser({ wasmDir: `${ROOT}/` });
const entry = path.join(ROOT, 'benchmarks/pantry/kernels.utu');
const modules = {};
try {
  for (const [mode, optimize] of [['oz', 'size'], ['o3', 'speed']]) {
    const compiler = createCompiler({ parser, target: 'normal', optimize, readFile: f => fs.readFile(f, 'utf8'),
      resolvePath: (from, r) => path.resolve(path.dirname(from), r) });
    const doc = await compiler.compileFile(entry);
    const error = doc.querySelector('[data-error]');
    if (error) throw new Error(error.dataset.errorMessage);
    const wasm = emitBinary(doc);
    const root = doc.body.firstChild;
    const glue = glueModuleSource(JSON.parse(root.dataset.dslImportsJs), await liveGlueFields(wasm));
    const gluePath = path.join(out, `kernels-${mode}-glue.mjs`);
    await fs.writeFile(gluePath, glue);
    modules[mode] = { wasm: [...wasm], gluePath, spec: JSON.parse(root.dataset.dslImportsJs), closure: JSON.parse(root.dataset.closureRuntime ?? 'null') };
  }
} finally { parser.delete(); }

const runtime = JSON.stringify(path.join(ROOT, 'src/runtime/host-imports.js'));
const source = `
  import { importObjectFromGlue, closureImports } from ${runtime};
  import * as js from ${JSON.stringify(path.join(ROOT, 'benchmarks/pantry/kernels.mjs'))};
  import * as ozGlue from ${JSON.stringify(modules.oz.gluePath)};
  import * as o3Glue from ${JSON.stringify(modules.o3.gluePath)};
  function instantiate(bytes, spec, closure, glue) {
    const imports = importObjectFromGlue(spec, glue);
    if (closure) imports.utu = closureImports(closure, imports.utu);
    const module = new WebAssembly.Module(new Uint8Array(bytes), { builtins: ['js-string'], importedStringConstants: "'" });
    return new WebAssembly.Instance(module, imports).exports;
  }
  const variants = {
    JavaScript: js,
    'UTU -O3': instantiate(${JSON.stringify(modules.o3.wasm)}, ${JSON.stringify(modules.o3.spec)}, ${JSON.stringify(modules.o3.closure)}, o3Glue),
    'UTU -Oz': instantiate(${JSON.stringify(modules.oz.wasm)}, ${JSON.stringify(modules.oz.spec)}, ${JSON.stringify(modules.oz.closure)}, ozGlue),
  };
  const names = ['Honeycrisp apples', 'Oat milk', 'Sourdough loaf', 'Basmati rice', 'Greek yogurt', 'Baby spinach', 'Rolled oats', 'Sesame bagels'];
  const categories = ['Produce', 'Dairy', 'Bakery', 'Pantry'];
  const inventory = n => Array.from({ length: n }, (_, i) => ({ id: 'item' + i, name: names[i % 8] + ' ' + i,
    category: categories[(i * 7) % 4], price: ((i * 37) % 1000) / 100, quantity: (i * 13) % 11 }));
  const cases = [
    ['analyze 8 items', f => f.analyze, () => [inventory(8), 'All', 'o']],
    ['analyze 1000 items', f => f.analyze, () => [inventory(1000), 'Dairy', 'e']],
    ['native 2000 items', f => f.native, () => [2000]],
  ];
  const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];
  const report = {};
  for (const [label, pick, args] of cases) {
    const input = args();
    const expected = pick(js)(...input.map(a => Array.isArray(a) ? a.slice() : a));
    report[label] = {};
    // Calibrate a batch to about 5 ms of JavaScript, then use the same batch everywhere.
    let batch = 1;
    for (;;) { const t = performance.now(); for (let i = 0; i < batch; i++) pick(js)(...input); if (performance.now() - t > 5) break; batch *= 2; }
    const samples = Object.fromEntries(Object.keys(variants).map(name => [name, []]));
    for (const name of Object.keys(variants)) {
      const result = pick(variants[name])(...input);
      if (Math.abs(result - expected) > 1e-9) throw new Error(label + ': ' + name + ' returned ' + result + ', expected ' + expected);
      for (let w = 0; w < 20; w++) for (let i = 0; i < batch; i++) pick(variants[name])(...input);
    }
    for (let round = 0; round < 25; round++) {
      const order = Object.keys(variants);
      for (let r = 0; r < round % order.length; r++) order.push(order.shift());
      for (const name of order) {
        const fn = pick(variants[name]);
        const t = performance.now();
        for (let i = 0; i < batch; i++) fn(...input);
        samples[name].push((performance.now() - t) * 1000 / batch);
      }
    }
    const base = median(samples.JavaScript);
    for (const name of Object.keys(variants)) {
      const us = median(samples[name]);
      report[label][name] = { microsecondsPerCall: Number(us.toFixed(3)), relativeToJavaScript: Number((us / base).toFixed(2)) };
    }
  }
  print('RESULT ' + JSON.stringify(report));
`;
const script = path.join(out, 'kernels-d8.js');
await build({ stdin: { contents: source, resolveDir: ROOT, loader: 'js' }, bundle: true, outfile: script, platform: 'neutral', format: 'iife', target: 'es2022', logLevel: 'silent' });
const executable = process.env.D8_BIN ?? path.join(os.homedir(), '.jsvu/bin/v8');
const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0) throw new Error('d8 unavailable: set D8_BIN to the d8 executable');
const run = spawnSync(executable, [script], { encoding: 'utf8', timeout: 600000 });
if (run.error || run.status !== 0) throw new Error(run.error?.message ?? `${run.stdout}\n${run.stderr}`);
const line = run.stdout.split('\n').find(l => l.startsWith('RESULT '));
if (!line) throw new Error(`d8 produced no results:\n${run.stdout}\n${run.stderr}`);
const report = { engine: version.stdout.trim(), results: JSON.parse(line.slice(7)) };
await fs.writeFile(path.join(out, 'report-d8.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
