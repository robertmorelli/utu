import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build } from 'esbuild';
import { generateBindings } from '../tools/dts/generate.mjs';
import { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject } from '../src/index.js';
import { PLATFORM_SOURCES } from '../src/compiler/platform-sources.generated.js';
import { glueModuleSource, liveGlueFields } from '../src/runtime/host-imports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parser = await initParser({ wasmDir: `${ROOT}/` });
await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
const results = [];
async function test(name, run) {
  await run();
  results.push(name);
  console.log(`✓ ${name}`);
}
function generated(file, prefix, moduleSpecifier) {
  return generateBindings({ files: [path.join(ROOT, file)], prefix, moduleSpecifier });
}
async function compile(sources, source) {
  const stdlib = new Map([...PLATFORM_SOURCES, ...[...sources].map(([name, text]) => [`std:${name}`, text])]);
  const compiler = createCompiler({ parser, target: 'normal', stdlib, debugAssertions: true,
    readFile: async () => source, resolvePath: (_, relative) => relative });
  const doc = await compiler.compileFile('/dts-test.utu');
  const errors = [...doc.querySelectorAll('[data-error]')];
  assert.equal(errors.length, 0, errors.slice(0, 6).map(n => n.dataset.errorMessage ?? n.dataset.error).join('\n'));
  const wasm = emitBinary(doc);
  const imports = await buildImportObject(doc, { wasm, projectRoot: ROOT });
  const { instance } = await instantiateLowered(wasm, imports);
  return { doc, wasm, instance };
}
try {
  await test('binding linker accepts an in-memory TypeScript host with no filesystem', async () => {
    const { generateBindingsFromProgram } = await import('../src/bindings/generate.js');
    const source = 'export declare function twice(n: number): number;';
    const file = '/virtual.d.ts';
    const host = {
      getSourceFile: name => name === file ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true) : undefined,
      getDefaultLibFileName: () => '', writeFile() { throw new Error('unexpected write'); },
      getCurrentDirectory: () => '/', getDirectories: () => [], fileExists: name => name === file,
      readFile: name => name === file ? source : undefined, getCanonicalFileName: name => name,
      useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    };
    const program = ts.createProgram([file], { noLib: true }, host);
    const output = generateBindingsFromProgram(ts, program, { files: [file], prefix: 'Virtual', moduleSpecifier: 'virtual-api' });
    assert(output.sources.get('Virtual').includes('fun(F64) F64'));
    assert(output.sources.get('Virtual').includes('import { twice as __dts_twice }'));
  });
  const fixture = generated('scripts/fixtures/dts/targets.d.ts', 'Fixture', path.join(ROOT, 'scripts/fixtures/dts/targets.mjs'));
  await test('all generated fixture modules parse; readonly accessors have no setter', () => {
    const c = createCompiler({ parser, readFile: async () => '', resolvePath: (_, r) => r });
    for (const [name, source] of fixture.sources) assert(!c.parseSource(source).querySelector('[data-error]'), name);
    assert(!fixture.sources.get('FixtureCounter').includes('set_doubled'));
    const filenames = [...fixture.sources.keys()].map(n => n.toLowerCase());
    assert.equal(new Set(filenames).size, filenames.length, 'generated files must survive case-insensitive filesystems');
    assert(fixture.sources.get('FixtureSymbolic').includes('call_symbol_iterator'));
  });
  await test('overloads, optional arities, rest arrays, unions, generics, bools, callbacks, exceptions and promises execute', async () => {
    const { instance } = await compile(fixture.sources, `
      using Fixture from std:Fixture;
      using JS from std:JS;
      export lib {
        fn optional() F64 { Fixture.call_optional(3.0); }
        fn optional_full() F64 { Fixture.call_optional_arity2(3.0, 4.0); }
        fn text() Str { Fixture.call_overloaded("hello"); }
        fn number() F64 { Fixture.call_overloaded_overload2(41.0); }
        fn boolean() Bool { Fixture.call_flip(false); }
        fn callback() F64 { Fixture.call_apply(7.0, cl(n) { n * 3.0; }); }
        fn generic() Str { JS.as_string(Fixture.call_echo(JS.string("same"))); }
        fn union() F64 { JS.as_number(Fixture.call_union(JS.number(42.0))); }
        fn rest() F64 {
          let args: Externref = JS.array();
          JS.push(args, JS.number(10.0)); JS.push(args, JS.number(20.0)); JS.push(args, JS.number(12.0));
          Fixture.call_sum_arity1(args);
        }
        fn greeting() Str { Fixture.call_default("UTU"); }
        fn promise() Externref { Fixture.call_later("resolved"); }
        fn failure() Externref { Fixture.call_fail(); }
      }
    `);
    const e = instance.exports;
    assert.equal(e.optional(), 6); assert.equal(e.optional_full(), 12);
    assert.equal(e.text(), 'HELLO'); assert.equal(e.number(), 42); assert.equal(e.boolean(), 1);
    assert.equal(e.callback(), 21); assert.equal(e.generic(), 'same'); assert.equal(e.union(), 42);
    assert.equal(e.rest(), 42); assert.equal(e.greeting(), 'Hello UTU');
    assert.equal(await e.promise(), 'resolved'); assert.throws(() => e.failure(), /fixture failure/);
  });
  await test('class construction, properties, merging, object options and namespace members execute', async () => {
    const { instance } = await compile(fixture.sources, `
      using Fixture from std:Fixture;
      using FixtureCounter from std:FixtureCounter;
      using FixtureOptions from std:FixtureOptions;
      using FixtureGlobal_constants from std:FixtureGlobal_constants;
      using FixtureGlobal_dictionary from std:FixtureGlobal_dictionary;
      using JS from std:JS;
      export lib {
        fn counter() F64 {
          let c: Externref = FixtureCounter.new_instance_arity1(20.0);
          FixtureCounter.set_label(c, "updated");
          FixtureCounter.call_increment(c, 1.0);
          FixtureCounter.get_doubled(c);
        }
        fn options() Str {
          let o: Externref = JS.object();
          FixtureOptions.set_label(o, "options work");
          FixtureOptions.set_count(o, 4.0);
          FixtureOptions.get_label(Fixture.call_make(o));
        }
        fn nested() F64 { JS.as_number(JS.get(FixtureGlobal_constants.get_nested(), "answer")); }
        fn namespace() F64 { FixtureGlobal_constants.call_times(14.0); }
        fn index() F64 { FixtureGlobal_dictionary.set_index("answer", 42.0); FixtureGlobal_dictionary.get_index("answer"); }
      }
    `);
    assert.equal(instance.exports.counter(), 42); assert.equal(instance.exports.options(), 'options work');
    assert.equal(instance.exports.nested(), 42); assert.equal(instance.exports.namespace(), 42); assert.equal(instance.exports.index(), 42);
  });
  await test('well-known and exported unique symbols remain usable through JS values', async () => {
    const { instance } = await compile(fixture.sources, `using Fixture from std:Fixture; using JS from std:JS;
      export lib { fn run() Str {
        let value: Externref = Fixture.call_symbolic();
        let method: Externref = JS.get_key(value, Fixture.get_token());
        JS.as_string(JS.call(method, value, JS.array()));
      } }
    `);
    assert.equal(instance.exports.run(), 'symbol works');
  });
  await test('universal callbacks preserve this, variadic arguments, boolean results and identity', async () => {
    const { instance } = await compile(fixture.sources, `using Fixture from std:Fixture; using JS from std:JS;
      export lib {
        fn receiver() Str {
          let callback: Externref = JS.function_value(cl(receiver, args) {
            JS.get(receiver, "label");
          });
          JS.as_string(Fixture.call_arbitrary(callback));
        }
        fn boolean_result() Bool {
          let callback: Externref = JS.function_value(cl(receiver, args) {
            JS.boolean(not JS.as_boolean(JS.at(args, 0.0)));
          });
          Fixture.call_booleanCallback(callback);
        }
        fn exact_values() Bool {
          let big: Externref = JS.bigint("99999999999999999999999999999999999999");
          let symbol: Externref = JS.symbol("unique");
          JS.same(big, Fixture.call_identity(big)) and JS.same(symbol, Fixture.call_identity(symbol))
            and JS.is_undefined(Fixture.call_identity(JS.undefined_value()));
        }
      }
    `);
    assert.equal(instance.exports.receiver(), 'receiver');
    assert.equal(instance.exports.boolean_result(), 1);
    assert.equal(instance.exports.exact_values(), 1);
  });
  await test('closures capture host strings without unlowered public GC types', async () => {
    const previousClosedWorld = (await import('binaryen')).default.getClosedWorld();
    const { instance } = await compile(new Map(), `
      struct Box: | text: Str
      export lib {
        fn capture(text: Str) cl() Str { cl() { text; }; }
        fn boxed(text: Str) cl() Str { let box: Box = Box { text: text }; cl() { box.text; }; }
      }
    `);
    const text = 'captured 🌱\u0000\ud800';
    assert.equal(instance.exports.capture(text)(), text);
    assert.equal(instance.exports.boxed(text)(), text);
    assert.equal((await import('binaryen')).default.getClosedWorld(), previousClosedWorld);
  });
  await test('const enums require no fictional runtime export and nested namespaces stay accessible', async () => {
    const { instance } = await compile(fixture.sources, `using Fixture from std:Fixture;
      using FixtureConstMode from std:FixtureConstMode; using FixtureGlobal_Util from std:FixtureGlobal_Util; using JS from std:JS;
      export lib {
        fn constant() F64 { FixtureConstMode.get_First() + FixtureConstMode.get_Second(); }
        fn namespace() F64 { FixtureGlobal_Util.call_scale(21.0); }
        fn nested() F64 { JS.as_number(JS.get(FixtureGlobal_Util.get_Nested(), "answer")); }
        fn function_value() F64 {
          let args: Externref = JS.array(); JS.push(args, JS.number(20.0));
          JS.as_number(JS.call(Fixture.get_optional(), JS.undefined_value(), args));
        }
      }
    `);
    assert.equal(instance.exports.constant(), 42); assert.equal(instance.exports.namespace(), 42);
    assert.equal(instance.exports.nested(), 42); assert.equal(instance.exports.function_value(), 40);
  });
  await test('nanoid: real ESM named exports and optional numeric argument', async () => {
    const binding = generated('node_modules/nanoid/index.d.ts', 'Nano', 'nanoid');
    const { instance } = await compile(binding.sources, `using Nano from std:Nano;
      export lib { fn run() Str { Nano.call_nanoid_arity1(12.0); } }`);
    assert.equal(instance.exports.run().length, 12);
  });
  await test('mitt: generic default export and identity-preserving event callbacks', async () => {
    const binding = generated('node_modules/mitt/index.d.ts', 'Mitt', 'mitt');
    const { instance } = await compile(binding.sources, `using Mitt from std:Mitt; using MittEmitter from std:MittEmitter; using JS from std:JS;
      struct Cell: | value: I32
      export lib { fn run() I32 {
        let e: Externref = Mitt.call_default();
        let cell: Cell = Cell { value: 0 };
        let callback: cl(Externref) void = cl(value) { cell.value = cell.value + 1; };
        let listener: Externref = JS.event_listener(callback);
        let on_args: Externref = JS.array();
        JS.push(on_args, JS.string("ping")); JS.push(on_args, listener);
        MittEmitter.call_on_js(e, on_args);
        let emit_args: Externref = JS.array(); JS.push(emit_args, JS.string("ping")); JS.push(emit_args, JS.number(7.0));
        MittEmitter.call_emit_js(e, emit_args);
        MittEmitter.call_off_js(e, on_args);
        MittEmitter.call_emit_js(e, emit_args);
        cell.value;
      } }`);
    assert.equal(instance.exports.run(), 1);
  });
  await test('node:path: ambient export-equals declarations and host arrays for variadics', async () => {
    const binding = generated('node_modules/@types/node/path.d.ts', 'NodePath', 'node:path');
    const { instance } = await compile(binding.sources, `using NodePathGlobal_default from std:NodePathGlobal_default; using JS from std:JS;
      export lib { fn run() Str { let paths: Externref = JS.array(); JS.push(paths, JS.string("a")); JS.push(paths, JS.string("b")); NodePathGlobal_default.call_join_arity1(paths); } }`);
    assert.equal(instance.exports.run(), path.join('a', 'b'));
  });
  await test('Floating UI: reexports, complex generic types and middleware factory', async () => {
    const binding = generated('node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts', 'Floating', '@floating-ui/dom');
    const { instance, doc, wasm } = await compile(binding.sources, `using Floating from std:Floating; using JS from std:JS;
      export lib { fn run() Str { let middleware: Externref = Floating.call_offset_arity1(JS.number(12.0)); JS.as_string(JS.get(middleware, "name")); } }`);
    assert.equal(instance.exports.run(), 'offset');
    const spec = JSON.parse(doc.body.firstChild.dataset.dslImportsJs);
    const source = glueModuleSource(spec, await liveGlueFields(wasm));
    assert(source.includes('import { offset as'));
    assert(!source.includes('computePosition'));
    const bundle = await build({ stdin: { contents: source, resolveDir: ROOT, loader: 'js' }, bundle: true, write: false, minify: true, format: 'esm', platform: 'browser' });
    assert(bundle.outputFiles[0].contents.length < 8000, 'one middleware should not pull in the whole library');
  });
  await test('portable Wasm import scanning matches host reflection and rejects truncation', async () => {
    const { wasmImports } = await import('../src/runtime/wasm-imports.js');
    const { wasm } = await compile(fixture.sources, `using Fixture from std:Fixture; export lib { fn run() Bool { Fixture.call_flip(false); } }`);
    const expected = WebAssembly.Module.imports(await WebAssembly.compile(wasm)).map(({module,name})=>({module,name}));
    assert.deepEqual(wasmImports(wasm).map(({module,name})=>({module,name})), expected);
    const padded = new Uint8Array(wasm.length + 10); padded.set(wasm, 5);
    assert.deepEqual(wasmImports(padded.subarray(5, 5 + wasm.length)), wasmImports(wasm));
    assert.deepEqual([...await liveGlueFields(wasm)].sort(), expected.filter(i => i.module !== "'" && i.module !== 'wasm:js-string').map(i => i.name).sort());
    assert.throws(() => wasmImports(wasm.subarray(0, 7)), /malformed/);
    assert.throws(() => wasmImports(new Uint8Array([0,97,115,109,1,0,0,0,2,127])), /malformed/);
  });
  await test('CommonJS callable export-equals retains attached namespace properties', async () => {
    const binding = generated('scripts/fixtures/dts/export-equals.d.cts', 'Common', path.join(ROOT, 'scripts/fixtures/dts/export-equals.cjs'));
    const { instance } = await compile(binding.sources, `using Common from std:Common; using CommonGlobal_default from std:CommonGlobal_default;
      export lib { fn run() F64 { Common.call_default(21.0); } fn label() Str { CommonGlobal_default.get_label(); } }`);
    assert.equal(instance.exports.run(), 42); assert.equal(instance.exports.label(), 'callable namespace');
  });
  await test('wildcard ambient asset declarations select the runtime module', async () => {
    const binding = generated('scripts/fixtures/dts/assets.d.ts', 'Asset', path.join(ROOT, 'scripts/fixtures/dts/theme.mjs'));
    const { instance } = await compile(binding.sources, `using AssetGlobal_default from std:AssetGlobal_default;
      export lib { fn run() Str { AssetGlobal_default.get_color(); } }`);
    assert.equal(instance.exports.run(), 'green');
    assert.throws(() => generated('scripts/fixtures/dts/assets.d.ts', 'Missing'), /matching/);
  });
  await test('1,000 unused declarations add zero emitted Wasm or live-glue bytes', async () => {
    const file = path.join(ROOT, '.tmp/dts-size.d.ts');
    async function variant(extra) {
      await fs.writeFile(file, 'export declare function optional(value: number): number;\n' + extra);
      const binding = generateBindings({ files: [file], prefix: 'Size', moduleSpecifier: path.join(ROOT, 'scripts/fixtures/dts/targets.mjs') });
      const result = await compile(binding.sources, 'using Size from std:Size; export lib { fn run() F64 { Size.call_optional(21.0); } }');
      assert.equal(result.instance.exports.run(), 42);
      return { wasm: result.wasm, glue: glueModuleSource(JSON.parse(result.doc.body.firstChild.dataset.dslImportsJs), await liveGlueFields(result.wasm)) };
    }
    try {
      const lean = await variant('');
      const heavy = await variant(Array.from({length:1000},(_,i)=>`export declare function unused${i}(x: number): number;`).join('\n'));
      assert.deepEqual(heavy.wasm, lean.wasm);
      assert.equal(heavy.glue, lean.glue);
    } finally { await fs.unlink(file); }
  });
  await test('all-dead @es imports never execute via fallback', async () => {
    const c = createCompiler({ parser, target: 'normal', readFile: async () => `let poison: fun() I32 = @es/\\ (()=>{throw Error("dead glue executed")})() \\/; export lib { fn run() I32 {42;} }`, resolvePath: (_,r)=>r });
    const doc = await c.compileFile('/dead.utu');
    const wasm = emitBinary(doc);
    const imports = await buildImportObject(doc, { wasm, projectRoot: ROOT });
    assert.equal((await instantiateLowered(wasm, imports)).instance.exports.run(), 42);
  });
  await test('syntax errors in declarations fail rather than silently erase everything', () => {
    const file = path.join(ROOT, 'scripts/fixtures/dts/invalid.d.ts');
    assert.throws(() => generateBindings({ files: [file], prefix: 'Bad' }), /expected|Declaration|TS\d+/);
  });
  await test('external declarations require a runtime module instead of guessing globals', () => {
    assert.throws(() => generated('scripts/fixtures/dts/targets.d.ts', 'Missing'), /moduleSpecifier/);
  });
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'std/browser/manifest.json'), 'utf8'));
  await test('entire generated browser corpus parses and manifest matches module names', async () => {
    const c = createCompiler({ parser, readFile: async () => '', resolvePath: (_,r)=>r });
    for (const file of manifest.files) {
      const source = await fs.readFile(path.join(ROOT, 'std/browser', file), 'utf8');
      const doc = c.parseSource(source);
      assert(!doc.querySelector('[data-error]'), file);
      assert.equal(doc.querySelector('ir-module').getAttribute('name'), path.basename(file, '.utu'));
    }
  });
  console.log(`${results.length} ABI tests passed; ${manifest.modules} browser modules parsed`);
} finally { parser.delete(); }
