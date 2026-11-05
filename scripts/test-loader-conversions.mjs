import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loaderSource } from '../src/selfhost/loader.js';
import { convertExports } from '../src/runtime/host-imports.js';

const dir = await fs.mkdtemp('/tmp/utu-loader-conversions-');
await fs.writeFile(`${dir}/module.utu`, 'export lib { fn bench(n: I32) I32 { n; } }');
const built = spawnSync(process.execPath, [new URL('../cli/utu.mjs', import.meta.url).pathname, 'build', `${dir}/module.utu`, '-O', 'small', '-o', dir], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const wasm = await fs.readFile(`${dir}/module.wasm`);
const instance = (await WebAssembly.instantiate(wasm, {}, { builtins: ['js-string'], importedStringConstants: "'" })).instance;
const values = [undefined, null, 0, 1, -1, 1.5, 'hi', 1n, true, () => 1, [], {}];
const kinds = ['Bool', 'int', 'big', 'num', 'Str', '?Str', 'ref', 'cl', '?', 'unknown'];
const results = ['', 'Bool', 'U32', 'U64', 'I64', ['Bool', 'U32', 'U64', '']];
let cases = 0;
for (const kind of kinds) for (const result of results) {
  const spec = { exports: { bench: { p: [kind], r: result } } };
  const source = loaderSource(spec, wasm, { runtime: new URL('../src/runtime/host-imports.js', import.meta.url).href, wasm: 'await(await import("node:fs/promises")).readFile(new URL("./module.wasm",import.meta.url))' });
  const file = `${dir}/case-${cases++}.mjs`;
  await fs.writeFile(file, source);
  const actual = (await import(pathToFileURL(file).href)).exports;
  const expected = convertExports(instance.exports, spec.exports);
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  assert.equal(actual.bench.length, expected.bench.length);
  for (const value of values) {
    const run = f => { try { return { value: f(value) }; } catch (e) { return { name: e.constructor.name, message: e.message }; } };
    assert.deepEqual(run(actual.bench), run(expected.bench), `${kind} ${JSON.stringify(result)} ${String(value)}`);
  }
}
console.log(`loader conversion comparison passed: ${cases} specs`);
