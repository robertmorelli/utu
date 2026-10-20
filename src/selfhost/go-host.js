// src/selfhost/go-host.js — the Go that ships beside a built module.
//
// A module imports what its spec says the host gives (see loader.js for the
// JavaScript host). For a Go host, the module becomes Go (gosm transpiles
// it), and its imports are methods of a Go type, Host, which this writes as
// host.go: one per import, adapting the import's wasm signature to the Go
// that gives it.
//
//   `@go` bindings          their bodies, package-level values
//   the standard library's  std/go/*.go, by the binding each gives
//   closures, promises,     std/go/runtime.go and memory.go
//   mems, the exception tag
//   anything else           UserImports, an interface the program's author
//                           implements in Go (an `@es` body, a TypeScript
//                           declaration's operation)
//
// The files of std/go are copied in beside host.go, in the program's
// package: they are the whole runtime, and Go's linker keeps what is used.
// Nothing here is JavaScript, and nothing is translated from it: a binding's
// JavaScript body only identifies which standard-library binding an import
// is (its text, its file, its signature), so that binding's Go can give it.

const GO_TYPES = { i32: 'int32', i64: 'int64', f32: 'float32', f64: 'float64', v128: '[16]byte', ref: 'any' };

/**
 * Go's name for an import's method, as gosm names it in its Host interface:
 * `es.__es_3` → `M_es___es_3`; a byte Go does not allow in a name is `_` and
 * two hex digits (`a.b` → `a_2e_b`).
 */
export function goImportName(module, field) {
  const safe = text => [...new TextEncoder().encode(text)]
    .map(b => /[A-Za-z0-9_]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `_${b.toString(16).padStart(2, '0')}`).join('');
  return `M_${safe(module)}_${safe(field)}`;
}

/**
 * The files of a Go host for a built module, by name: host.go and the
 * runtime's. `imports` is wasmImportSignatures(wasm).
 *
 *   pkg        the Go package (gosm's output's)
 *   source     the program's file, for the header
 *   stdSites   stdHostSites(std sources)
 *   sidecars   readSidecars(std/go's files)
 *   host       parseHostInterface(`gosm -emit-host`): each method's Go
 *              signature, which host.go's then are exactly; without it,
 *              the wasm types (a reference as any)
 *   main       for package main, the Go type `export main` returns ('' for
 *              none): a main() that calls it, runs the loop, and prints
 *              what it returns, as `utu run` does
 */
