// The invariant for compiler refactors: every program compiles to the same wasm.
//
//   node scripts/wasm-fingerprints.mjs --record   write .tmp/wasm-fingerprints.json
//   node scripts/wasm-fingerprints.mjs            compare against it
//
// Covers every .utu program under examples/ and benchmarks/ at -Oz and -O3,
// plus each program's diagnostics when it does not compile. Exits 1 on any
// difference.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler, emitBinary, initParser } from '../src/index.js';
import { nodePackageResolver } from '../tools/dts/packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, '.tmp', 'wasm-fingerprints.json');
const record = process.argv.includes('--record');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);

async function programs(directory) {
  const out = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'error_demo', 'dist', '.utu'].includes(entry.name)) continue;
      out.push(...await programs(file));
    } else if (entry.name.endsWith('.utu')) {
      const source = await fs.readFile(file, 'utf8');
      // Entry files only: imported modules are compiled through them.
      if (/^\s*export\s+(main|lib)\b/m.test(source)) out.push(file);
    }
  }
  return out.sort();
}

const parser = await initParser({ wasmDir: `${ROOT}/` });
const compilers = Object.fromEntries(['size', 'speed'].map(optimize => [optimize, createCompiler({
  parser, target: 'normal', optimize,
  readFile: file => fs.readFile(file, 'utf8'),
  readBinaryFile: file => fs.readFile(file),
  resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  resolvePackage: nodePackageResolver({ root: ROOT }),
})]));

const files = [...await programs(path.join(ROOT, 'examples')), ...await programs(path.join(ROOT, 'benchmarks'))]
  .filter(file => !only || file.includes(only));
const results = {};
const started = performance.now();
for (const file of files) {
  for (const [optimize, compiler] of Object.entries(compilers)) {
    const key = `${path.relative(ROOT, file)} ${optimize}`;
    try {
      const doc = await compiler.compileFile(file);
      const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
      results[key] = errors.length ? `errors: ${errors.join(' | ')}`
        : createHash('sha256').update(emitBinary(doc)).digest('hex');
    } catch (error) {
      results[key] = `throws: ${String(error.message).split('\n')[0]}`;
    }
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);

if (record) {
  await fs.mkdir(path.dirname(RECORD), { recursive: true });
  await fs.writeFile(RECORD, JSON.stringify(results, null, 1));
  const compiled = Object.values(results).filter(value => /^[0-9a-f]{64}$/.test(value)).length;
  console.log(`recorded ${Object.keys(results).length} builds (${compiled} compile) in ${seconds} s`);
} else {
  const expected = JSON.parse(await fs.readFile(RECORD, 'utf8'));
  const differ = Object.keys(results).filter(key => expected[key] !== results[key]);
  for (const key of differ) console.log(`DIFFERS ${key}\n  was ${expected[key]}\n  now ${results[key]}`);
  console.log(`${Object.keys(results).length - differ.length}/${Object.keys(results).length} builds identical in ${seconds} s`);
  if (differ.length) process.exit(1);
}
