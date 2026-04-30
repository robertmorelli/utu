import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCompiler,
  emitBinary,
  initParser,
} from '../dist/utu.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceFile = path.join(ROOT, '.tmp', 'bundle-smoke.utu');
const source = `
  export lib {
    fn answer() i32 { 42; }
  }
`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

await fs.mkdir(path.dirname(sourceFile), { recursive: true });
await fs.writeFile(sourceFile, source);

try {
  const parser = await initParser();
  const compiler = createCompiler({
    parser,
    target: 'normal',
    readFile: (p) => fs.readFile(p, 'utf8'),
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
  });

  const doc = await compiler.compileFile(sourceFile);
  const wasm = emitBinary(doc);
  assert(wasm instanceof Uint8Array, 'expected wasm bytes');
  assert(wasm.length > 8, 'expected non-empty wasm output');
  assert(wasm[0] === 0x00 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d, 'expected wasm magic header');
  await WebAssembly.compile(wasm);
  console.log('bundle smoke test passed');
} finally {
  await fs.unlink(sourceFile).catch(() => {});
}
