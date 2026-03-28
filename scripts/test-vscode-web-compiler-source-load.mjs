import { readFile } from 'node:fs/promises';
import { loadModuleFromSource } from '../packages/runtime/browser.js';

const source = await readFile(new URL('../dist/compiler.web.mjs', import.meta.url), 'utf8');
const compiler = await loadModuleFromSource(source, { identifier: 'compiler.web-test' });

const metadata = await compiler.get_metadata('export fun main() i32 { 0; }');
if (!metadata.hasMain) {
  throw new Error(`Expected compiler loaded from source text to report a runnable main, received ${JSON.stringify(metadata)}`);
}

const artifact = await compiler.compile('export fun main() i32 { 0; }', { mode: 'program' });
if (typeof artifact?.shim !== 'string' || !(artifact.wasm instanceof Uint8Array) || artifact.wasm.length === 0) {
  throw new Error('Expected compiler loaded from source text to produce a non-empty artifact.');
}

console.log('PASS vscode web compiler source load');
