#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { generateBindings } from './generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${name}`);
  return args[i + 1];
};
const browser = args.includes('--browser');
const input = option('--input');
if (!browser && !input) throw new Error('usage: node tools/dts/cli.mjs --browser | --input file.d.ts --module package --prefix Name --out directory');
const lib = path.dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES2022 }));
const files = browser ? ['lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.dom.asynciterable.d.ts'].map(f => path.join(lib, f)) : [path.resolve(input)];
const out = path.resolve(option('--out', path.join(ROOT, 'std/browser')));
const prefix = option('--prefix', browser ? 'Browser' : 'Foreign');
const result = generateBindings({ files, prefix, includeStandardLibrary: browser, moduleSpecifier: option('--module', null) });
await fs.mkdir(out, { recursive: true });
// Only remove files owned by the previous manifest, never unrelated user files.
let previous;
try { previous = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const owned = new Set([...result.sources.keys()].map(name => `${name}.utu`));
for (const file of previous?.files ?? []) {
  if (path.basename(file) !== file || !file.endsWith('.utu')) throw new Error('invalid generated manifest path');
  if (!owned.has(file)) await fs.unlink(path.join(out, file));
}
let sourceBytes = 0;
for (const [name, source] of result.sources) {
  sourceBytes += Buffer.byteLength(source);
  await fs.writeFile(path.join(out, `${name}.utu`), source);
}
const { records, ...report } = result.report;
const counts = Object.fromEntries([...result.sources.keys()].map(name => [name, 0]));
for (const record of records) counts[record.module]++;
const manifest = { ...report, inputs: files.map(f => path.basename(f)), prefix, moduleSpecifier: option('--module', null), sourceBytes,
  files: [...owned], counts };
await fs.writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ modules: report.modules, bindings: report.bindings, sourceBytes, erasedTypes: report.erasures.length, skipped: report.skipped.length }));
