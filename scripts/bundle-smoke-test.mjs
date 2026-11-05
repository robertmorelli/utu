import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, instantiate, loadCompiler, PLATFORM_SOURCES } from '../dist/selfhost/utu.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceFile = path.join(ROOT, '.tmp', 'bundle-smoke.utu');
const source = 'export lib { fn answer() I32 { 42; } }\n';
const compilerWasm = await fs.readFile(path.join(ROOT, 'dist', 'utu.wasm'));
const compilerSpec = JSON.parse(await fs.readFile(path.join(ROOT, 'dist', 'utu.host.json'), 'utf8'));

await fs.mkdir(path.dirname(sourceFile), { recursive: true });
await fs.writeFile(sourceFile, source);
try {
  const compiler = await loadCompiler(compilerWasm, compilerSpec);
  const result = await compile(compiler, sourceFile, {
    stdlib: PLATFORM_SOURCES,
    readFile: file => fs.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  if (!result.wasm) throw new Error(result.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
  if (result.wasm.length <= 8 || result.wasm[0] !== 0 || result.wasm[1] !== 0x61) throw new Error('invalid Wasm output');
  const module = await instantiate(result.wasm, result.spec);
  if (module.exports.answer() !== 42) throw new Error('bundled compiler built the wrong program');
  console.log('bundle smoke test passed');
} finally {
  await fs.unlink(sourceFile).catch(() => {});
}
