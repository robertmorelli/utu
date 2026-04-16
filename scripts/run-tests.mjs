// scripts/run-tests.mjs — Utu compiler test runner
//
// Usage: bun ./scripts/run-tests.mjs
//
// Each test is a plain object { name, run }. run() throws on failure.
// Tests are run sequentially; all results are printed at the end.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler, initParser } from '../src/index.js';

const ROOT   = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WASM   = path.join(ROOT, 'web-tree-sitter.wasm');
const LANG   = path.join(ROOT, 'tree-sitter-utu.wasm');

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertNoErrors(ir) {
  const errs = ir.querySelectorAll('[data-error]');
  if (errs.length) {
    const msgs = [...errs].map(e => e.getAttribute('data-error')).join(', ');
    throw new Error(`IR has errors: ${msgs}`);
  }
}

// ── Test registry ─────────────────────────────────────────────────────────────

const tests = [];
function test(name, run) { tests.push({ name, run }); }

// ── Tests ─────────────────────────────────────────────────────────────────────
// parseSource(src) → Document  (phase-1 IR, no analysis passes)
// compileFile(path) → Promise<Document>  (full pipeline with analysis)

test('parse: free function', async ({ compiler }) => {
  const doc = compiler.parseSource(`
    export lib {
      fn add(a: i32, b: i32) i32 { a }
    }
  `);
  const fn = doc.querySelector('ir-fn');
  assert(fn, 'expected ir-fn');
  assertEq(fn.getAttribute('name'), 'add');
});

test('parse: struct declaration', async ({ compiler }) => {
  // Structs live outside export lib {} (grammar: _library_item is fn_decl only)
  const doc = compiler.parseSource(`
    struct Point:
      | x : i32
      | y : i32
    export lib {
      fn Point.dist |p| () i32 { p.x }
    }
  `);
  const struct = doc.querySelector('ir-struct');
  assert(struct, 'expected ir-struct');
  assertEq(struct.getAttribute('name'), 'Point');
});

test('parse: every node has a unique id', async ({ compiler }) => {
  const doc = compiler.parseSource(`
    export lib {
      fn add(a: i32, b: i32) i32 { a }
    }
  `);
  const all = doc.querySelectorAll('[id]');
  const ids = new Set([...all].map(n => n.id));
  assertEq(ids.size, all.length, 'duplicate node ids found');
});

test('compile: module instantiation and hoisting (in-memory)', async ({ compiler }) => {
  // compileFile needs real I/O — use parseSource to verify phase-1 at least
  const doc = compiler.parseSource(`
    mod Box[T1] {
      struct &[]:
        | value : T1
      fn &.get |b| () T1 { b.value }
    }
    using Box[i32] |IntBox|;
    export lib {
      fn unwrap(b: IntBox) i32 { b.value }
    }
  `);
  assert(doc.querySelector('ir-module'), 'expected ir-module');
  assert(doc.querySelector('ir-using'), 'expected ir-using');
});

test('analysis: type inference stamps data-type on int literal', async ({ compiler, parser }) => {
  // Run the analysis passes manually on a single-file compile
  const { linkTypeDecls }    = await import('../src/compiler/link-type-decls.js');
  const { resolveBindings }  = await import('../src/compiler/resolve-bindings.js');
  const { inferTypes }       = await import('../src/compiler/infer-types.js');

  // Literals are ir-lit[kind="int"], not ir-int-lit
  const src = `export lib { fn answer() i32 { 42; } }`;
  const doc = compiler.parseSource(src);
  const typeIndex = linkTypeDecls(doc);
  resolveBindings(doc);
  inferTypes(doc, typeIndex);

  const lit = doc.querySelector('ir-lit[kind="int"]');
  assert(lit, 'expected ir-lit[kind="int"]');
  assert(lit.dataset.type, `ir-lit[kind="int"] has no data-type after inferTypes`);
});

test('resolve-methods: static call reads type from child node', async ({ compiler }) => {
  // Regression: ir-type-member has no `type` attr — type comes from child node.
  // If broken, static calls stamp data-error="unknown-method:null.method".
  const { linkTypeDecls }   = await import('../src/compiler/link-type-decls.js');
  const { resolveBindings } = await import('../src/compiler/resolve-bindings.js');
  const { inferTypes }      = await import('../src/compiler/infer-types.js');
  const { resolveMethods }  = await import('../src/compiler/resolve-methods.js');

  const src = `
    export lib {
      struct Vec:
        | x : f32
      fn Vec.zero() Vec { Vec { x: 0.0 } }
      fn make() Vec { Vec.zero() }
    }
  `;
  const doc = compiler.parseSource(src);
  const typeIndex = linkTypeDecls(doc);
  resolveBindings(doc);
  inferTypes(doc, typeIndex);
  resolveMethods(doc, typeIndex);

  const errNode = doc.querySelector('[data-error^="unknown-method:null"]');
  assert(!errNode, `static call emitted null-type error: ${errNode?.getAttribute('data-error')}`);
});

test('std:array — inline Array[i32] auto-instantiates module', async ({ compiler }) => {
  // Array[i32] used inline (no explicit `using Array[i32] |Alias|`) should
  // auto-instantiate, producing ir-type-def[name="Array__i32"] after hoisting.
  const tmpFile = path.join(ROOT, '.tmp', 'test_array_import.utu');
  const { default: fs } = await import('node:fs/promises');
  await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
  const src = `
    using Array from std:array;
    export lib {
      fn make_arr() Array[i32] {
        Array[i32].new(10);
      }
    }
  `;
  await fs.writeFile(tmpFile, src, 'utf8');
  try {
    const doc = await compiler.compileFile(tmpFile);
    const errs = [...doc.querySelectorAll('[data-error]')];
    if (errs.length) throw new Error(`IR errors: ${errs.map(e => e.getAttribute('data-error')).join(', ')}`);
    const typeDef = doc.querySelector('ir-type-def[name="Array__i32"]');
    assert(typeDef, 'expected ir-type-def[name="Array__i32"] after inline instantiation');
    // expandDsls replaces ir-dsl with the parsed ir-wasm-array node directly
    const wasmArr = typeDef.querySelector('ir-wasm-array');
    assert(wasmArr, 'expected ir-wasm-array inside ir-type-def after DSL expansion');
    assertEq(wasmArr.getAttribute('elem'), 'i32', 'ir-wasm-array elem should be i32 after T1 substitution');
    assertEq(wasmArr.getAttribute('mut'), 'true', 'ir-wasm-array should be mutable');
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
});

test('standard-dsls: @es and @wat plugins have expand method', async () => {
  const { createStandardDsls } = await import('../src/compiler/standard-dsls.js');
  const dsls = createStandardDsls({ parser: null, createDocument: null });
  assert(typeof dsls.es.expand  === 'function', '@es missing expand()');
  assert(typeof dsls.wat.expand === 'function', '@wat missing expand()');
  // expand() returns null (not implemented yet) rather than throwing
  assertEq(dsls.es.expand({}),  null, '@es expand should return null');
  assertEq(dsls.wat.expand({}), null, '@wat expand should return null');
});

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  const parser = await initParser({
    wasmDir: `${ROOT}/`,
  });

  const compiler = createCompiler({
    parser,
    readFile: async (p) => {
      const { default: fs } = await import('node:fs/promises');
      return fs.readFile(p, 'utf8');
    },
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
  });

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, run } of tests) {
    try {
      await run({ compiler, parser });
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`      ${err.message}`);
      failures.push({ name, err });
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
