import { readFile } from 'node:fs/promises';
import { loadModuleFromSource } from '../packages/runtime/index.js';
import { assertManagedTestModule } from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const sourceUrl = new URL('../dist/compiler.web.mjs', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiler = await loadModuleFromSource(source, {
  assetBaseUrl: sourceUrl.href,
  assetFiles: [
    new URL('../tree-sitter-utu.wasm', import.meta.url),
    new URL('../web-tree-sitter.wasm', import.meta.url),
  ],
  identifier: 'compiler.web-test',
});
const compilerAssets = {
  runtimeWasmUrl: new URL('../web-tree-sitter.wasm', import.meta.url),
  wasmUrl: new URL('../tree-sitter-utu.wasm', import.meta.url),
};

const metadata = await compiler.get_metadata('export fun main() i32 { 0; }', compilerAssets);
if (!metadata.hasMain) {
  throw new Error(`Expected compiler loaded from source text to report a runnable main, received ${JSON.stringify(metadata)}`);
}

const artifact = await compiler.compile('export fun main() i32 { 0; }', {
  ...compilerAssets,
  mode: 'program',
});
if (typeof artifact?.shim !== 'string' || !(artifact.wasm instanceof Uint8Array) || artifact.wasm.length === 0) {
  throw new Error('Expected compiler loaded from source text to produce a non-empty artifact.');
}

console.log('PASS vscode web compiler source load');
