import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkFiles } from '../tools/dts/link.mjs';
import { initParser, createCompiler, emitBinary, buildImportObject, instantiateLowered } from '../src/index.js';
import { PLATFORM_SOURCES } from '../src/compiler/platform-sources.generated.js';
import { glueModuleSource, liveGlueFields, promisifyExports, readRuntimeSpec } from '../src/runtime/host-imports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parser = await initParser({ wasmDir: `${ROOT}/` });
const fixture = linkFiles({ files: [path.join(ROOT, 'scripts/fixtures/dts/targets.d.ts')], prefix: 'Fixture', moduleSpecifier: path.join(ROOT, 'scripts/fixtures/dts/targets.mjs') });
const sourceOf = abi => async () => ({ source: `mod ${abi.prefix} {}`, abi });
async function compile(source, abi = fixture, target = 'normal') {
  const stdlib = new Map([...PLATFORM_SOURCES, [`std:${abi.prefix}`, sourceOf(abi)]]);
  const c = createCompiler({ parser, target, stdlib, debugAssertions: true, readFile: async () => source, resolvePath: (_, r) => r });
  return c.compileFile('/deep.utu');
}
async function run(body, abi = fixture) {
  const doc = await compile(`using ${abi.prefix} from std:${abi.prefix}; export lib { ${body} }`, abi);
  const errors = [...doc.querySelectorAll('[data-error]')].map(n => n.dataset.errorMessage ?? n.dataset.error);
  assert.deepEqual(errors, []);
  const wasm = emitBinary(doc);
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
  return { exports: typeof WebAssembly.promising === 'function' ? promisifyExports(instance, readRuntimeSpec(doc.body.firstChild, 'promiseRuntime')) : instance.exports, doc, wasm, glue: glueModuleSource(JSON.parse(doc.body.firstChild.dataset.dslImportsJs), await liveGlueFields(wasm)) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`); }
try {
  await test('constructors, inferred locals, inherited members and deep returned properties', async () => {
    const { exports } = await run(`fn run() F64 {
      let c = Fixture.Counter(2.0); c.label = "counter";
      let n = c.increment(3.0); Fixture.sum(n, c.doubled, Fixture.constants.nested.answer);
    }`);
    assert.equal(exports.run(), 57);
  });
  await test('overloads, omitted optional arguments, rest arguments and generic identity', async () => {
    const { exports } = await run(`
      fn text() Str { Fixture.overloaded(Fixture.echo("hello")); }
      fn number() F64 { Fixture.overloaded(Fixture.echo(5.0)); }
      fn optional() F64 { Fixture.optional(4.0); }
      fn rest() F64 { Fixture.sum(1.0, 2.0, 3.0, 4.0); }
    `);
    assert.equal(exports.text(), 'HELLO'); assert.equal(exports.number(), 6);
    assert.equal(exports.optional(), 8); assert.equal(exports.rest(), 10);
  });
  await test('contextual closures preserve real JS boolean results', async () => {
    const { exports } = await run(`
      fn apply() F64 { Fixture.apply(3.0, cl(value) { value + 2.0; }); }
      fn boolean() Bool { Fixture.booleanCallback(cl(value) { not value; }); }
    `);
    assert.equal(exports.apply(), 5); assert.equal(exports.boolean(), 1);
  });
  await test('object arguments use normal contextual record syntax and JS primitives', async () => {
    const { exports } = await run(`fn run() Str {
      let result = Fixture.make(&{ label: "hello", count: 2.0, enabled: true }); result.label;
    }`);
    assert.equal(exports.run(), 'hello');
  });
  await test('index getters and setters, nested namespaces and constant enums', async () => {
    const { exports } = await run(`fn run() F64 {
      Fixture.dictionary["deep"] = 8.0;
      Fixture.dictionary["deep"] + Fixture.Util.Nested.answer + Fixture.ConstMode.Second;
    }`);
    assert.equal(exports.run(), 72);
  });
  await test('exported unique symbol keys preserve method receivers', async () => {
    const { exports } = await run(`fn run() Str { let value = Fixture.symbolic(); value[Fixture.token](); }`);
    assert.equal(exports.run(), 'symbol works');
  });
  await test('nullable return values retain their type through promote', async () => {
    const { exports } = await run(`fn run(present: Bool) Str {
      promote Fixture.optionalText(present) { |text| => text, ~> "absent", };
    }`);
    assert.equal(exports.run(true), 'present'); assert.equal(exports.run(false), 'absent');
  });
  await test('nullable numbers unbox naturally after promote', async () => {
    const { exports } = await run(`fn run(present: Bool) F64 {
      promote Fixture.optionalNumber(present) { |number| => number, ~> 0.0, };
    }`);
    assert.equal(exports.run(true), 42); assert.equal(exports.run(false), 0);
  });
  await test('readonly members and incorrect arguments produce diagnostics', async () => {
    for (const [body, pattern] of [
      ['let c = Fixture.Counter(); c.id = "bad";', /readonly/],
      ['Fixture.optional("bad");', /Type mismatch/],
      ['let c = Fixture.Counter(); c.label = 7.0;', /Type mismatch/],
      ['Fixture.optional();', /overload/],
      ['Fixture.noSuchAPI();', /Unknown foreign member/],
      ['Fixture.make(&{label: 4.0, count: 2.0});', /Type mismatch/],
      ['Fixture.make(&{label: "missing count"});', /Missing foreign property/],
      ['let c = Fixture.Counter(); c.missing();', /Unknown foreign member 'Fixture\.Counter\.missing'/],
    ]) {
      const doc = await compile(`using Fixture from std:Fixture; export main() void { ${body} }`);
      assert([...doc.querySelectorAll('[data-error]')].some(n => pattern.test(n.dataset.errorMessage ?? '')), body);
    }
  });
  await test('real nanoid package uses natural named exports', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'node_modules/nanoid/index.d.ts')], prefix: 'Nano', moduleSpecifier: 'nanoid' });
    const { exports } = await run('fn run() Str { Nano.nanoid(12.0); }', output);
    assert.equal(exports.run().length, 12);
  });
  await test('foreign Promise results work with UTU await', async () => {
    if (typeof WebAssembly.Suspending !== 'function') return;
    const { exports } = await run('fn run() Str { await Fixture.later("later"); }');
    assert.equal(await exports.run(), 'later');
  });
  await test('CommonJS callable exports retain attached properties', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'scripts/fixtures/dts/export-equals.d.cts')], prefix: 'Common', moduleSpecifier: path.join(ROOT, 'scripts/fixtures/dts/export-equals.cjs') });
    const { exports } = await run('fn run() Str { Common.default.label; }', output);
    assert.equal(exports.run(), 'callable namespace');
  });
  await test('node:path exposes deep methods without accessor names', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'node_modules/@types/node/path.d.ts')], prefix: 'Path', moduleSpecifier: 'node:path' });
    const { exports } = await run('fn run() Str { Path.default.posix.join("a", "b", "c"); }', output);
    assert.equal(exports.run(), 'a/b/c');
  });
  await test('Floating UI factory returns a typed middleware object', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts')], prefix: 'Floating', moduleSpecifier: '@floating-ui/dom' });
    const { exports } = await run('fn run() Str { Floating.offset(8.0).name; }', output);
    assert.equal(exports.run(), 'offset');
  });
  await test('mitt callbacks retain identity for subscribe and unsubscribe', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'node_modules/mitt/index.d.ts')], prefix: 'Mitt', moduleSpecifier: 'mitt' });
    const { exports } = await run(`fn run() void {
      let emitter = Mitt.default();
      let callback = cl(value: Externref) void {};
      emitter.on("event", callback); emitter.emit("event", "hello"); emitter.off("event", callback);
    }`, output);
    exports.run();
  });
  await test('ABI files load directly with lowercase module aliases', async () => {
    const source = `using Fixture |api| from "/fixture.abi.json";
      export lib { fn run() F64 { let c = api.Counter(3.0); c.doubled; } }`;
    const compiler = createCompiler({ parser, target: 'normal', debugAssertions: true,
      readFile: async file => file.endsWith('.abi.json') ? JSON.stringify(fixture) : source,
      resolvePath: (_, relative) => relative });
    const doc = await compiler.compileFile('/main.utu');
    assert(!doc.querySelector('[data-error]'), doc.querySelector('[data-error]')?.dataset.errorMessage);
    const wasm = emitBinary(doc);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm }));
    assert.equal(instance.exports.run(), 6);
  });
  await test('explicit new selects the construct signature of callable constructors', async () => {
    const source = `using Browser from std:Browser; export lib { fn run() F64 {
      let date = new Browser.Date(0.0); date.getUTCFullYear();
    } }`;
    const doc = await compile(source);
    assert(!doc.querySelector('[data-error]'), doc.querySelector('[data-error]')?.dataset.errorMessage);
    const wasm = emitBinary(doc);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm }));
    assert.equal(instance.exports.run(), 1970);
  });
  await test('mutable globals use direct assignment while const globals stay readonly', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'scripts/fixtures/dts/globals.d.ts')], prefix: 'Globals' });
    const { exports } = await run('fn run() F64 { Globals.abiCounter = 40.0; Globals.abiCounter += 2.0; Globals.abiCounter; }', output);
    try { assert.equal(exports.run(), 42); } finally { delete globalThis.abiCounter; }
    const doc = await compile('using Globals from std:Globals; export main() void { Globals.abiFixed = 0.0; }', output);
    assert([...doc.querySelectorAll('[data-error]')].some(n => /readonly/.test(n.dataset.errorMessage ?? '')));
  });
  await test('generic calls retain foreign identities across separate ABI imports', async () => {
    const doc = await compile(`using Fixture from std:Fixture; using Browser from std:Browser;
      export lib { fn run() F64 { let date = Fixture.echo(new Browser.Date(0.0)); date.getUTCFullYear(); } }`);
    assert(!doc.querySelector('[data-error]'), doc.querySelector('[data-error]')?.dataset.errorMessage);
    const wasm = emitBinary(doc);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm }));
    assert.equal(instance.exports.run(), 1970);
  });
  async function runBrowser(body) {
    const doc = await compile(`using Browser from std:Browser; export lib { ${body} }`);
    const errors = [...doc.querySelectorAll('[data-error]')].map(n => n.dataset.errorMessage ?? n.dataset.error);
    assert.deepEqual(errors, []);
    const wasm = emitBinary(doc);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
    return instance.exports;
  }
  async function withDom(fn) {
    const { parseHTML } = await import('linkedom');
    const window = parseHTML('<!doctype html><html><body></body></html>');
    const names = ['document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSpanElement', 'Text', 'Event'];
    const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    for (const name of names) Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
    try { await fn(window); } finally {
      for (const [name, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
    }
  }
  await test('union slots accept any member: strings, subtypes, closures and records', async () => {
    let fired = 0;
    const exports = await runBrowser(`
      fn params() Str { let p = new Browser.URLSearchParams("a=1&b=2"); p.append("c", "3"); p.toString(); }
      fn timer() void { Browser.setTimeout(cl() void { Browser.console.info("timer"); }, 0.0); }
      fn once() F64 {
        let seen = Browser.Array();
        let target = new Browser.EventTarget();
        target.addEventListener("ping", cl(event) void { seen.push(event.type); }, &{ once: true });
        target.dispatchEvent(new Browser.Event("ping"));
        target.dispatchEvent(new Browser.Event("ping"));
        seen.length;
      }
      fn detail() F64 { let event = new Browser.CustomEvent("x", &{ detail: 5.0 }); event.detail; }
      fn nothing() Str { Browser.JSON.stringify(null); }
    `);
    assert.equal(exports.params(), 'a=1&b=2&c=3');
    const info = console.info; console.info = () => fired++;
    try { exports.timer(); await new Promise(resolve => setTimeout(resolve, 5)); } finally { console.info = info; }
    assert.equal(fired, 1);
    assert.equal(exports.once(), 1);
    assert.equal(exports.detail(), 5);
    assert.equal(exports.nothing(), 'null');
  });
  await test('generic callbacks infer results, accept shorter arity and bind later closures', async () => {
    const exports = await runBrowser(`
      fn upper() Str { Browser.Array.of("x", "y").map(cl(s) Str { s.toUpperCase(); }).join(","); }
      fn doubled() Str {
        let out = Browser.Array();
        Browser.Array.of(1.0, 2.0, 3.0).forEach(cl(n) void { out.push(n * 2.0); });
        out.join(",");
      }
      fn later() F64 {
        let square = cl(n) F64 { n * n; };
        let values = Browser.Array.of(2.0, 3.0).map(square);
        values[0.0] + values[1.0];
      }
    `);
    assert.equal(exports.upper(), 'X,Y');
    assert.equal(exports.doubled(), '2,4,6');
    assert.equal(exports.later(), 13);
  });
  await test('UTU strings and numbers use declared String and Number members', async () => {
    const exports = await runBrowser(`
      fn upper() Str { "abc".toUpperCase(); }
      fn padded() Str { "7".padStart(3.0, "0"); }
      fn parts() F64 { "a,b,c".split(",").length; }
      fn replaced() Str { "a-b-c".replaceAll("-", "+"); }
      fn fixed() Str { let n = 3.14159; n.toFixed(2.0); }
      fn native() I32 { "abc".len(); }
      fn width() F64 { let s = "hello"; s.length; }
    `);
    assert.equal(exports.upper(), 'ABC'); assert.equal(exports.padded(), '007');
    assert.equal(exports.parts(), 3); assert.equal(exports.replaced(), 'a+b+c');
    assert.equal(exports.fixed(), '3.14'); assert.equal(exports.native(), 3); assert.equal(exports.width(), 5);
  });
  await test('alt narrows host values by runtime class', async () => {
    const exports = await runBrowser(`
      fn kind(index: F64) Str {
        let values = Browser.Array();
        values.push(new Browser.Date(0.0)); values.push(new Browser.URL("https://utu.dev/x")); values.push("plain");
        alt values[index] {
          Browser.Date |date| => date.toISOString().slice(0, 4),
          Browser.URL |url| => url.hostname,
          ~> "other",
        };
      }
    `);
    assert.equal(exports.kind(0), '1970'); assert.equal(exports.kind(1), 'utu.dev'); assert.equal(exports.kind(2), 'other');
  });
  await test('DOM: tag-name narrowing, index-signature properties, union rest arguments and event targets', async () => {
    await withDom(async window => {
      const exports = await runBrowser(`
        fn build() Str {
          let document = Browser.document;
          let input = document.createElement("input");
          document.body.appendChild(input);
          input.dataset.role = "search";
          promote document.querySelector("input") { |found| => found.value = "typed", ~> {}, };
          let row = document.createElement("div");
          row.append("label ", document.createElement("span"));
          row.classList.toggle("active");
          document.body.appendChild(row);
          document.body.innerHTML;
        }
        fn target() Str {
          let log = Browser.Array();
          let handler = cl(event) void {
            alt event.target {
              Browser.HTMLInputElement |input| => log.push(input.value),
              ~> log.push("unknown"),
            };
          };
          promote Browser.document.querySelector("input") { |input| => {
            input.addEventListener("change", handler);
            input.dispatchEvent(new Browser.Event("change"));
            input.removeEventListener("change", handler);
            input.dispatchEvent(new Browser.Event("change"));
          }, ~> {}, };
          log.join("|");
        }
      `);
      const html = exports.build();
      assert.match(html, /<input[^>]* data-role="search"/);
      assert(html.endsWith('<div class="active">label <span></span></div>'), html);
      assert.equal(window.document.querySelector('input').value, 'typed');
      assert.equal(exports.target(), 'typed');
    });
  });
  await test('tuple literals become JS arrays for array, array-like, iterable and dynamic slots', async () => {
    const exports = await runBrowser(`
      fn json() Str { Browser.JSON.stringify(.{1.0, "two", true, &{ n: 3.0 }}); }
      fn from() F64 { let values = Browser.Array.from(.{1.0, 2.0, 4.0}); values[2.0] + values.length; }
      fn blob() F64 { let b = new Browser.Blob(.{"hello ", "world"}, &{ type: "text/plain" }); b.size; }
      fn set() F64 { let s = new Browser.Set(.{"a", "b", "a"}); s.size; }
    `);
    assert.equal(exports.json(), '[1,"two",true,{"n":3}]');
    assert.equal(exports.from(), 7); assert.equal(exports.blob(), 11); assert.equal(exports.set(), 2);
    const doc = await compile('using Browser from std:Browser; export main() void { let t = .{1.0, 2.0}; }');
    assert([...doc.querySelectorAll('[data-error]')].some(n => /tuple literal needs a declared host array type/.test(n.dataset.errorMessage ?? '')));
  });
  await test('package declarations accept DOM values, records, tuples, closures and awaited results', async () => {
    const output = linkFiles({ files: [path.join(ROOT, 'node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts')], prefix: 'Floating', moduleSpecifier: '@floating-ui/dom' });
    const stdlib = new Map([...PLATFORM_SOURCES, ['std:Floating', sourceOf(output)]]);
    const source = `using Browser from std:Browser; using Floating from std:Floating;
      export main() void {
        let button = Browser.document.createElement("button");
        let tip = Browser.document.createElement("div");
        let pos = await Floating.computePosition(button, tip, &{ placement: "top",
          middleware: .{ Floating.offset(8.0), Floating.flip(), Floating.shift(&{ padding: 5.0 }) } });
        tip.style.left = pos.x.toString() + "px";
        let cleanup = Floating.autoUpdate(button, tip, cl() void {});
        cleanup();
      }`;
    const c = createCompiler({ parser, target: 'normal', stdlib, debugAssertions: true, readFile: async () => source, resolvePath: (_, r) => r });
    const doc = await c.compileFile('/floating.utu');
    assert.deepEqual([...doc.querySelectorAll('[data-error]')].map(n => n.dataset.errorMessage), []);
    const glue = Object.values(JSON.parse(doc.body.firstChild.dataset.dslImportsJs).es).join('\n');
    assert.match(glue, /\(p0,p1,p2\) => \[p0,p1,p2\]/);
    assert.match(glue, /import \{ "computePosition" as /);
    emitBinary(doc);
  });
  await test('undefined results are absence for promote; generic constraints flow through methods', async () => {
    const exports = await runBrowser(`
      fn lookup(key: Str) F64 {
        let m = new Browser.Map();
        m.set("a", 1.0);
        promote m.get(key) { |value| => 10.0, ~> -1.0, };
      }
      fn first(min: F64) Str {
        let words = Browser.Array.of("a", "bbb", "cc");
        promote words.find(cl(w) Bool { w.length >= min; }) { |w| => w.toUpperCase(), ~> "none", };
      }
      fn kept() Str { Browser.Array.of("a", "bbb", "cc").filter(cl(w) Bool { w.length > 1.0; }).join("+"); }
    `);
    assert.equal(exports.lookup('a'), 10); assert.equal(exports.lookup('z'), -1);
    assert.equal(exports.first(2), 'BBB'); assert.equal(exports.first(9), 'none');
    assert.equal(exports.kept(), 'bbb+cc');
  });
  await test('checked programs keep precise declaration types in diagnostics', async () => {
    for (const [body, message] of [
      ['let x: Browser.HTMLInputElement = Browser.document.body;', 'expected Browser.HTMLInputElement, got Browser.HTMLElement'],
      ['Browser.document.body.appendChild("text");', 'expected Browser.Node, got Str'],
      ['promote Browser.document { |d| => {}, ~> {}, };', 'expected nullable, got Browser.Document'],
      ['let words = Browser.Array.of("a"); let n: F64 = words;', 'got Browser.Str[]'],
    ]) {
      const doc = await compile(`using Browser from std:Browser; export main() void { ${body} }`);
      const messages = [...doc.querySelectorAll('[data-error]')].map(n => n.dataset.errorMessage ?? '');
      assert(messages.some(m => m.includes(message)), `${body}: ${messages.join(' | ')}`);
    }
  });
  await test('default exports, booleans, unions, never, namespaces and const enums read naturally', async () => {
    const { exports } = await run(`
      fn greeting() Str { Fixture.default("UTU"); }
      fn boolean() Bool { Fixture.flip(false); }
      fn number() F64 { Fixture.union(42.0); }
      fn text() Str { Fixture.union("choice"); }
      fn failure() void { Fixture.fail(); }
      fn namespace() F64 { Fixture.Util.scale(21.0); }
      fn constant() F64 { Fixture.ConstMode.First + Fixture.ConstMode.Second; }
    `);
    assert.equal(exports.greeting(), 'Hello UTU'); assert.equal(exports.boolean(), 1);
    assert.equal(exports.number(), 42); assert.equal(exports.text(), 'choice');
    assert.throws(() => exports.failure(), /fixture failure/);
    assert.equal(exports.namespace(), 42); assert.equal(exports.constant(), 42);
  });
  await test('closures whose first parameter is `this` receive the JS receiver', async () => {
    const { exports } = await run(`
      fn label() Str { Fixture.arbitrary(cl(this, first) Str { this.label; }); }
      fn count() F64 { Fixture.arbitrary(cl(this, first: F64, second: Str) F64 { this.count + first; }); }
      fn bound() Str { let read = cl(this) Str { this.label; }; Fixture.arbitrary(read); }
    `);
    assert.equal(exports.label(), 'receiver'); assert.equal(exports.count(), 43); assert.equal(exports.bound(), 'receiver');
    const dom = await runBrowser(`
      fn click() Str {
        let target = new Browser.EventTarget();
        let seen = Browser.Array();
        target.addEventListener("ping", cl(this, event) void { seen.push(Browser.Object.is(this, target)); });
        target.dispatchEvent(new Browser.Event("ping"));
        Browser.JSON.stringify(seen);
      }
    `);
    assert.equal(dom.click(), '[true]');
  });
  await test('host values keep exact identity through dynamic slots', async () => {
    const exports = await runBrowser(`
      fn big() Bool { let n = Browser.BigInt("99999999999999999999999999999999999999"); Browser.Object.is(n, Browser.structuredClone(n)); }
      fn symbol() Bool { let s = Browser.Symbol("unique"); let box = Browser.Array.of(s); Browser.Object.is(s, box[0.0]); }
    `);
    assert.equal(exports.big(), 1); assert.equal(exports.symbol(), 1);
  });
  await test('CommonJS callables and wildcard ambient modules link to their runtime module', async () => {
    const common = linkFiles({ files: [path.join(ROOT, 'scripts/fixtures/dts/export-equals.d.cts')], prefix: 'Common', moduleSpecifier: path.join(ROOT, 'scripts/fixtures/dts/export-equals.cjs') });
    const { exports } = await run('fn call() F64 { Common.default(21.0); } fn label() Str { Common.default.label; }', common);
    assert.equal(exports.call(), 42); assert.equal(exports.label(), 'callable namespace');
    const asset = linkFiles({ files: [path.join(ROOT, 'scripts/fixtures/dts/assets.d.ts')], prefix: 'Asset', moduleSpecifier: path.join(ROOT, 'scripts/fixtures/dts/theme.mjs') });
    const { exports: theme } = await run('fn color() Str { Asset.default.color; }', asset);
    assert.equal(theme.color(), 'green');
  });
  await test('closure parameters without any context are diagnosed instead of crashing', async () => {
    const doc = await compile('using Browser from std:Browser; export main() void { let h = cl(e) void {}; }');
    assert([...doc.querySelectorAll('[data-error]')].some(n => /Cannot infer the type of closure parameter 'e'/.test(n.dataset.errorMessage ?? '')));
  });
  console.log(`${passed} deep ABI tests passed`);
} finally { parser.delete(); }
