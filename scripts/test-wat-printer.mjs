// The browser-capable Wasm printer must read this compiler's GC/string module,
// and keep EH and SIMD when those opcodes appear in a program.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { printWat } from '../src/selfhost/wat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = await printWat(fs.readFileSync(path.join(root, 'stage0', 'utu.wasm')));
assert.match(text, /^\(module/);
assert.match(text, /\(rec\n/);
assert.match(text, /\barray\.get\b/);
assert.match(text, /\(import "wasm:js-string"/);
assert.match(text, /\(func /);

let wasmTools = false;
try { execFileSync('wasm-tools', ['--version'], { stdio: 'ignore' }); wasmTools = true; } catch {}
if (wasmTools) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-wat-printer-'));
  try {
    const source = path.join(dir, 'features.wat');
    const binary = path.join(dir, 'features.wasm');
    const roundtrip = path.join(dir, 'roundtrip.wasm');
    fs.writeFileSync(source, `(module
  (rec (type $box (struct (field (mut i32)))) (type $items (array (mut (ref null $box)))))
  (tag $problem)
  (func $test (result v128)
    (local $x (ref null $box))
    (local.set $x (struct.new $box (i32.const 3)))
    (drop (struct.get $box 0 (local.get $x)))
    (block (try_table (catch $problem 1) (nop)))
    (v128.const i32x4 1 2 3 4)))
`);
    execFileSync('wasm-tools', ['parse', source, '-o', binary]);
    const bytes = fs.readFileSync(binary);
    const printed = await printWat(bytes);
    assert.match(printed, /\(rec\n/);
    assert.match(printed, /struct\.get/);
    assert.match(printed, /try_table/);
    assert.match(printed, /v128\.const/);
    fs.writeFileSync(source, printed);
    execFileSync('wasm-tools', ['parse', source, '-o', roundtrip]);
    const file = { key: 'features.utu', offset: 0, bytes: new TextEncoder().encode('fn test() V128 { 0; }\n'), text: 'fn test() V128 { 0; }\n' };
    const annotated = await printWat(bytes, { source: true, map: { functions: [0] }, files: [file] });
    assert.match(annotated, /;; features\.utu:1 fn test/);
    fs.writeFileSync(source, annotated);
    execFileSync('wasm-tools', ['parse', source, '-o', roundtrip]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log('WAT printer: GC, string builtins, EH, SIMD and source annotations pass');
