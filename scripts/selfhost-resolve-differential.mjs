// The self-hosted compiler's name resolution (selfhost/resolve.utu) against
// stage 0's go-to-definition: for every identifier and type name in the
// program's own files, the declaration it resolves to must be the one stage 0
// names, by file and span.
//
//   node scripts/selfhost-resolve-differential.mjs [--only=substring] [--show=N]
//   node scripts/selfhost-resolve-differential.mjs --record
//
// Stage 0's answers are in baselines/definitions.json.gz: its definition
// query at every node of every program's own files, as
// scripts/behavior-fingerprints.mjs records them (`--record` copies them
// from .tmp/behavior/recorded, which `behavior-fingerprints.mjs --record`
// writes). Names stage 0 resolves only through types (`x.field`,
// `x.method()`) are not compared until type checking exists: a name
// resolution leaves unresolved is counted as "left", not as a difference.
//
// Where stage 0 answers for a node its lowerings made rather than for the
// name (an iterator capture is a `let` spanning the pipeline; a module name
// in a path answers for the path), the comparison says so below.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadProgram, loadSelfhost } from './selfhost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUMPS = path.join(ROOT, '.tmp', 'behavior', 'recorded');
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = flag('only');
const show = Number(flag('show') ?? 20);

const utu = await loadSelfhost();
const KIND = name => { for (let k = 0; ; k++) if (utu.node_kind_name(k) === name) return k; };
const IDENT = KIND('identifier');
const TYPE_IDENT = KIND('type_ident');
const FN_NAME = KIND('fn_name');
const PROMOTED_CALL = KIND('promoted_module_call_expr');
const ITERATOR = KIND('iterator_expr');
const DSL = KIND('dsl_expr');
const FOR = KIND('for_expr');
const PAREN = KIND('paren_expr');
const FOR_SOURCE = KIND('for_source');
const FUNC_TYPE_REF = KIND('func_type');
const categories = new Map();
const COMMENT = KIND('comment');
const MODULE_NAME = KIND('module_name');

const BASELINE = path.join(ROOT, 'baselines', 'definitions.json.gz');
if (process.argv.includes('--record')) {
  const programs = {};
  for (const dump of fs.readdirSync(DUMPS).filter(name => name.endsWith('_analysis.json.gz')).sort()) {
    const recorded = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DUMPS, dump))));
    if (!recorded.queries) continue;
    const files = new Set(recorded.queries.map(query => query.file));
    const entry = [...files].find(file => dump.startsWith(file.replace(/[^a-zA-Z0-9._-]+/g, '_') + '_analysis'));
    if (!entry) continue;
    programs[entry] = Object.fromEntries(recorded.queries.filter(query => query.definition !== undefined).map(query => [
      `${query.file}:${query.offset}`,
      query.definition && [query.definition.file, query.definition.start, query.definition.end, query.definition.localName],
    ]));
  }
  fs.writeFileSync(BASELINE, zlib.gzipSync(JSON.stringify(programs), { level: 9 }));
  console.log(`recorded the definitions of ${Object.keys(programs).length} programs`);
  process.exit(0);
}