export function goHostFiles(spec, imports, { pkg, source = '', stdSites, sidecars, host = null, main = null }) {
  const es = spec.es?.es ?? {};
  const go = spec.go?.go ?? {};
  const mems = new Map((spec.mems ?? []).map(mem => [mem.name, mem]));
  const methods = [];
  const user = [];
  const values = [];
  const hoisted = new Set();
  const missing = [];
  // Names that come out the same take _2, _3, … in import order.
  const named = new Map();
  const nameOf = (module, name) => {
    const base = goImportName(module, name);
    const n = (named.get(base) ?? 0) + 1;
    named.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  };

  for (const entry of imports) {
    const { module, name, kind } = entry;
    // String builtins and string constants are gosm's.
    if (module === "'" || module === 'wasm:js-string') continue;
    const method = nameOf(module, name);
    if (host && !host.has(method)) throw new Error(`gosm's Host has no ${method} (${module}.${name})`);
    if (kind === 2) {
      const mem = mems.get(name.replace(/^mem_/, ''));
      if (module !== 'utu' || !mem) { missing.push(`${module}.${name} (a memory)`); continue; }
      const bytes = mem.data ? Math.ceil(mem.data.length * 3 / 4) : 0;
      values.push(`var ${memVar(mem.name)} = NewMemory(${JSON.stringify(mem.kind)}, ${bytes})`);
      methods.push(`// ${method} is the mem \`${mem.name}\`.\nfunc (h *Imports) ${method}() *rt.Memory { return ${memVar(mem.name)}.Memory }`);
      continue;
    }
    if (kind === 4) {
      if (module === 'utu' && name === 'js_tag') {
        methods.push(`// ${method} is the tag of host exceptions.\nfunc (h *Imports) ${method}() *rt.Tag { return JSTag }`);
      } else missing.push(`${module}.${name} (a tag)`);
      continue;
    }
    if (kind !== 0) { missing.push(`${module}.${name} (a ${['function', 'table', 'memory', 'global'][kind]})`); continue; }

    const sig = host?.get(method);
    if (sig && sig.results.length > 1) throw new Error(`${method} returns ${sig.results.length} values; utu's imports return one`);
    const types = sig?.params ?? entry.params.map(type => GO_TYPES[type]);
    const params = types.map((type, i) => `p${i} ${type}`).join(', ');
    const args = types.map((_, i) => `p${i}`);
    const result = sig ? sig.results[0] ?? '' : entry.results.length ? GO_TYPES[entry.results[0]] : '';
    const head = `func (h *Imports) ${method}(${params})${result ? ` ${result}` : ''}`;
    const give = expr => result ? `return Out[${result}](${expr})` : expr;

    if (module === 'go' && Object.hasOwn(go, name)) {
      const { imports: decls, expr } = splitGoBody(go[name]);
      for (const decl of decls) hoisted.add(decl);
      const value = `utu${name.replace(/^__go_/, 'Go')}`;
      values.push(`var ${value} = ${expr}`);
      methods.push(`${head} {\n\t${give(callGo(value, args, result))}\n}`);
      continue;
    }
    if (module === 'es' && Object.hasOwn(es, name)) {
      const fn = sidecarFor(es[name], entry, stdSites, sidecars.functions);
      if (fn) {
        methods.push(`${head} {\n\t${give(callGo(fn, args, result))}\n}`);
        continue;
      }
      user.push({ method, params, result, note: `${name}: ${firstLine(es[name])}` });
      methods.push(`${head} {\n\t${result ? 'return ' : ''}h.User.${method}(${args.join(', ')})\n}`);
      continue;
    }
    if (module === 'utu') {
      const body = runtimeImport(name, args, result, mems);
      if (body) { methods.push(`${head} {\n\t${body}\n}`); continue; }
    }
    missing.push(`${module}.${name}`);
  }
  if (missing.length) throw new Error(`a Go host has nothing for: ${missing.join(', ')}`);
  if (main != null && user.length) {
    throw new Error(`package main needs Go for every import, and ${user.length} ${user.length === 1 ? 'has' : 'have'} none: ${user.map(u => u.note.split(':')[0]).join(', ')}`);
  }

  const body = [];
  if (values.length) body.push(values.join('\n') + '\n');
  body.push(methods.join('\n\n') + '\n');
  if (main != null) body.push(mainSource(main));
  const text = body.join('\n');
  const uses = name => new RegExp(`\\b${name}\\.`).test(text);
  for (const [name, path] of [['rt', 'rt "gosm/rt"'], ['fmt', '"fmt"'], ['os', '"os"']]) if (uses(name)) hoisted.add(path);

  const out = [];
  out.push(`// Code generated by \`utu build\`${source ? ` from ${source}` : ''}. DO NOT EDIT.\n`);
  out.push(`package ${pkg}\n`);
  if (hoisted.size) out.push(`import (\n${[...hoisted].map(spec => `\t${spec}`).join('\n')}\n)\n`);
  out.push(`// Imports gives what the module imports: New(&Imports{}) instantiates it.
// After calling its exports, call Run for the promise reactions and timers
// they leave queued.
type Imports struct${user.length ? ' {\n\t// User gives the imports utu has no Go for.\n\tUser UserImports\n}' : '{}'}
`);
  if (user.length) {
    out.push(`// UserImports are the module's imports with no Go in utu: implement them.
type UserImports interface {
${user.map(u => `\t// ${u.note}\n\t${u.method}(${u.params})${u.result ? ` ${u.result}` : ''}`).join('\n')}
}
`);
  }
  out.push(text);

  const files = { 'host.go': out.join('\n') };
  for (const [file, text] of Object.entries(sidecars.files)) {
    files[`utu_${file}`] = text.replace(/^package utu$/m, `package ${pkg}`);
  }
  return files;
}

/** main(): instantiate, call `export main`, run the loop, print its result as `utu run` does. */
function mainSource(result) {
  const lines = [
    'func main() {',
    '\tinst, err := New(&Imports{})',
    '\tif err != nil {',
    '\t\tfmt.Fprintln(os.Stderr, err)',
    '\t\tos.Exit(1)',
    '\t}',
    ...result ? [`\tvar result ${result}`] : [],
    `\tif err := rt.Catch(func() { ${result ? 'result = inst.Main()' : 'inst.Main()'}; Run() }); err != nil {`,
    '\t\tfmt.Fprintln(os.Stderr, err)',
    '\t\tos.Exit(1)',
    '\t}',
    ...result ? ['\tfmt.Println(Show(result))'] : [],
    '}',
  ];
  return lines.join('\n') + '\n';
}

/**
 * gosm's Host interface (\`gosm -emit-host\`): each method's Go parameter and
 * result types, by name.
 *
 * @returns {Map<string, { params: string[], results: string[] }>}
 */
export function parseHostInterface(text) {
  const body = text.match(/type Host interface \{([\s\S]*?)\n\}/)?.[1];
  if (body == null) throw new Error('gosm -emit-host: no Host interface');
  const methods = new Map();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(M_\w+)\((.*)\)\s*(.*)$/);
    if (!m) continue;
    const params = splitTop(m[2]).map(param => param.replace(/^\w+\s+/, ''));
    const result = m[3].trim();
    const results = !result ? [] : result.startsWith('(') ? splitTop(result.slice(1, -1)) : [result];
    methods.set(m[1], { params, results });
  }
  return methods;
}

function memVar(name) { return `utuMem_${name.replace(/[^A-Za-z0-9_]/g, '_')}`; }

function firstLine(text) {
  const line = text.split('\n')[0].trim();
  return line.length > 100 ? `${line.slice(0, 97)}…` : line;
}

/** A Go function value called with the module's arguments. */
function callGo(fn, args, result) {
  if (args.length === 0) return result ? `Value(${fn})` : `Do0(${fn})`;
  if (args.length > 6) throw new Error(`a Go host takes at most 6 arguments to an import, not ${args.length}`);
  return `${result ? 'Call' : 'Do'}${args.length}(${fn}, ${args.join(', ')})`;
}

/** The utu runtime's imports: closures, promises, awaits, mems. */
function runtimeImport(name, args, result) {
  if (name === 'closure_new') return `return NewClosure(${args.join(', ')})`;
  if (/^closure_call_\d+$/.test(name)) {
    const call = `Invoke(${args.join(', ')})`;
    return result ? `return Out[${result}](${call})` : call;
  }
  if (name === 'promise_then') return `promiseThen(${args.join(', ')})`;
  if (name === 'promise_catch') return `promiseCatch(${args.join(', ')})`;
  if (/^await_/.test(name)) return `return Out[${result}](Await(${args[0]}))`;
  let m = name.match(/^mem_copy_in_(.+)$/);
  if (m) return `return ${memVar(m[1])}.CopyIn(${args[0]})`;
  m = name.match(/^mem_view_(.+)$/);
  if (m) return `return ${memVar(m[1])}.View(${args[0]}, ${args[1]})`;
  return null;
}

// A body may open with `import` declarations, hoisted to the file's imports:
//
//     @go/\ import "strings"; strings.ToUpper \/
const GO_IMPORT = /^\s*import\s+((?:[A-Za-z_.][\w]*\s+)?"[^"]+")\s*;/;

/** A Go body's import specs and its expression. */
export function splitGoBody(body) {
  const imports = [];
  let rest = body;
  for (let m = rest.match(GO_IMPORT); m; m = rest.match(GO_IMPORT)) {
    imports.push(m[1].replace(/\s+/g, ' '));
    rest = rest.slice(m[0].length);
  }
  return { imports, expr: rest.trim() };
}

// ---------------------------------------------------------------------------
// The standard library's bindings

const SELF = {
  Str: 'ref', F64: 'f64', F32: 'f32', I32: 'i32', U32: 'i32', Bool: 'i32',
  I64: 'i64', U64: 'i64', Stream: 'ref', Promise: 'ref', StrMap: 'ref', NumberField: 'ref',
};

/**
 * Each standard-library `@es` binding: its key (`Str.trim`, the std file
 * and the function it is in), its body as the compiler records it, and its wasm
 * signature (`*` for a module parameter, which differs by instance).
 *
 * @param {Record<string, string>} sources  std file name → text
 */
export function stdHostSites(sources) {
  const sites = [];
  for (const [file, text] of Object.entries(sources)) {
    // Named as programs import it (`std:Console`), whatever its `mod` is called.
    if (!/^\s*mod\s/m.test(text)) continue;
    const module = file.replace(/\.utu$/, '');
    const binding = /let\s+\w+\s*:\s*([^=]+?)\s*=\s*@es\/\\([\s\S]*?)\\\/\s*;/g;
    for (let m = binding.exec(text); m; m = binding.exec(text)) {
      const before = text.slice(0, m.index);
      const fn = [...before.matchAll(/\bfn\s+(?:&\.)?([A-Za-z_]\w*)/g)].at(-1)?.[1];
      const sig = utuSignature(m[1].trim(), module);
      if (!fn || !sig) continue;
      sites.push({ key: `${module}.${fn}`, file, body: m[2].replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''), ...sig });
    }
  }
  return sites;
}

/** A binding's type as a wasm signature: `fun(&, I32) &` in Str → (ref, i32) → ref. */
function utuSignature(type, module) {
  const wasm = t => {
    t = t.trim();
    if (t === 'void') return null;
    if (t === '&') return SELF[module] ?? 'ref';
    if (/^(I32|U32|Bool|I8|U8|I16|U16)$/.test(t)) return 'i32';
    if (/^(I64|U64)$/.test(t)) return 'i64';
    if (t === 'F32') return 'f32';
    if (t === 'F64') return 'f64';
    if (/^T\d+$/.test(t)) return '*';
    return 'ref';
  };
  const fun = type.match(/^fun\s*\(([\s\S]*)\)\s*(.+)$/);
  if (!fun) return { params: [], results: [wasm(type)].filter(Boolean) };
  const params = splitTop(fun[1]).map(wasm);
  return { params, results: [wasm(fun[2])].filter(Boolean) };
}

function splitTop(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([<'.includes(c)) depth++;
    else if (')]>'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  if (text.trim()) parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function signatureMatches(site, entry) {
  const same = (a, b) => a.length === b.length && a.every((t, i) => t === '*' || t === b[i]);
  return same(site.params, entry.params) && same(site.results, entry.results);
}

/** The Go function that gives an `@es` import: a standard-library binding's, or null. */
function sidecarFor(body, entry, sites, functions) {
  for (const site of sites) {
    if (site.body === body && signatureMatches(site, entry) && functions.has(site.key)) return functions.get(site.key);
  }
  return null;
}

/**
 * The standard library's Go: `// utu:Key` marks the function that gives
 * binding Key (one function may give several).
 *
 * @param {Record<string, string>} files  std/go file name → text (not tests)
 * @returns {{ functions: Map<string, string>, files: Record<string, string> }}
 */
export function readSidecars(files) {
  const functions = new Map();
  for (const text of Object.values(files)) {
    const marked = /((?:^\/\/ utu:[\w.]+\n)+)func\s+([A-Za-z_]\w*)/gm;
    for (let m = marked.exec(text); m; m = marked.exec(text)) {
      for (const key of m[1].match(/[\w.]+(?=\n)/g)) {
        if (functions.has(key)) throw new Error(`std/go: ${key} is given twice`);
        functions.set(key, m[2]);
      }
    }
  }
  return { functions, files };
}

// ---------------------------------------------------------------------------
// Signatures

/**
 * A module's imports, with each function's signature: `{ module, name, kind,
 * params, results }`, the types `i32`, `i64`, `f32`, `f64`, `v128`, or
 * `ref` (any reference). Not a validator: it reads the type and import
 * sections and skips the rest.
 */
export function wasmImportSignatures(bytes) {
  let offset = 0;
  const fail = () => { throw new Error('wasm: malformed or unsupported binary'); };
  const byte = () => { if (offset >= bytes.length) fail(); return bytes[offset++]; };
  const leb = () => {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const b = byte();
      value += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return value;
    }
    fail();
  };
  const name = () => {
    const size = leb();
    const text = new TextDecoder().decode(bytes.subarray(offset, offset + size));
    offset += size;
    return text;
  };
  const ABSTRACT = new Set([0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72, 0x73, 0x74]);
  const heapType = () => { if (ABSTRACT.has(bytes[offset])) offset++; else leb(); };
  const NUMERIC = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128' };
  const valType = () => {
    const b = byte();
    if (NUMERIC[b]) return NUMERIC[b];
    if (b === 0x63 || b === 0x64) { heapType(); return 'ref'; }
    if (ABSTRACT.has(b)) return 'ref';
    if (b === 0x78 || b === 0x77) return 'packed';
    fail();
  };
  const limits = () => { const flags = leb(); leb(); if (flags & 1) leb(); };

  for (const expected of [0, 97, 115, 109, 1, 0, 0, 0]) if (byte() !== expected) fail();
  const types = [];
  const imports = [];
  while (offset < bytes.length) {
    const section = byte(), size = leb(), end = offset + size;
    if (section === 1) {
      const subtype = () => {
        let form = byte();
        if (form === 0x50 || form === 0x4f) {
          for (let n = leb(); n > 0; n--) leb();
          form = byte();
        }
        if (form === 0x60) {
          const params = Array.from({ length: leb() }, valType);
          const results = Array.from({ length: leb() }, valType);
          types.push({ params, results });
        } else if (form === 0x5f) {
          for (let n = leb(); n > 0; n--) { valType(); byte(); }
          types.push(null);
        } else if (form === 0x5e) {
          valType(); byte();
          types.push(null);
        } else fail();
      };
      for (let n = leb(); n > 0; n--) {
        if (bytes[offset] === 0x4e) {
          offset++;
          for (let k = leb(); k > 0; k--) subtype();
        } else subtype();
      }
    } else if (section === 2) {
      for (let n = leb(); n > 0; n--) {
        const module = name(), field = name(), kind = byte();
        const entry = { module, name: field, kind };
        if (kind === 0) Object.assign(entry, types[leb()] ?? fail());
        else if (kind === 1) { valType(); limits(); }
        else if (kind === 2) limits();
        else if (kind === 3) { valType(); byte(); }
        else if (kind === 4) { byte(); leb(); }
        else fail();
        imports.push(entry);
      }
    }
    offset = end;
  }
  return imports;
}
