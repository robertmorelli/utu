// The Go host (std/go, src/selfhost/go-host.js, `utu build`):
//
//   • std/go vets, and its tests pass (with the race detector)
//   • every standard-library host binding has Go, and all of std/go's
//     `// utu:` keys are bindings (Wutu's are the browser's, so have none)
//   • the standard library's Go gives what its JavaScript does: each pure
//     binding, through a host.go written for it, on the same arguments, as
//     the JavaScript host gives them (the differences are listed, and why)
//   • programs built with `utu build` and made Go by gosm print what `utu
//     run` does on JavaScript: the examples that need nothing of the
//     browser, and a program of every kind of host binding, whose `@go`
//     and `@es` versions are the same program
//
// Skipped, saying so, where there is no Go or no gosm (UTU_GOSM, a checkout
// of it, or one beside utu).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { goHostFiles, readSidecars, stdHostSites } from '../src/selfhost/go-host.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STD = path.join(ROOT, 'std');
const GO_STD = path.join(STD, 'go');

if (spawnSync('go', ['version']).status !== 0) {
  console.log('go host: skipped (no `go` on PATH)');
  process.exit(0);
}
const GOSM = [process.env.UTU_GOSM, path.join(ROOT, '..', 'gosm')]
  .find(dir => dir && spawnSync('test', ['-d', path.join(dir, 'cmd', 'gosm')]).status === 0);
if (!GOSM) {
  console.log('go host: skipped (no gosm checkout: set UTU_GOSM)');
  process.exit(0);
}
const gosmDir = path.resolve(GOSM);
const goMod = module => `module ${module}\n\ngo 1.24\n\nrequire gosm v0.0.0\n\nreplace gosm => ${gosmDir}\n`;

function go(args, cwd) {
  const r = spawnSync('go', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `go ${args.join(' ')} in ${cwd}\n${r.stdout}${r.stderr}`);
  return r.stdout;
}

const readDir = async (dir, keep) => Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(keep)
  .map(async f => [f, await fs.readFile(path.join(dir, f), 'utf8')])));
const stdSites = stdHostSites(await readDir(STD, f => f.endsWith('.utu')));
const sidecars = readSidecars(await readDir(GO_STD, f => f.endsWith('.go') && !f.endsWith('_test.go')));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-go-host-'));

// ---------------------------------------------------------------------------
// The standard library's Go against its JavaScript

// Not pure, or not a value: tested in std/go's own tests.
const IMPURE = /^(Console|Time|Random|Stream)\./;

// Where Go's answer is Go's, on purpose. Each is [key, which arguments, why].
const DIFFERENT = [
  ['F64.pow', args => Number.isNaN(args[1]) || (Math.abs(args[0]) === 1 && !Number.isFinite(args[1])),
    "Go's math.Pow(1, y) is 1 for every y; JavaScript's is NaN for NaN and ±Infinity"],
  ['Str.to_upper', args => /[ßŉǰΐΰﬀ-ﬆ]/.test(args[0]),
    "Go's strings.ToUpper maps a letter to one letter: ß stays ß, not SS"],
  ['Str.to_lower', args => /Σ/.test(args[0]),
    "Go's strings.ToLower has no final sigma"],
];

// Go's math rounds differently from V8's (fdlibm's): by a bit, and for
// pow, and for sin and tan where the result is near 0, by more. The bound
// is the most units in the last place a case may be off; the test reports
// the most any was.
const ULPS = {
  'F64.pow': 64, 'F64.sin': 32, 'F64.tan': 32, 'F64.cos': 1, 'F64.asin': 1, 'F64.acos': 1, 'F64.atan': 1,
  'F64.exp': 1, 'F64.ln': 1, 'F64.log2': 1, 'F64.log10': 1, 'F64.cbrt': 1, 'F64.atan2': 1, 'F64.hypot': 1,
};

