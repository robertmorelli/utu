#!/usr/bin/env bun
// scripts/run-binary.mjs — compile a .utu source to wasm, then run an export.
//
// Usage:
//   bun ./scripts/run-binary.mjs <file.utu> [export] [args...]
//   bun ./scripts/run-binary.mjs <file.utu> --emit-wat
//   bun ./scripts/run-binary.mjs <file.utu> --emit-bin <out.wasm>
//
// Examples:
//   bun ./scripts/run-binary.mjs add.utu add 2 3
//   bun ./scripts/run-binary.mjs add.utu --emit-wat
//
// Argument parsing is positional and intentionally tiny — this is a dev
// harness, not a packaged CLI.

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCompiler, initParser, emitBinary, emitText } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printUsage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const filePath = path.resolve(argv[0]);
  const rest = argv.slice(1);

  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser,
    target: 'normal',
    readFile: async (p) => fs.readFile(p, 'utf8'),
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
  });

  const doc = await compiler.compileFile(filePath);
  reportIRErrors(doc, filePath);

  if (rest[0] === '--emit-wat') {
    process.stdout.write(emitText(doc));
    return;
  }

  if (rest[0] === '--emit-bin') {
    const out = rest[1] ?? filePath.replace(/\.utu$/, '.wasm');
    await fs.writeFile(out, emitBinary(doc));
    console.error(`wrote ${out}`);
    return;
  }

  // Default: instantiate and call the requested export (or list exports if none).
  const bin = emitBinary(doc);
  const { instance } = await WebAssembly.instantiate(bin);
  const exportName = rest[0];

  if (!exportName) {
    const names = Object.keys(instance.exports);
    console.error(`Exports: ${names.join(', ') || '(none)'}`);
    console.error(`Pass an export name to call it: bun run-binary.mjs ${argv[0]} <export> [args...]`);
    return;
  }

  const fn = instance.exports[exportName];
  if (typeof fn !== 'function') {
    console.error(`Not a callable export: ${exportName}`);
    process.exit(2);
  }

  const args = rest.slice(1).map(parseArg);
  const result = fn(...args);
  console.log(result);
}

function parseArg(s) {
  if (/^-?\d+$/.test(s))     return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function reportIRErrors(doc, filePath) {
  const errs = [...doc.querySelectorAll('[data-error]')];
  if (errs.length === 0) return;
  for (const e of errs) {
    const span = e.dataset.start && e.dataset.end ? ` @${e.dataset.start}-${e.dataset.end}` : '';
    console.error(`${filePath}${span}: ${e.localName}: ${e.getAttribute('data-error')}`);
  }
  process.exit(1);
}

function printUsage() {
  console.error(`Usage:
  bun ./scripts/run-binary.mjs <file.utu> <export> [args...]
  bun ./scripts/run-binary.mjs <file.utu> --emit-wat
  bun ./scripts/run-binary.mjs <file.utu> --emit-bin [out.wasm]`);
}

main().catch(err => { console.error(err.stack ?? err.message); process.exit(1); });
