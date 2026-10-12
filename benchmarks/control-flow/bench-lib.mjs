// Shared helpers: compile utu sources at -Oz / -O3, time exports, report size.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildImportObject, createCompiler, emitBinary, initParser, instantiateLowered } from '../../src/index.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const engine = typeof Bun !== 'undefined' ? `JSC (Bun ${Bun.version})` : `V8 (Node ${process.versions.node})`;
const parser = await initParser({ wasmDir: `${ROOT}/` });
const TMP = path.join(ROOT, '.tmp', 'control-flow-bench');
await fs.mkdir(TMP, { recursive: true });

export async function compileUtu(name, source, optimize = 'size') {
  const compiler = createCompiler({
    parser, target: 'normal', optimize,
    readFile: file => fs.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const file = path.join(TMP, `${name}.utu`);
  await fs.writeFile(file, source);
  const doc = await compiler.compileFile(file);
  const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
  const wasm = emitBinary(doc);
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc));
  return { exports: instance.exports, bytes: wasm.length, gzip: gzipSync(wasm, { level: 9 }).length };
}

/** Median wall time in milliseconds over `rounds`, after warmup. */
export function time(run, { rounds = Number(process.env.ROUNDS ?? 15), warmup = 3 } = {}) {
  for (let i = 0; i < warmup; i++) run();
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1];
}

export function row(label, ms, extra = '') {
  console.log(`  ${label.padEnd(30)} ${ms.toFixed(2).padStart(9)} ms  ${extra}`);
}
