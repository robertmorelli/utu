import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';
import { lowerClosures } from '../src/compiler/lower-closures.js';
import { emitBinary, emitText, buildModule, JS_STRING_BUILTINS_COMPILE_OPTIONS } from '../src/compiler/codegen/index.js';
import { binaryen } from '../src/compiler/codegen/types.js';

export function registerCompilerQualityTests({ test, assert, assertEq, assertThrows, makeCompiler, assertNoErrors }) {
  const compile = (ROOT, source, name) => compileAndInstantiate({
    ROOT, source, name, makeCompiler, assertNoErrors,
  });

  for (const [name, source, expected] of [
    ['parameter', `let n: I32 = 5; let f: cl(I32) I32 = cl(__env) { n + __env; }; f(7);`, 12],
    ['local', `let n: I32 = 5; let f: cl() I32 = cl() { let __env: I32 = 7; n + __env; }; f();`, 12],
    ['capture', `let __env: I32 = 5; let f: cl() I32 = cl() { __env; }; f();`, 5],
    ['shadow', `let n: I32 = 5; let f: cl(I32) I32 = cl(n) { n + 1; }; f(7);`, 8],
    ['nested', `let n: I32 = 5; let f: cl(I32) I32 = cl(__env) {
      let g: cl(I32) I32 = cl(__env0) { n + __env + __env0; }; g(3);
    }; f(7);`, 15],
  ]) {
    test(`compiler: closure environment does not shadow user ${name}`, async ({ ROOT }) => {
      const { instance } = await compile(ROOT, `export lib { fn run() I32 { ${source} } }`, `quality-${name}.utu`);
      assertEq(instance.exports.run(), expected);
    });
  }

  test('compiler: lifted functions avoid user function names', async ({ ROOT }) => {
    const { instance, doc } = await compile(ROOT, `
      fn __closure0() I32 { 30; }
      export lib {
        fn run() I32 {
          let n: I32 = 5;
          let f: cl() I32 = cl() { n + __closure0(); }; f();
        }
      }
    `, 'quality-names.utu');
    assertEq(instance.exports.run(), 35);
    const names = [...doc.querySelectorAll('ir-fn')].map(n => n.getAttribute('name'));
    assertEq(new Set(names).size, names.length, 'generated declarations must remain unique');
  });

  test('compiler: closure environments avoid existing internal type names', ({ compiler }) => {
    const doc = compiler.parseSource('export lib { fn run() I32 { let f: cl() I32 = cl() { 42; }; f(); } }');
    const root = doc.body.firstChild;
    const reserved = doc.createElement('ir-struct');
    reserved.setAttribute('name', '__ClosureEnv0');
    root.appendChild(reserved);
    lowerClosures(doc, new Map(), { coercions: [{ kind: 'none' }] });
    assertEq(doc.querySelector('ir-make-closure').getAttribute('env-type'), '__ClosureEnv1');
  });

  test('compiler: even locally called closures retain the JS runtime ABI', async ({ ROOT }) => {
    const { doc, instance } = await compile(ROOT, `export lib {
      fn run(n: I32) I32 { let f: cl(I32) I32 = cl(x) { x + n; }; f(7); }
      fn callback(n: I32) cl(I32) I32 { cl(x) { x + n; }; }
    }`, 'quality-js-abi.utu');
    // JSC cannot reflect some typed-funcref imports; inspect the compiler's
    // WAT and execute the binary so this contract is tested on both engines.
    const wat = emitText(doc);
    assert(wat.includes('"utu" "closure_new"'));
    assert(wat.includes('"utu" "closure_call_'));
    assertEq(instance.exports.run(5), 12);
    const callback = instance.exports.callback(5);
    assertEq(typeof callback, 'function');
    assertEq([1, 2, 3].map(callback).join(','), '6,7,8');
  });

  test('compiler: function pointers need no closure runtime', async ({ ROOT }) => {
    const { doc, instance } = await compile(ROOT, `fn inc(n: I32) I32 { n + 1; }
      export lib { fn run(n: I32) I32 { let f: fun(I32) I32 = inc; f(n); } }
    `, 'quality-fun-abi.utu');
    const imports = WebAssembly.Module.imports(await WebAssembly.compile(emitBinary(doc)));
    assert(!imports.some(i => i.name.startsWith('closure_')));
    assertEq(instance.exports.run(5), 6);
  });

  test('compiler: decay-only lowering reports its structural rewrite', ({ compiler }) => {
    const doc = compiler.parseSource('export lib { fn run() I32 { 1; } }');
    const value = doc.querySelector('ir-lit');
    const changed = lowerClosures(doc, new Map(), { coercions: [{ kind: 'fun-to-cl', node: value, to: 'cl() I32' }] });
    assertEq(changed, true);
    assertEq(value.parentElement.localName, 'ir-closure-decay');
  });

  test('compiler: closure lowering is a no-op after semantic rebuild', async ({ ROOT }) => {
    const { retainedGraphs } = await import('../src/compiler/graph-store.js');
    const { doc } = await compile(ROOT, `export lib { fn run() I32 {
      let f: cl() I32 = cl() { 42; }; f();
    } }`, 'quality-noop.utu');
    const before = doc.body.innerHTML;
    const graphs = retainedGraphs(doc);
    assertEq(lowerClosures(doc, graphs.types.typeIndex, graphs.types), false);
    assertEq(doc.body.innerHTML, before);
  });

  test('compiler: unused functions and closures add no shipped Wasm bytes', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    const bytes = source => withTempUtu(ROOT, 'quality-size.utu', source, async file => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      return emitBinary(doc);
    });
    const base = 'export lib { fn answer() I32 { 42; } }';
    const lean = await bytes(base);
    const dead = await bytes(`${base} fn unused(n: I32) I32 {
      let f: cl(I32) I32 = cl(x) { x + n; }; f(1);
    }`);
    assertEq(Buffer.from(dead).toString('hex'), Buffer.from(lean).toString('hex'));
  });

  // Failure injection exercises native resource ownership, where a thrown
  // optimizer/emitter previously leaked a Binaryen module in long-lived IDEs.
  for (const phase of ['construction', 'validation', 'optimization', 'binary', 'text']) {
    test(`compiler: Binaryen module disposed after ${phase} failure`, async ({ ROOT }) => {
      const { doc } = await compile(ROOT, 'export lib { fn run() I32 { 42; } }', `quality-dispose-${phase}.utu`);
      const Original = binaryen.Module;
      const optimize = binaryen.getOptimizeLevel();
      const shrink = binaryen.getShrinkLevel();
      let disposed = 0;
      binaryen.Module = function () {
        const module = new Original();
        const dispose = module.dispose.bind(module);
        module.dispose = () => { disposed++; dispose(); };
        const method = { construction: 'setFeatures', validation: 'validate', optimization: 'optimize', binary: 'emitBinary', text: 'emitText' }[phase];
        module[method] = () => { throw new Error(`injected ${phase}`); };
        return module;
      };
      try {
        assertThrows(() => phase === 'text' ? emitText(doc) : phase === 'construction' ? buildModule(doc) : emitBinary(doc), `injected ${phase}`);
        assertEq(disposed, 1);
        assertEq(binaryen.getOptimizeLevel(), optimize);
        assertEq(binaryen.getShrinkLevel(), shrink);
      } finally {
        binaryen.Module = Original;
      }
    });
  }

  test('compiler: invalid emission mode fails before module construction', () => {
    assertThrows(() => emitBinary(null, { stringMode: 'typo' }), 'unknown stringMode');
    assert(Object.isFrozen(JS_STRING_BUILTINS_COMPILE_OPTIONS.builtins));
  });
}
