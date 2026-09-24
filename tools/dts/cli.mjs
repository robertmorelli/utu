#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { linkFiles } from './link.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${name}`);
  return args[i + 1];
};

if (args.includes('--browser')) {
  const lib = path.dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES2022 }));
  const files = ['lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.dom.asynciterable.d.ts'].map(f => path.join(lib, f));
  const abi = linkFiles({ files, prefix: 'Browser', includeStandardLibrary: true });
  const bytes = gzipSync(JSON.stringify(abi), { level: 9 });
  // Worker globals conflict with lib.dom, so they are linked as their own program over ES only.
  const workerFiles = ['lib.webworker.d.ts', 'lib.webworker.iterable.d.ts', 'lib.webworker.asynciterable.d.ts', 'lib.webworker.importscripts.d.ts']
    .map(f => path.join(lib, f));
  const worker = linkFiles({ files: workerFiles, prefix: 'Worker', includeStandardLibrary: true, compilerOptions: { lib: ['lib.es2022.d.ts'] } });
  const workerBytes = gzipSync(JSON.stringify(worker), { level: 9 });
  await fs.writeFile(path.join(ROOT, 'src/bindings/browser-catalog.generated.js'),
    `// Generated declaration graphs. Regenerate with bun run bindings:browser.\n`
    + `export const BROWSER_ABI_GZIP = ${JSON.stringify(bytes.toString('base64'))};\n`
    + `export const WORKER_ABI_GZIP = ${JSON.stringify(workerBytes.toString('base64'))};\n`);
  console.log(JSON.stringify({ declarationTypes: abi.types.length, compressedBytes: bytes.length,
    workerTypes: worker.types.length, workerCompressedBytes: workerBytes.length }));
} else {
  const input = option('--input');
  if (!input) throw new Error('usage: node tools/dts/cli.mjs --browser | --input file.d.ts --module package --prefix Name --out directory');
  const prefix = option('--prefix', 'Foreign');
  const abi = linkFiles({ files: [path.resolve(input)], prefix, moduleSpecifier: option('--module', null) });
  const out = path.resolve(option('--out', '.'));
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, `${prefix}.abi.json`), JSON.stringify(abi) + '\n');
  console.log(JSON.stringify({ abi: path.join(out, `${prefix}.abi.json`), types: abi.types.length }));
}