const lone = String.fromCharCode(0xd800);
const POOLS = {
  ref: ['', 'a', '  hi  ', '\t\n x  ', 'Hello, World', 'é', 'naïve café', '😀x😀', `ab${lone}cd`, 'aaa', 'abcabc',
    '﻿z', 'ÜNÏCÖDÉ', 'straße', 'ΟΔΟΣ', '-42', ' 17 ', '0x1F', '-0x10', '2147483648', '-2147483648', '3.5', '1e3',
    '.5', '5.', 'Infinity', '-Infinity', '0b101', '0o17', '1_000', 'abc', '0x', '+7', '1e400', '١٢', 'a😀', 'x'],
  i32: [0, 1, -1, 2, 3, 7, 42, -5, 2147483647, -2147483648],
  i64: [0n, 1n, -1n, 9007199254740993n, -9223372036854775808n, 9223372036854775807n],
  f64: [0, -0, 1, -1, 0.5, 0.1, 1 / 3, 2.5, 100, 123.456, 1e21, 1e20, 1e-7, 1.5e-7, 1.2345678901234568e20, 5e-324,
    1.7976931348623157e308, NaN, Infinity, -Infinity, Math.PI, -2, 8],
  f32: [0, 1, -1, 0.1, 1 / 3, 3.4028234663852886e38, 1e-45, NaN, Infinity, 16777217, 0.30000001192092896].map(Math.fround),
};
// Arguments that must stay small, by binding.
const SMALL = { 'Str.repeat': [null, [-1, 0, 1, 3]], 'Str.pad_start': [null, [-1, 0, 3, 8]], 'Str.pad_end': [null, [-1, 0, 3, 8]] };
const MAX_CASES = 400;

/** The argument lists for a binding: every combination of its pools, thinned evenly to MAX_CASES. */
function argumentLists(site) {
  const pools = site.params.map((type, i) => SMALL[site.key]?.[i] ?? POOLS[type]);
  let lists = [[]];
  for (const pool of pools) lists = lists.flatMap(list => pool.map(v => [...list, v]));
  if (lists.length <= MAX_CASES) return lists;
  const step = lists.length / MAX_CASES;
  return Array.from({ length: MAX_CASES }, (_, i) => lists[Math.floor(i * step)]);
}

/** A value as wasm would take it, for comparing: exact, and the same in Go. */
function canonical(type, v) {
  if (type === 'i32') return String((typeof v === 'bigint' ? Number(BigInt.asIntN(32, v)) : Number(v)) | 0);
  if (type === 'i64') return String(BigInt.asIntN(64, typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)))));
  if (type === 'f32' || type === 'f64') {
    const n = type === 'f32' ? Math.fround(Number(v)) : Number(v);
    if (Number.isNaN(n)) return 'NaN';
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, n);
    return view.getBigUint64(0).toString(16);
  }
  if (typeof v === 'string') return [...Array(v.length)].map((_, i) => v.charCodeAt(i).toString(16)).join(',');
  return v == null ? 'nil' : `?${typeof v}`;
}

function goLiteral(type, v) {
  if (type === 'i32') return `int32(${v})`;
  if (type === 'i64') return `int64(${v})`;
  if (type === 'f64' || type === 'f32') {
    if (type === 'f32') {
      const view = new DataView(new ArrayBuffer(4));
      view.setFloat32(0, v);
      return `math.Float32frombits(0x${view.getUint32(0).toString(16)})`;
    }
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, v);
    return `math.Float64frombits(0x${view.getBigUint64(0).toString(16)})`;
  }
  return `any(fromUnits([]uint16{${[...Array(v.length)].map((_, i) => `0x${v.charCodeAt(i).toString(16)}`).join(', ')}}))`;
}

