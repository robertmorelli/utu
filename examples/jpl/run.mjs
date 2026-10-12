// Run the utu JPL lexer under the current JS engine (V8 with node, JSC with bun):
//
//   node examples/jpl-lexer/run.mjs <file.jpl> -l | -_ | -bench
//
// Compiles lexer.utu at -O3, then calls its `main`, which reads process.argv.
// `utu build-exe` makes a standalone Bun executable of the same program.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportObject, createCompiler, emitBinary, initParser, instantiateLowered } from '../../src/index.js';
import { nodePackageResolver } from '../../tools/dts/packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const compiler = createCompiler({
  parser: await initParser({ wasmDir: `${root}/` }),
  target: 'normal',
  optimize: 'speed',
  readFile: file => fs.readFile(file, 'utf8'),
  readBinaryFile: file => fs.readFile(file),
  resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  resolvePackage: nodePackageResolver({ root }),
});
const doc = await compiler.compileFile(path.join(here, 'jpl.utu'));
const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
if (errors.length) throw new Error(errors.join('\n'));
const wasm = emitBinary(doc);
const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: root }));
instance.exports.main();
