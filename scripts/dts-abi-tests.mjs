// Declaration linker and boundary infrastructure: linking, packaging, laziness
// and size. Language-level behavior lives in dts-deep-tests.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build } from 'esbuild';
import { linkFiles } from '../tools/dts/link.mjs';
import { nodePackageResolver } from '../tools/dts/packages.mjs';
import { createPackageResolver } from '../src/bindings/packages.js';
import { linkDeclarations } from '../src/bindings/link.js';
import { compile as compileWith } from '../src/selfhost/compiler.js';
import { loadNodeCompiler, nodeHost, nodeStdlib, instantiateNode } from '../src/selfhost/node.js';
import { glueSource } from '../src/selfhost/loader.js';
import { liveGlueFields } from '../src/runtime/host-imports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utu = await loadNodeCompiler();
await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`✓ ${name}`);
}
const fixtureModule = path.join(ROOT, 'scripts/fixtures/dts/targets.mjs');
const link = (file, prefix, moduleSpecifier) => linkFiles({ files: [path.join(ROOT, file)], prefix, moduleSpecifier });
// Each ABI's std: entry once, so the compiler keeps its declarations between builds.
const abiEntries = new WeakMap();
const abiEntry = abi => abiEntries.get(abi) ?? abiEntries.set(abi, async () => ({ abi })).get(abi);
/**
 * Build `entry` (source text, or a Map of files with the entry first) with the
 * self-hosted compiler: its module, spec, error messages and glue.
 */
async function buildProgram(entry, { abis = [], optimize = 'size', resolvePackage, resolvePath } = {}) {
  const files = typeof entry === 'string' ? new Map([['/dts-test.utu', entry]]) : entry;
  const host = nodeHost({ root: ROOT, stdlib: new Map([...nodeStdlib(), ...abis.map(abi => [`std:${abi.prefix}`, abiEntry(abi)])]) });
  const result = await compileWith(utu, files.keys().next().value, { ...host, optimize, safe: true,
    readFile: async file => files.has(file) ? files.get(file) : fs.readFile(file, 'utf8'),
    resolvePath: resolvePath ?? ((_, relative) => relative),
    resolvePackage: resolvePackage === undefined ? host.resolvePackage : resolvePackage });
  const errors = result.diagnostics.filter(d => d.severity !== 'warning').map(d => d.message);
  return { ...result, errors, glue: result.wasm ? glueSource(result.spec, result.wasm) : '' };
}
/** The module's foreign (declaration-linked) imports. */
const foreignImports = wasm => WebAssembly.Module.imports(new WebAssembly.Module(wasm, { builtins: ['js-string'], importedStringConstants: "'" }))
  .filter(i => i.module === 'es');
