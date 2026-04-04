import { readFile } from 'node:fs/promises';
import { loadModuleFromSource } from '../packages/runtime/index.js';
import { assertManagedTestModule } from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const sourceUrl = new URL('../dist/compiler.web.mjs', import.meta.url);
const binaryenUrl = new URL('../dist/binaryen.mjs', import.meta.url);
const runtimeGlobals = Function('return this')();
const previousBinaryenLoader = runtimeGlobals.__utuBinaryenLoader;
let binaryenModulePromise = null;
runtimeGlobals.__utuBinaryenLoader = async () => {
  binaryenModulePromise ??= (async () => {
    const source = await readFile(binaryenUrl, 'utf8');
    return loadModuleFromSource(source, {
      assetBaseUrl: binaryenUrl.href,
      identifier: 'binaryen.web-test',
    });
  })();
  return await binaryenModulePromise;
};
const source = await readFile(sourceUrl, 'utf8');
const compiler = await loadModuleFromSource(source, {
  assetBaseUrl: sourceUrl.href,
  assetFiles: [
    new URL('../dist/binaryen.mjs', import.meta.url),
    new URL('../tree-sitter-utu.wasm', import.meta.url),
    new URL('../web-tree-sitter.wasm', import.meta.url),
  ],
  identifier: 'compiler.web-test',
});
const compilerAssets = {
  runtimeWasmUrl: new URL('../web-tree-sitter.wasm', import.meta.url),
  wasmUrl: new URL('../tree-sitter-utu.wasm', import.meta.url),
};

const metadata = await compiler.get_metadata('fun main() i32 { 0; }', compilerAssets);
if (!metadata.hasMain) {
  throw new Error(`Expected compiler loaded from source text to report a runnable main, received ${JSON.stringify(metadata)}`);
}

const artifact = await compiler.compile('fun main() i32 { 0; }', {
  ...compilerAssets,
  mode: 'program',
});
if (typeof artifact?.shim !== 'string' || !(artifact.wasm instanceof Uint8Array) || artifact.wasm.length === 0) {
  throw new Error('Expected compiler loaded from source text to produce a non-empty artifact.');
}

runtimeGlobals.__utuBinaryenLoader = previousBinaryenLoader;

console.log('PASS vscode web compiler source load');
