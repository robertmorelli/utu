import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../dist/compiler.web.mjs', import.meta.url), 'utf8');
const compiler = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);

const metadata = await compiler.get_metadata('export fun main() i32 { 0; }');
if (!metadata.hasMain) {
  throw new Error(`Expected compiler loaded from source text to report a runnable main, received ${JSON.stringify(metadata)}`);
}

const artifact = await compiler.compile('export fun main() i32 { 0; }', { mode: 'program' });
if (typeof artifact?.shim !== 'string' || !(artifact.wasm instanceof Uint8Array) || artifact.wasm.length === 0) {
  throw new Error('Expected compiler loaded from source text to produce a non-empty artifact.');
}

console.log('PASS vscode web compiler source load');