async function compile(source, abis = [], optimize = 'size') {
  const result = await buildProgram(source, { abis, optimize });
  assert.deepEqual(result.errors, []);
  const { exports } = await instantiateNode(result.wasm, result.spec, { root: ROOT });
  return { ...result, instance: { exports } };
}
await test('the linker runs on an in-memory TypeScript host with no filesystem', () => {
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
  const abi = linkDeclarations(ts, program, { files: [file], prefix: 'Virtual', moduleSpecifier: 'virtual-api' });
  const signature = abi.types[abi.exports.twice].calls[0];
  assert.deepEqual([signature.params[0].type, signature.result], ['F64', 'F64']);
  assert.equal(abi.moduleSpecifier, 'virtual-api');
});
await test('invalid, unrooted and unmatched declarations are rejected rather than guessed', () => {
  assert.throws(() => link('scripts/fixtures/dts/invalid.d.ts', 'Bad'), /expected|Declaration|TS\d+/);
  assert.throws(() => link('scripts/fixtures/dts/targets.d.ts', 'Missing'), /moduleSpecifier/);
  assert.throws(() => link('scripts/fixtures/dts/assets.d.ts', 'Missing'), /matching/);
  assert.throws(() => link('scripts/fixtures/dts/targets.d.ts', 'lower', fixtureModule), /prefix/);
});
await test('the CLI writes a portable ABI file that programs import directly', async () => {
  const out = path.join(ROOT, '.tmp/cli-abi');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/dts/cli.mjs'), '--input', path.join(ROOT, 'scripts/fixtures/dts/targets.d.ts'),
    '--module', fixtureModule, '--prefix', 'Cli', '--out', out]);
  const file = path.join(out, 'Cli.abi.json');
  const { instance } = await compile(`using Cli from "${file}"; export lib { fn run() F64 { Cli.optional(21.0); } }`);
  assert.equal(instance.exports.run(), 42);
});
await test('a tuple names its element parameters by position, and a union enum is marked', async () => {
  const file = path.join(ROOT, '.tmp/tuples.d.ts');
  await fs.writeFile(file, 'export declare function pair(): [number, string?];\n'
    + 'export declare enum Tag { A = "a", B = "b" }\nexport declare enum Loose { Red, Green = 5 }\n');
  const abi = linkFiles({ files: [file], prefix: 'Tup', moduleSpecifier: './tup.js' });
  const result = abi.types[abi.exports.pair].calls[0].result;
  const tuple = abi.types[result.template];
  // (an optional element is its type or undefined)
  assert.deepEqual([result.arguments[0], abi.types[result.arguments[1]].union], ['F64', ['undefined', 'Str']]);
  assert.deepEqual([tuple.name, tuple.parameters], ['[T0, T1?]', ['T0', 'T1']]);
  assert.deepEqual([tuple.properties[0].type.parameter, tuple.properties[1].type.parameter], ['T0', 'T1']);
  assert.equal(abi.types[abi.names.Tag].enum, true);
  // (ambient members with no initializer are computed: TypeScript takes any number for Loose)
  assert.deepEqual(abi.types[abi.names.Loose].union, ['F64', { literal: 5, base: 'F64' }]);
});
await test('"npm:" and "node:" imports link packages from node_modules and cache them', async () => {
  const cacheDir = path.join(ROOT, '.tmp/package-cache');
  await fs.rm(cacheDir, { recursive: true, force: true });
  const resolvePackage = nodePackageResolver({ root: ROOT, cacheDir });
  const source = `using Nano from "npm:nanoid"; using Path from "node:path"; using Floating from "npm:@floating-ui/dom";
    export lib {
      fn id() I32 { Nano.nanoid(9).len(); }
      fn file() Str { Path.join("a", "b.txt"); }
      fn middleware() Str { Floating.offset(4).name; }
    }`;
  for (let round = 0; round < 2; round++) {
    const built = await buildProgram(source, { resolvePackage });
    assert.deepEqual(built.errors, []);
    const instance = await instantiateNode(built.wasm, built.spec, { root: ROOT });
    assert.equal(instance.exports.id(), 9);
    assert.equal(instance.exports.file(), path.join('a', 'b.txt'));
    assert.equal(instance.exports.middleware(), 'offset');
  }
  assert.equal((await fs.readdir(cacheDir)).length, 3, 'one cached declaration graph per package');
  // A package that cannot be linked, or no resolver to link it, leaves the import unresolved: no module.
  const missing = await buildProgram('using Nope from "npm:utu-no-such-package"; export main() void {}', { resolvePackage });
  assert.equal(missing.wasm, null);
  assert.deepEqual(missing.errors, ['No declarations for npm:utu-no-such-package; is it installed?']);
  const unresolved = await buildProgram('using Nano from "npm:nanoid"; export main() void {}', { resolvePackage: null });
  assert.equal(unresolved.wasm, null);
  assert.deepEqual(unresolved.errors, ['No declarations for npm:nanoid; is it installed?']);
});
await test('package resolution runs over an in-memory file system', () => {
  const files = new Map([
    ['/app/node_modules/greet/package.json', JSON.stringify({ name: 'greet', exports: { '.': { types: './types/index.d.ts', default: './index.js' } } })],
    ['/app/node_modules/greet/types/index.d.ts', 'export declare function greet(name: string): string;'],
  ]);
  const directories = new Set(['/app', '/app/node_modules', '/app/node_modules/greet', '/app/node_modules/greet/types']);
  const resolve = createPackageResolver({ ts, root: '/app', libDir: '/lib', libraries: [], fs: {
    readFile: name => files.get(name), fileExists: name => files.has(name), directoryExists: name => directories.has(name),
  } });
  const { abi, files: read } = resolve('npm:greet', { prefix: 'Greet' });
  assert.equal(abi.moduleSpecifier, 'greet');
  assert.equal(abi.types[abi.exports.greet].calls[0].result, 'Str');
  assert.deepEqual(read, ['/app/node_modules/greet/types/index.d.ts']);
});
const fixture = link('scripts/fixtures/dts/targets.d.ts', 'Fixture', fixtureModule);
await test('portable Wasm import scanning matches host reflection and rejects truncation', async () => {
  const { wasmImports } = await import('../src/runtime/wasm-imports.js');
  const { wasm } = await compile('using Fixture from std:Fixture; export lib { fn run() Bool { Fixture.flip(false); } }', [fixture]);
  const expected = WebAssembly.Module.imports(await WebAssembly.compile(wasm)).map(({ module, name }) => ({ module, name }));
  assert.deepEqual(wasmImports(wasm).map(({ module, name }) => ({ module, name })), expected);
  const padded = new Uint8Array(wasm.length + 10); padded.set(wasm, 5);
  assert.deepEqual(wasmImports(padded.subarray(5, 5 + wasm.length)), wasmImports(wasm));
  assert.deepEqual([...await liveGlueFields(wasm)].sort(),
    expected.filter(i => i.module !== "'" && i.module !== 'wasm:js-string').map(i => i.name).sort());
  assert.throws(() => wasmImports(wasm.subarray(0, 7)), /malformed/);
  assert.throws(() => wasmImports(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 2, 127])), /malformed/);
});
await test('package members are named imports that bundlers tree-shake', async () => {
  const floating = link('node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts', 'Floating', '@floating-ui/dom');
  const { instance, glue } = await compile('using Floating from std:Floating; export lib { fn run() Str { Floating.offset(12.0).name; } }', [floating]);
  assert.equal(instance.exports.run(), 'offset');
  assert.match(glue, /import \{ "offset" as /);
  assert(!glue.includes('computePosition'));
  const bundle = await build({ stdin: { contents: glue, resolveDir: ROOT, loader: 'js' }, bundle: true, write: false, minify: true, format: 'esm', platform: 'browser' });
  assert(bundle.outputFiles[0].contents.length < 8000, 'one middleware should not pull in the whole library');
});
await test('1,000 unused declarations add zero Wasm or live-glue bytes', async () => {
  const file = path.join(ROOT, '.tmp/dts-size.d.ts');
  async function variant(extra) {
    await fs.writeFile(file, 'export declare function optional(value: number): number;\n' + extra);
    const size = linkFiles({ files: [file], prefix: 'Size', moduleSpecifier: fixtureModule });
    const result = await compile('using Size from std:Size; export lib { fn run() F64 { Size.optional(21.0); } }', [size]);
    assert.equal(result.instance.exports.run(), 42);
    return result;
  }
  try {
    const lean = await variant('');
    const heavy = await variant(Array.from({ length: 1000 }, (_, i) => `export declare function unused${i}(x: number): number;`).join('\n'));
    assert.deepEqual(heavy.wasm, lean.wasm);
    assert.equal(heavy.glue, lean.glue);
  } finally { await fs.unlink(file); }
});
await test('operations differing only in host types share one import', async () => {
  const { glue } = await compile(`using Browser from std:Browser; export lib { fn run() void {
    let document = Browser.document;
    let div = document.createElement("div"); let input = document.createElement("input"); let span = document.createElement("span");
    div.append(input, span); input.append(span, div); document.body.append(div, input);
  } }`, [], 'speed');
  assert.equal((glue.match(/\.append\(|\["append"\]\(/g) ?? []).length, 1, glue);
});
await test('-Oz shares one import per host operation shape; -O3 specializes each name', async () => {
  const source = `using Browser from std:Browser; export lib { fn run() void {
    let input = Browser.document.createElement("input");
    input.value = "a"; input.placeholder = "b"; input.title = input.value + input.placeholder;
  } }`;
  const glueFor = async optimize => (await compile(source, [], optimize)).glue;
  const size = await glueFor('size'), speed = await glueFor('speed');
  assert.match(size, /self\[k\] = value/); assert.doesNotMatch(size, /"placeholder"/);
  assert.match(speed, /self\["placeholder"\] = value/); assert.match(speed, /self\["value"\] = value/);
  assert(size.length < speed.length, 'sharing makes the glue smaller');
});
await test('dead @es imports never execute', async () => {
  const { instance } = await compile('let poison: fun() I32 = @es/\\ (()=>{throw Error("dead glue executed")})() \\/; export lib { fn run() I32 { 42; } }');
  assert.equal(instance.exports.run(), 42);
});
await test('the browser module is one lazy declaration graph; only used members emit code', async () => {
  const { wasm, files, instance, glue } = await compile('using Browser from std:Browser; export lib { fn run() Bool { Browser.isFinite(42.0); } }');
  assert.equal(instance.exports.run(), true);
  // (No std:Browser source joins the program: its declarations are a graph, not a file.)
  assert(!files.some(file => file.key === 'std:Browser'));
  assert.equal(foreignImports(wasm).length, 1);
  assert(!glue.includes('createElement'));
});
await test('aliased browser imports across a module diamond resolve independently per build', async () => {
  const files = new Map([
    ['/main.utu', 'using left from "left.utu"; using right from "right.utu"; export lib { fn run() Bool { left.run() and right.run(); } }'],
    ['/left.utu', 'using Browser |B| from std:Browser; mod left { fn run() Bool { B.isFinite(42.0); } }'],
    ['/right.utu', 'using Browser from std:Browser; mod right { fn run() Bool { Browser.isNaN(0.0 / 0.0); } }'],
  ]);
  const resolvePath = (from, relative) => path.posix.resolve(path.posix.dirname(from), relative);
  const first = await buildProgram(files, { optimize: 'speed', resolvePath });
  assert.deepEqual(first.errors, []);
  assert.equal(foreignImports(first.wasm).length, 2);
  const instance = await instantiateNode(first.wasm, first.spec, { root: ROOT });
  assert.equal(instance.exports.run(), true);
  files.set('/main.utu', 'using Browser from std:Browser; export lib { fn run() Bool { Browser.isFinite(1.0); } }');
  const second = await buildProgram(files, { optimize: 'speed', resolvePath });
  assert.deepEqual(second.errors, []);
  assert(!JSON.stringify(second.spec.es ?? {}).includes('isNaN'));
});
await test('unknown browser members name the declaration they were looked up on', async () => {
  const { errors: messages } = await buildProgram('using Browser from std:Browser; export main() void { Browser.not_a_browser_api(); Browser.document.notAMethod(); }');
  // One error per unknown member: its call-site consequences are not reported apart.
  assert(messages.includes('No member Browser.not_a_browser_api'), messages.join('\n'));
  assert(messages.includes('No member Browser.Document.notAMethod'), messages.join('\n'));
  assert.equal(messages.length, 2);
});
await test('closures capture host strings without unlowered public GC types', async () => {
  const { instance } = await compile(`
    struct Box: | text: Str
    export lib {
      fn capture(text: Str) cl() Str { cl() { text; }; }
      fn boxed(text: Str) cl() Str { let box: Box = Box { text: text }; cl() { box.text; }; }
    }
  `);
  const text = 'captured 🌱\u0000\ud800';
  assert.equal(instance.exports.capture(text)(), text);
  assert.equal(instance.exports.boxed(text)(), text);
});
console.log(`${passed} ABI infrastructure tests passed`);