async function conformance() {
  const sites = [];
  const seen = new Set();
  for (const site of stdSites) {
    if (IMPURE.test(site.key) || site.key.startsWith('Wutu.') || seen.has(site.key)) continue;
    seen.add(site.key);
    sites.push(site);
  }
  // One host for them all: each binding an import, `es.__es_N`, as a module
  // that used every one would import them.
  const imports = sites.map((site, i) => ({ module: 'es', name: `__es_${i}`, kind: 0, params: site.params, results: site.results }));
  const spec = { es: { es: Object.fromEntries(sites.map((site, i) => [`__es_${i}`, site.body])) } };
  const files = goHostFiles(spec, imports, { pkg: 'conformance', stdSites, sidecars });
  const dir = path.join(tmp, 'conformance');
  await fs.mkdir(dir);
  for (const [file, text] of Object.entries(files)) await fs.writeFile(path.join(dir, file), text);
  await fs.writeFile(path.join(dir, 'go.mod'), goMod('conformance'));
  assert.ok(!files['host.go'].includes('UserImports'), 'every pure binding has Go');

  const cases = [];
  const calls = [];
  sites.forEach((site, i) => {
    const fn = new Function(`return (${site.body});`)();
    for (const args of argumentLists(site)) {
      const result = site.results[0];
      const expected = canonical(result, fn(...args));
      cases.push({ site, args, expected, result });
      calls.push(`\tshow(h.M_es___es_${i}(${args.map((v, k) => goLiteral(site.params[k], v)).join(', ')}))`);
    }
  });
  await fs.writeFile(path.join(dir, 'conformance_test.go'), `package conformance

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"testing"
)

func show(v any) {
	switch x := v.(type) {
	case int32:
		fmt.Println(">", x)
	case int64:
		fmt.Println(">", x)
	case float32:
		showFloat(float64(x))
	case float64:
		showFloat(x)
	case string:
		var parts []string
		for _, u := range units(x) {
			parts = append(parts, strconv.FormatUint(uint64(u), 16))
		}
		fmt.Println(">", strings.Join(parts, ","))
	case nil:
		fmt.Println("> nil")
	default:
		fmt.Printf("> ?%T\\n", v)
	}
}

func showFloat(f float64) {
	if f != f {
		fmt.Println("> NaN")
	} else {
		fmt.Println(">", strconv.FormatUint(math.Float64bits(f), 16))
	}
}

func TestConformance(t *testing.T) {
	h := &Imports{}
${calls.join('\n')}
}
`);
  const lines = go(['test', '-count=1', '-run', 'TestConformance', '-v', '.'], dir).split('\n')
    .filter(line => line.startsWith('> ')).map(line => line.slice(2));
  assert.equal(lines.length, cases.length, 'one result for each case');

  const failures = [];
  const known = new Map();
  const worst = new Map();
  cases.forEach((c, i) => {
    const got = lines[i];
    if (got === c.expected) return;
    if (ULPS[c.site.key] && /^[0-9a-f]+$/.test(got) && /^[0-9a-f]+$/.test(c.expected)) {
      const diff = BigInt(`0x${got}`) - BigInt(`0x${c.expected}`);
      const ulps = Number(diff < 0n ? -diff : diff);
      worst.set(c.site.key, Math.max(worst.get(c.site.key) ?? 0, ulps));
      if (ulps <= ULPS[c.site.key]) return;
    }
    const difference = DIFFERENT.find(([key, applies]) => key === c.site.key && applies(c.args));
    if (difference) { known.set(c.site.key, difference[2]); return; }
    failures.push(`${c.site.key}(${c.args.map(a => JSON.stringify(typeof a === 'bigint' ? `${a}n` : Object.is(a, -0) ? '-0' : a)).join(', ')}): Go ${got}, JavaScript ${c.expected}`);
  });
  assert.deepEqual(failures, [], `the standard library's Go differs from its JavaScript:\n${failures.join('\n')}`);
  // A listed difference no case shows is stale.
  for (const [key] of DIFFERENT) assert.ok(known.has(key), `${key}: a listed difference no case shows`);
  console.log(`go host: ${cases.length} cases agree across ${sites.length} bindings (${known.size} known differences)`);
  const off = [...worst].map(([key, ulps]) => `${key} ${ulps}`).join(', ');
  if (off) console.log(`go host: most ulps off V8: ${off}`);
}

// ---------------------------------------------------------------------------
// Programs