const totals = { same: 0, differ: 0, left: 0, extra: 0, paths: 0, declarations: 0, diagnostics: 0 };
const shown = [];
const diagnostics = [];
let programs = 0;
const started = performance.now();
const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(BASELINE)));
for (const entry of Object.keys(baseline).sort()) {
  if (only && !entry.includes(only)) continue;
  programs++;
  const definitions = new Map(Object.entries(baseline[entry]).map(([key, value]) =>
    [key, value && { file: value[0], start: value[1], end: value[2], localName: value[3] }]));
  await compare(entry, definitions);
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
for (const line of shown) console.log(line);
for (const line of diagnostics) console.log(`DIAGNOSTIC ${line}`);
for (const [category, n] of [...categories].sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${category}`);
console.log(`${programs} programs: ${totals.same} names resolve as stage 0's, ${totals.differ} differ, `
  + `${totals.left} left to types, ${totals.paths} module names in paths, ${totals.declarations} declaring names stage 0 answers otherwise, `
  + `${totals.extra} stage 0 does not name; `
  + `${totals.diagnostics} diagnostics, in ${seconds} s`);
process.exit(totals.differ ? 1 : 0);

async function compare(entry, definitions) {
  const files = await loadProgram(utu, path.join(ROOT, entry));
  const count = utu.node_count();
  totals.diagnostics += files.diagnostics;
  const view = (mem, Type) => new Type(mem.buffer);
  const kind = view(utu.node_kind, Uint8Array);
  const first = view(utu.node_first, Int32Array);
  const last = view(utu.node_last, Int32Array);
  const starts = view(utu.tok_start, Int32Array);
  const ends = view(utu.tok_end, Int32Array);
  const nodeDecl = view(utu.node_decl, Int32Array);
  const declNode = view(utu.decl_node, Int32Array);
  const declOwner = view(utu.decl_owner, Int32Array);
  // Whether every source of a `for` counts a range (`a ..< b`) rather than iterating an array.
  const rangesOnly = forNode => {
    for (let s = child[child[forNode]]; s >= 0; s = next[s]) {
      if (kind[s] !== FOR_SOURCE) continue;
      let parts = 0;
      for (let c = child[s]; c >= 0; c = next[c]) if (kind[c] !== COMMENT) parts++;
      if (parts < 2) return false;
    }
    return true;
  };
  const offsets = files.map(file => utf16Offsets(file.bytes));
  const fileOf = byte => files.findLastIndex(file => file.offset <= byte);
  const place = node => {
    const byte = starts[first[node]];
    const f = fileOf(byte);
    const file = files[f];
    const name = file.key.startsWith('std:') ? file.key : path.relative(ROOT, file.key);
    return { file: name, start: offsets[f][byte - file.offset], end: offsets[f][ends[last[node] - 1] - file.offset] };
  };
  for (let i = 0; i < files.diagnostics; i++) {
    const at = place(utu.diagnostic_node(i));
    if (diagnostics.length < show) diagnostics.push(`${utu.diagnostic_kind(i)} ${at.file}:${at.start} "${files[fileOf(starts[first[utu.diagnostic_node(i)]])].text.slice(at.start, at.end)}"`);
  }
  const child = view(utu.node_child, Int32Array);
  const next = view(utu.node_next, Int32Array);
  const parent = new Int32Array(count).fill(-1);
  for (let n = 0; n < count; n++) for (let c = child[n]; c >= 0; c = next[c]) parent[c] = n;
  const lastChild = node => { let last = -1; for (let c = child[node]; c >= 0; c = next[c]) if (kind[c] !== COMMENT) last = c; return last; };
  // The node a declaring name declares (its parent's declaration), for telling a declaration's own name from a use.
  const declarationOf = node => { for (let p = parent[node]; p >= 0; p = parent[p]) if (kind[p] !== MODULE_NAME && kind[p] !== FN_NAME) return p; return -1; };
  // The name after a module name in a promoted call: `f` in `M[A].f(…)`.
  const nextName = moduleName => { let c = next[next[moduleName]]; while (c >= 0 && kind[c] === COMMENT) c = next[c]; return c; };
  for (let n = 0; n < count; n++) {
    if (kind[n] !== IDENT && kind[n] !== TYPE_IDENT) continue;
    // Stage 0 answers for a method's whole name (`T.m`) at the receiver's offset.
    if (kind[parent[n]] === FN_NAME && next[n] >= 0) continue;
    const at = place(n);
    if (at.file.startsWith('std:')) continue;
    const key = `${at.file}:${at.start}`;
    if (!definitions.has(key)) continue;
    const expected = definitions.get(key);
    let decl = nodeDecl[n];
    const declKind = decl >= 0 ? utu.decl_kind_name(decl) : null;
    // Host declarations (std:JS, …) are not read yet.
    if (declKind === 'Foreign') { totals.left++; continue; }
    // Stage 0 hoists modules away: a module name in a path answers for the
    // path, which its last name is compared for.
    if ((declKind === 'Module' || declKind === 'Alias') && declNode[decl] !== declarationOf(n)) {
      if (kind[parent[parent[n]]] !== PROMOTED_CALL) { totals.paths++; continue; }
      // `M[A].f(…)` is stage 0's call of f.
      decl = nodeDecl[nextName(parent[n])];
    }
    let got = decl >= 0 ? place(declNode[decl]) : null;
    // A declaration's own name names it, whatever stage 0 answers there.
    if (got && declNode[decl] === declarationOf(n)) {
      if (expected && (got.file !== expected.file || got.start !== expected.start || got.end !== expected.end)) { totals.declarations++; continue; }
    }
    // Stage 0 lowers an iterator pipeline's captures to lets spanning the
    // pipeline, a `for` over an array to lets spanning the loop, and an `@es`
    // function to an extern function spanning its body.
    if (got && declKind === 'Capture') {
      let owner = parent[declNode[decl]];
      if (kind[owner] === ITERATOR) {
        for (;;) {
          const up = kind[parent[owner]] === PAREN ? parent[owner] : owner;
          if (kind[parent[up]] !== ITERATOR || child[parent[up]] !== up) break;
          owner = parent[up];
        }
        got = place(owner);
      } else if (kind[owner] === FOR && !rangesOnly(owner)) got = place(owner);
    }
    if (got && declKind === 'Global' && kind[lastChild(declNode[decl])] === DSL && kind[next[child[declNode[decl]]]] === FUNC_TYPE_REF) {
      got = place(lastChild(declNode[decl]));
    }
    // Stage 0 names a generic module's type by the module or by its promoted type.
    if (got && expected?.localName === 'ir-module' && declOwner[decl] >= 0) {
      const module = place(declNode[declOwner[decl]]);
      if (module.file === expected.file && module.start === expected.start && module.end === expected.end) got = module;
    }
    const text = files[fileOf(starts[first[n]])].text.slice(at.start, at.end);
    if (!expected) {
      if (got) totals.extra++;
      continue;
    }
    if (!got) {
      totals.left++;
      continue;
    }
    if (got.file === expected.file && got.start === expected.start && got.end === expected.end) {
      totals.same++;
      continue;
    }
    totals.differ++;
    const category = `${expected.localName} → ${utu.decl_kind_name(decl)}`;
    categories.set(category, (categories.get(category) ?? 0) + 1);
    if (categories.get(category) <= 2) {
      shown.push(`DIFFERS ${key} "${text}": stage 0 ${expected.localName} ${expected.file}:${expected.start}-${expected.end}, `
        + `resolved ${got.file}:${got.start}-${got.end} "${snippet(files, got)}"`);
    }
  }
}

function snippet(files, at) {
  const file = files.find(entry => (entry.key.startsWith('std:') ? entry.key : path.relative(ROOT, entry.key)) === at.file);
  return file?.text.slice(at.start, Math.min(at.end, at.start + 40)).replace(/\s+/g, ' ');
}

function utf16Offsets(bytes) {
  const out = new Int32Array(bytes.length + 1);
  let unit = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[i] = unit;
    const b = bytes[i];
    if (b < 0x80 || b >= 0xc0) unit += b >= 0xf0 ? 2 : 1;
  }
  out[bytes.length] = unit;
  return out;
}
