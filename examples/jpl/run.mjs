// Run the utu JPL compiler under the current JS engine (V8 with node, JSC with bun):
// node examples/jpl/run.mjs <file.jpl> -l | -_ | -p -q | -t -q | -bench
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler, COMPILER_WASM } from '../../src/selfhost/node.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = path.join(here, 'jpl.utu');
const optimize = process.env.UTU_OPTIMIZE ?? 'speed';

async function cacheKey() {
  const hash = createHash('sha256').update(optimize).update(await fs.readFile(source));
  hash.update(await fs.readFile(COMPILER_WASM));
  const files = (await fs.readdir(path.join(root, 'src', 'selfhost'), { recursive: true })).filter(file => file.endsWith('.js')).sort();
  for (const file of files) hash.update(file).update(await fs.readFile(path.join(root, 'src', 'selfhost', file)));
  return hash.digest('hex').slice(0, 16);
}

async function build() {
  const result = await compileFile(await loadNodeCompiler(), source, { root, optimize });
  if (!result.wasm) throw new Error(result.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  return { wasm: result.wasm, spec: result.spec };
}

const cache = path.join(root, 'node_modules', '.utu', `jpl-${await cacheKey()}`);
let wasm, spec;
try {
  [wasm, spec] = await Promise.all([fs.readFile(`${cache}.wasm`), fs.readFile(`${cache}.json`, 'utf8').then(JSON.parse)]);
} catch {
  ({ wasm, spec } = await build());
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await Promise.all([fs.writeFile(`${cache}.wasm`, wasm), fs.writeFile(`${cache}.json`, JSON.stringify(spec))]);
}
const { instance } = await instantiateNode(wasm, spec, { root });
instance.exports.main();