async function programs() {
  const cli = path.join(ROOT, 'cli', 'utu.mjs');
  const env = { ...process.env, UTU_GOSM: gosmDir };
  const utu = (args, cwd = ROOT) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env, timeout: 120000 });
  /** What `utu run` prints, and what the Go program gosm makes of `utu build` prints. */
  const both = async (name, jsFile, goFile = jsFile) => {
    const js = utu(['run', jsFile]);
    assert.equal(js.status, 0, `${name} on JavaScript\n${js.stderr}`);
    const out = path.join(tmp, name);
    const built = utu(['build', goFile, '-o', out, '--package', 'main']);
    assert.equal(built.status, 0, `${name}: utu build\n${built.stderr}`);
    const program = spawnSync('go', ['run', '.'], { cwd: out, encoding: 'utf8', timeout: 180000 });
    assert.equal(program.status, 0, `${name} as Go\n${program.stderr}`);
    assert.equal(program.stdout, js.stdout, `${name}: Go prints what JavaScript does`);
    return program.stdout;
  };

  // The examples that need nothing of JavaScript's.
  for (const example of ['closures', 'protocols', 'fannkuch']) await both(example, path.join(ROOT, 'examples', `${example}.utu`));

  // Every kind of host binding, as `@es` and as `@go`: the same program.
  const program = `using console from std:Console;
using StrMap from std:StrMap;

let sleep: fun(I32, F64) Promise[I32] = {{sleep}};
let fail: fun(Str) void = {{fail}};
let root: fun(F64) F64 = {{root}};
let count: fun(I32, cl(I32) Bool) I32 = {{count}};

fn total(s: Stream[I32]) I32 {
    let sum = 0;
    await for (s) |v| { sum += v; };
    sum;
}

export main() I32 {
    let t = "  Hello, World  ".trim();
    console.log(\`\${t.to_upper()}|\${t.index_of("o", 5)}|\${"7".pad_start(3, "0")}|\${"a😀b".len()}|\${"a😀b".index_of("b", 0)}\`);
    console.log(\`\${(0.1 + 0.2).to_str()}|\${(1.0 / 3.0).to_str()}|\${"  42 ".parse_i32(0)}|\${" 2.5e3".parse_f64().to_str()}|\${root(2.0).to_str()}\`);
    let counts = StrMap[I32].new();
    for ("the cat and the hat and the bat".split(" ")) |w| { counts.set(w, counts.get(w, 0) + 1); };
    console.log(\`the=\${counts.get("the", 0)} and=\${counts.get("and", 0)} dog=\${counts.get("dog", 0)}\`);
    let k = 3;
    let add = cl(x: I32) I32 { x + k; };
    console.log(\`closure \${add(4)} kept \${count(10, cl(i) Bool { i < k; })}\`);
    sleep(9, 1.0).then(cl(v) void { console.log(\`then \${v}\`); });
    let waited: I32 = await sleep(5, 3.0);
    console.log(\`awaited \${waited}\`);
    let streamed = total(Stream[I32].of([1, 2, 3, 4, 5, 6]).filter(cl(v) { v % 2 == 0; }).map(cl(v) { v * 10; }));
    let skipped = total(Stream[I32].generate(5, cl(i) { i * i; }).skip(1).take(3).chain(Stream[I32].of([100])));
    console.log(\`stream \${streamed} \${skipped}\`);
    let caught: I32 = try { fail("boom"); 1; } catch { 2; };
    console.log(\`caught \${caught}\`);
    waited + streamed + caught;
}
`;
  const bodies = {
    es: {
      sleep: '(v, ms) => new Promise(r => setTimeout(() => r(v), ms))',
      fail: '(m) => { throw new Error(m); }',
      root: 'Math.sqrt',
      count: '(n, keep) => { let k = 0; for (let i = 0; i < n; i++) if (keep(i)) k++; return k; }',
    },
    go: {
      sleep: 'func(v int32, ms float64) any { return Sleep(v, ms) }',
      fail: 'func(m string) { Throw(m) }',
      root: 'import "math"; math.Sqrt',
      count: 'func(n int32, keep func(int32) bool) (k int32) {\n    for i := int32(0); i < n; i++ {\n        if keep(i) {\n            k++\n        }\n    }\n    return\n}',
    },
  };
  for (const host of ['es', 'go']) {
    await fs.writeFile(path.join(tmp, `${host}.utu`), program.replace(/\{\{(\w+)\}\}/g, (_, key) => `@${host}/\\ ${bodies[host][key]} \\/`));
  }
  const printed = await both('bindings', path.join(tmp, 'es.utu'), path.join(tmp, 'go.utu'));
  assert.match(printed, /then 9\nawaited 5\nstream 120 114\ncaught 2\n127\n$/);

  // A program that needs JavaScript says which imports a Go program lacks.
  const refused = utu(['build', path.join(ROOT, 'examples', 'promises.utu'), '-o', path.join(tmp, 'refused'), '--package', 'main']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /package main needs Go for every import, and 2 have none: __es_0, __es_1/);
  // As a library, they are UserImports: the package builds, for its author to give them.
  const library = path.join(tmp, 'library');
  assert.equal(utu(['build', path.join(ROOT, 'examples', 'promises.utu'), '-o', library]).status, 0);
  assert.match(await fs.readFile(path.join(library, 'host.go'), 'utf8'), /type UserImports interface/);
  go(['vet', './...'], library);
}

try {
  // ── std/go itself
  const unformatted = spawnSync('gofmt', ['-l', '.'], { cwd: GO_STD, encoding: 'utf8' }).stdout.trim();
  assert.equal(unformatted, '', `not gofmt'd: ${unformatted}`);
  // std/go's go.mod finds gosm beside utu; this finds it where it is.
  const modfile = path.join(tmp, 'std.mod');
  await fs.writeFile(modfile, goMod('utu.local/std/go'));
  go(['vet', `-modfile=${modfile}`, './...'], GO_STD);
  go(['test', `-modfile=${modfile}`, '-race', '-count=1', './...'], GO_STD);

  // ── Every binding has Go; every key is a binding.
  const keys = new Set(stdSites.map(site => site.key));
  const browserOnly = site => site.key.startsWith('Wutu.');
  const lacking = [...new Set(stdSites.filter(site => !browserOnly(site) && !sidecars.functions.has(site.key)).map(site => site.key))];
  assert.deepEqual(lacking, [], 'standard-library bindings with no Go');
  const stray = [...sidecars.functions.keys()].filter(key => !keys.has(key));
  assert.deepEqual(stray, [], 'std/go keys that are no binding');

  await conformance();
  await programs();
  console.log(`go host: std/go tests, ${sidecars.functions.size} bindings, conformance, and programs pass`);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
