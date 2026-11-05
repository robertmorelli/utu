// Query exports used by editor hover, inlays, and call hierarchy.
import assert from 'node:assert/strict';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';

const utu = await loadNodeCompiler();
const built = await compileFile(utu, 'examples/closures.utu', { root: process.cwd() });
assert.ok(built.wasm);
assert.equal(built.diagnostics.length, 0);

assert.ok(utu.edge_count() > 0);
let call = -1;
for (let k = 0; k < utu.edge_count(); k++) {
  if (utu.edge_site_start(k) >= 0) { call = k; break; }
}
assert.ok(call >= 0);
assert.ok(utu.edge_from_decl(call) >= 0);
assert.ok(utu.edge_to_decl(call) >= 0);
assert.ok(utu.edge_site_end(call) > utu.edge_site_start(call));

assert.ok(utu.coercion_count() > 0);
let decay = -1;
for (let k = 0; k < utu.coercion_count(); k++) {
  if (utu.coercion_kind(k) === 4) { decay = k; break; }
}
assert.ok(decay >= 0);
assert.match(utu.coercion_from_text(decay), /^fun/);
assert.match(utu.coercion_to_text(decay), /^cl/);
assert.ok(utu.coercion_node(decay) >= 0);

const kinds = new Uint8Array(utu.node_kind.buffer);
let capture = -1, field = -1, expected = -1, wasmType = -1;
for (let n = 0; n < utu.node_count(); n++) {
  const kind = utu.node_kind_name(kinds[n]);
  if (kind === 'closure_expr' && utu.closure_capture_count(n) > 0) capture = n;
  if (kind === 'field_expr' && utu.node_field_owner(n) >= 0) field = n;
  if (utu.node_expected_type(n)) expected = n;
  if (utu.node_wasm_type(n)) wasmType = n;
}
assert.ok(capture >= 0);
assert.ok(utu.closure_capture_decl(capture, 0) >= 0);
assert.ok(field >= 0);
assert.ok(utu.node_field_owner(field) >= 0);
assert.ok(utu.node_field_index(field) >= 0);
assert.ok(expected >= 0);
assert.ok(wasmType >= 0);

const traps = await compileFile(utu, 'examples/ci/codegen_traps.utu', { root: process.cwd() });
assert.ok(traps.wasm);
assert.ok(Array.from({ length: utu.decl_count() }, (_, d) => utu.decl_effects(d)).some(flags => flags & 8));
assert.equal(utu.compile_program(4), 0);
console.log('editor query exports pass');
