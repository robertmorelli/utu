// std:Bytes (examples/bytes.utu): a Uint8Array from std:JS, std:Browser, a
// subarray, a fetch, and Node's Buffer copied to an Array[I32] and back, at
// every optimization level; and a program that imports it without using it
// builds the same bytes as one that does not import it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utu = await loadNodeCompiler();

for (const optimize of ['none', 'size', 'speed']) {
  const built = await compileFile(utu, path.join(ROOT, 'examples', 'bytes.utu'), { optimize });
  assert.ok(built.wasm, built.diagnostics.map(d => d.message).join('\n'));
  const x = (await instantiateNode(built.wasm, built.spec)).exports;
  assert.equal(x.lengths(), 45, `${optimize}: round trip at every length`);
  assert.equal(x.wrapped(), '0,255,65,44,128,128', `${optimize}: low eight bits`);
  assert.equal(x.from_literal(), 402, `${optimize}: std:JS`);
  assert.equal(x.from_browser(), 54, `${optimize}: std:Browser`);
  assert.equal(x.from_subarray(), 250, `${optimize}: a subarray`);
  assert.equal(await x.fetched(), 270, `${optimize}: a fetched ArrayBuffer`);
  const buffer = Buffer.from([1, 2, 3, 4, 5, 250]);
  const out = x.reversed(buffer);
  assert.ok(out instanceof Uint8Array, `${optimize}: to_js gives a Uint8Array`);
  assert.deepEqual([...out], [250, 5, 4, 3, 2, 1], `${optimize}: a Buffer`);
  assert.deepEqual([...buffer], [1, 2, 3, 4, 5, 250], `${optimize}: the input is not changed`);
  const big = new Uint8Array(100003).map((_, i) => (i * 31) & 255);
  assert.deepEqual(x.reversed(big), big.slice().reverse(), `${optimize}: 100003 bytes`);
  assert.equal(x.reversed(new Uint8Array(0)).length, 0, `${optimize}: no bytes`);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-bytes-'));
try {
  const body = 'using console from std:console\nmain { console.log(1) }\n';
  const wasm = async (name, source) => {
    const file = path.join(dir, name);
    await fs.writeFile(file, source);
    const built = await compileFile(utu, file, { optimize: 'size' });
    assert.ok(built.wasm, built.diagnostics.map(d => d.message).join('\n'));
    return Buffer.from(built.wasm);
  };
  assert.deepEqual(await wasm('unused.utu', `using Bytes from std:Bytes\n${body}`), await wasm('plain.utu', body), 'unused, std:Bytes ships nothing');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
console.log('bytes: Uint8Array, Browser.Uint8Array, a subarray, a fetch, and a Buffer to Array[I32] and back at every level; nothing when unused');
