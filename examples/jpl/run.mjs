// Run the utu JPL compiler under the current JS engine (V8 with node, JSC with bun):
//
//   node examples/jpl/run.mjs <file.jpl> -l | -_ | -p -q | -t -q | -bench
//
// Compiles jpl.utu at -O3, then calls its `main`, which reads process.argv.
// The wasm is cached under node_modules/.utu, keyed by jpl.utu and the
// compiler's sources, so repeated runs skip the 20–30 s compile.
// `utu build-exe` makes a standalone Bun executable of the same program.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportObject, instantiateLowered } from '../../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = path.join(here, 'jpl.utu');

async function cacheKey() {
  const hash = createHash('sha256').update(await fs.readFile(source));
  const files = (await fs.readdir(path.join(root, 'src'), { recursive: true })).filter(file => file.endsWith('.js')).sort();
  for (const file of files) hash.update(file).update(await fs.readFile(path.join(root, 'src', file)));
  return hash.digest('hex').slice(0, 16);
}

async function compile() {
  const [{ createCompiler, emitBinary, initParser }, { nodePackageResolver }] = await Promise.all([
    import('../../src/index.js'), import('../../tools/dts/packages.mjs'),
  ]);
  const compiler = createCompiler({
    parser: await initParser({ wasmDir: `${root}/` }),
    target: 'normal',
    optimize: 'speed',
    readFile: file => fs.readFile(file, 'utf8'),
    readBinaryFile: file => fs.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    resolvePackage: nodePackageResolver({ root }),
  });
  const doc = await compiler.compileFile(source);
  const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
  if (errors.length) throw new Error(errors.join('\n'));
  // The import object is built from the root's runtime specs, so they are all a run needs.
  return { wasm: emitBinary(doc), dataset: { ...doc.body.firstChild.dataset } };
}

const cache = path.join(root, 'node_modules', '.utu', `jpl-${await cacheKey()}`);
let wasm, dataset;
try {
  [wasm, dataset] = await Promise.all([fs.readFile(`${cache}.wasm`), fs.readFile(`${cache}.json`, 'utf8').then(JSON.parse)]);
} catch {
  ({ wasm, dataset } = await compile());
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await Promise.all([fs.writeFile(`${cache}.wasm`, wasm), fs.writeFile(`${cache}.json`, JSON.stringify(dataset))]);
}
const doc = { body: { firstChild: { dataset, querySelector: () => null } } };
const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: root }));
instance.exports.main();
