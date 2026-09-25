// Equivalent programs (DeltaBlue and the benchmark suite), UTU vs. the same
// program in JavaScript, in one shell process per engine: d8, SpiderMonkey and
// JavaScriptCore. Identical inputs, iterations and alternating samples; every
// result is checked. Node only compiles and bundles.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { initParser, createCompiler, emitBinary } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist/compare-programs');
await fs.mkdir(out, { recursive: true });
const programs = { scalar: 'suite/scalar', strings: 'suite/strings', analyzer: 'suite/analyzer', sieve: 'suite/sieve', deltablue: 'deltablue/deltablue' };
const parser = await initParser({ wasmDir: `${ROOT}/` });
try {
  for (const [stem, file] of Object.entries(programs)) {
    const compiler = createCompiler({ parser, target: 'normal', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (from, r) => path.resolve(path.dirname(from), r) });
    const doc = await compiler.compileFile(path.join(ROOT, 'benchmarks', `${file}.utu`));
    await fs.writeFile(path.join(out, `${stem}.wasm`), emitBinary(doc));
  }
} finally { parser.delete(); }

const js = stem => JSON.stringify(path.join(ROOT, 'benchmarks', `${programs[stem]}.js`));
const harness = `
  import * as scalarJs from ${js('scalar')};
  import * as stringsJs from ${js('strings')};
  import * as analyzerJs from ${js('analyzer')};
  import * as sieveJs from ${js('sieve')};
  import { benchChain, benchProjection } from ${js('deltablue')};
  const argv = typeof scriptArgs !== 'undefined' ? scriptArgs : Array.from(arguments);
  const readBytes = p => typeof readbuffer === 'function' ? new Uint8Array(readbuffer(p)) : read(p, 'binary');
  const options = { builtins: ['js-string'], importedStringConstants: "'" };
  const utu = {};
  for (const stem of ${JSON.stringify(Object.keys(programs))}) utu[stem] = new WebAssembly.Instance(new WebAssembly.Module(readBytes(argv[0] + '/' + stem + '.wasm'), options), {}).exports;
  const asciiPiece = n => 'utu-wasm-rope-0123456789abcdef'.repeat(Math.ceil(n / 30)).slice(0, n);
  const checksum = v => v.length ^ v.charCodeAt(v.length >> 1) ^ v.charCodeAt(v.length - 1);
  const block = '// generated source fixture 104729\\nfn transform_item(value_17: I32) I32 {\\n  let scaled = value_17 * 31 + 7;\\n  if scaled > 4096 { return scaled - 113; }\\n  for (0..<12) |index| { scaled = scaled + index; };\\n  let message = "utu \\\\183 parser [fixture]"; /* balanced comment */\\n  scaled;\\n}\\n';
  const document = block.repeat(Math.ceil(262144 / block.length)).slice(0, 262144);
  const base = asciiPiece(65536);
  const cases = [
    ['scalar recurrence', m => () => m.scalar.run(1000000)],
    ['strings: tiny chunks', m => () => checksum(m.strings.run(base, asciiPiece(8), 8192))],
    ['strings: medium chunks', m => () => checksum(m.strings.run(base, asciiPiece(32), 2048))],
    ['strings: large chunks', m => () => checksum(m.strings.run(base, asciiPiece(1024), 64))],
    ['source analyzer', m => () => m.analyzer.run(document)],
    ['prime sieve', m => () => m.sieve.run(100000)],
    ['DeltaBlue chain', m => () => m.deltablue.chain()],
    ['DeltaBlue projection', m => () => m.deltablue.projection()],
  ];
  const variants = {
    JavaScript: { scalar: scalarJs, strings: stringsJs, analyzer: analyzerJs, sieve: sieveJs, deltablue: { chain: () => benchChain(20), projection: () => benchProjection(20) } },
    UTU: { ...utu, deltablue: { chain: () => utu.deltablue.main(0, 20), projection: () => utu.deltablue.main(1, 20) } },
  };
  const median = v => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
  const report = {};
  for (const [name, make] of cases) {
    const runs = { JavaScript: make(variants.JavaScript), UTU: make(variants.UTU) };
    const expected = Number(runs.JavaScript());
    if (Number(runs.UTU()) !== expected) throw new Error(name + ': UTU returned ' + runs.UTU() + ', JavaScript ' + expected);
    for (const k in runs) for (let i = 0; i < 5; i++) runs[k]();
    const times = { JavaScript: [], UTU: [] };
    for (let s = 0; s < 15; s++) for (const k of (s % 2 ? ['UTU', 'JavaScript'] : ['JavaScript', 'UTU'])) {
      const t = performance.now(); runs[k](); times[k].push(performance.now() - t);
    }
    report[name] = { JavaScript: median(times.JavaScript), UTU: median(times.UTU) };
  }
  print(JSON.stringify(report));
`;
const script = path.join(out, 'harness.js');
await build({ stdin: { contents: harness, resolveDir: ROOT, loader: 'js' }, bundle: true, outfile: script, format: 'iife', platform: 'neutral', target: 'es2020', logLevel: 'silent' });

const home = os.homedir(), jsc = path.join(ROOT, '.tmp/jsc/out/Release');
const engines = [
  ['V8 (d8)', path.join(home, '.jsvu/bin/v8'), [script, '--', out], {}],
  ['SpiderMonkey', path.join(home, '.jsvu/bin/sm'), [script, out], {}],
  ['JavaScriptCore', path.join(jsc, 'jsc'), [script, '--', out], { DYLD_FRAMEWORK_PATH: jsc, DYLD_LIBRARY_PATH: jsc }],
];
const rows = {};
for (const [name, bin, args, env] of engines) {
  const run = spawnSync(bin, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 900000 });
  if (run.error || run.status !== 0) { console.warn(`skip ${name}: ${(run.error?.message ?? run.stderr).split('\n')[0]}`); continue; }
  rows[name] = JSON.parse(run.stdout.trim().split('\n').at(-1));
}
const names = Object.keys(Object.values(rows)[0] ?? {});
console.log('UTU time ÷ JavaScript time (below 1 = UTU faster)\n');
console.log('program'.padEnd(24) + Object.keys(rows).map(e => e.padStart(16)).join(''));
for (const n of names) console.log(n.padEnd(24) + Object.values(rows).map(r => `${(r[n].UTU / r[n].JavaScript).toFixed(2)}×`.padStart(16)).join(''));
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(rows, null, 2) + '\n');
