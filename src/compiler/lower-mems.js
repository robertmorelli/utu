// Memory arrays: `mem name: U8;` at the top level declares a resizable array
// of scalars that is its own wasm linear memory.
//
//   name[i]              read element i (narrow kinds widen to I32)
//   name[i] = v          write element i (narrow kinds keep the low bits)
//   name.len()           elements pushed or resized to
//   name.cap()           elements that fit without growing
//   name.push(v)         append, growing the memory when full
//   name.reserve(n)      grow so that n elements fit
//   name.resize(n)       reserve(n), then set len to n (contents are kept)
//   name.clear()         set len to 0
//   name.copy_in(bytes)  copy a JS ArrayBuffer, typed array, or string (UTF-8)
//                        in from element 0, and set len to what arrived
//   name.view(a, b)      a JS typed array over elements [a, b), no copy
//                        (needs `using JS from std:JS`, under any alias)
//
// A byte mem (U8, I8) also interns spans of itself in place:
//
//   name.intern(a, b)        a dense id (0, 1, …) for the bytes [a, b); the
//                            same bytes always get the same id
//   name.interned()          distinct spans so far
//   name.interned_start(id)  where that id's first span starts, and
//   name.interned_size(id)   its length
//   name.intern_reset()      forget every id
//
// The interner is an open-addressing table of FNV-1a hashes in hidden mems
// (`__name_slots` and so on). It stores spans, not copies: an id's bytes are
// read back from the mem, so they must stay where they were.
//
// A mem that uses copy_in or view is created by the host and imported, so the
// host functions can reach it. A view stops seeing the memory once it grows.
//
// An initializer fills a mem when the module is instantiated, from a data
// segment, with len set to its element count:
//
//   mem prec: U8 = [0, 1, 1, 2];               number literals
//   mem props: U16 = @embed/\ props.bin \/;    a file's bytes, next to the source
//   mem dfa: U8 = @comptime/\ build_dfa() \/;  runs during compilation; returns
//                                              an Array of the element's value type
//
// `const mem` rejects writes, growth, and copy_in. @comptime compiles a copy
// of the entry file without its exports, tests, and @comptime mems, with one
// export that evaluates the expression, then runs it and embeds the result.
//
// Reads and writes are not checked against len: an index past the memory's
// end traps, and anything below it is a plain load or store. That keeps the
// inner loop of a lexer or an IR pass a single unchecked memory access.
//
// Each declaration becomes top-level functions `__mem_name_get` and so on,
// one-statement wrappers around <ir-mem-*> intrinsics, and its uses become
// calls to them before elaboration. Codegen declares one memory per entry in root.dataset.mems.
import { declarationsFromSource, expressionFromSource } from './source-expansion.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { parseToIR } from './parse.js';
import { createSyntheticNode } from './ir-helpers.js';

// Storage kind → the type its elements read as and write from.
export const MEM_KINDS = Object.freeze({
  U8: 'I32', I8: 'I32', U16: 'I32', I16: 'I32',
  I32: 'I32', U32: 'U32', I64: 'I64', U64: 'U64', F32: 'F32', F64: 'F64',
});
const METHODS = new Set(['len', 'cap', 'push', 'reserve', 'resize', 'clear', 'copy_in', 'view',
  'intern', 'interned', 'interned_start', 'interned_size', 'intern_reset']);
const INTERN_METHODS = new Set(['intern', 'interned', 'interned_start', 'interned_size', 'intern_reset']);
const HOST_METHODS = new Set(['copy_in', 'view']);
const WRITES = new Set(['push', 'reserve', 'resize', 'clear', 'copy_in']);
const SHIFTS = { U8: 0, I8: 0, U16: 1, I16: 1, I32: 2, U32: 2, I64: 3, U64: 3, F32: 2, F64: 3 };
const INT_RANGES = {
  U8: [0, 255], I8: [-128, 127], U16: [0, 65535], I16: [-32768, 32767],
  I32: [-(2 ** 31), 2 ** 31 - 1], U32: [0, 2 ** 32 - 1],
  I64: [-(2n ** 63n), 2n ** 63n - 1n], U64: [0n, 2n ** 64n - 1n],
};
// The JS typed array a view of each storage kind is.
const VIEWS = {
  U8: 'Uint8Array', I8: 'Int8Array', U16: 'Uint16Array', I16: 'Int16Array', I32: 'Int32Array',
  U32: 'Uint32Array', I64: 'BigInt64Array', U64: 'BigUint64Array', F32: 'Float32Array', F64: 'Float64Array',
};
const SCOPES = 'ir-fn, ir-closure, ir-export-main, ir-test, ir-bench';

export async function lowerMems(doc, parser, createDocument, { readBinaryFile = null, resolvePath = null, evaluateComptime = null } = {}) {
  const root = doc.body.firstChild;
  if (!root) return;
  const decls = [...root.querySelectorAll(':scope > ir-mem')];
  if (!decls.length) return;

  // Integer enums are stored as their declared repr and read back as the enum.
  const intEnums = { ...JSON.parse(root.attr('data-int-enums') || '{}'), ...JSON.parse(root.attr('data-distinct-types') || '{}') };
  const mems = new Map();
  for (const decl of decls) {
    const name = decl.getAttribute('name');
    const declared = decl.getAttribute('kind');
    const kind = MEM_KINDS[declared] ? declared : intEnums[declared];
    if (!kind) {
      throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
        `mem ${name} stores ${declared}; a mem holds an integer enum, a distinct type, or one of ${Object.keys(MEM_KINDS).join(', ')}`, decl);
    }
    if (mems.has(name)) throw compilerError(DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION, `mem ${name} is declared twice`, decl);
    if (root.querySelector(`:scope > ir-fn[name="${name}"], :scope > ir-global[name="${name}"]`)) {
      throw compilerError(DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION, `mem ${name} has the same name as a top-level function or global`, decl);
    }
    mems.set(name, { name, kind, value: MEM_KINDS[declared] ?? declared, export: decl.getAttribute('export') === 'true',
      constant: decl.getAttribute('const') === 'true', prefix: `__mem_${name}_`, decl });
  }
  // Every @comptime mem of the program is evaluated by one extra compilation.
  const comptime = [...mems.values()].filter(mem => mem.decl.firstElementChild?.localName === 'ir-dsl'
    && mem.decl.firstElementChild.getAttribute('name') === 'comptime');
  const computed = new Map();
  if (comptime.length) {
    const site = comptime[0].decl.firstElementChild;
    if (!evaluateComptime) throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, '@comptime needs a compiler that can run code while compiling', site);
    const items = comptime.map(mem => ({
      expression: dslBody(mem.decl.firstElementChild),
      valueType: MEM_KINDS[mem.value] ? mem.value : MEM_KINDS[mem.kind] ?? 'I32',
      site: mem.decl.firstElementChild,
    }));
    const results = await evaluateComptime({ ...comptimeProgram(doc, parser), items });
    comptime.forEach((mem, k) => computed.set(mem, results[k]));
  }
  for (const mem of mems.values()) {
    const init = mem.decl.firstElementChild;
    if (!init) continue;
    const values = computed.get(mem) ?? await initialValues(mem, init, { doc, readBinaryFile, resolvePath });
    const bytes = encode(mem, values, init);
    mem.data = bytesToBase64(bytes);
    mem.count = bytes.length >> SHIFTS[mem.kind];
  }
  // Host methods decide how each memory is created, so find them first.
  const jsName = root.attr('data-js-alias') ?? null;
  let hidden = shadowedUses(root, new Set(mems.keys()));
  for (const access of root.querySelectorAll('ir-call > ir-field-access:first-child')) {
    const mem = mems.get(access.firstElementChild?.getAttribute('name'));
    const method = access.getAttribute('field');
    if (!mem || hidden.has(access)) continue;
    if (INTERN_METHODS.has(method)) {
      if (mem.kind !== 'U8' && mem.kind !== 'I8') {
        throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_METHOD, `mem ${mem.name}.${method}: only byte mems (U8, I8) intern spans`, access);
      }
      mem.interner = true;
      continue;
    }
    if (!HOST_METHODS.has(method)) continue;
    mem.host = true;
    if (method === 'view' && !jsName) {
      throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
        `${mem.name}.view() returns a JS.${VIEWS[mem.kind]}; add \`using JS from std:JS;\``, access);
    }
  }
  // An interning mem gets four hidden I32 mems and the functions that use them.
  for (const mem of [...mems.values()].filter(mem => mem.interner)) {
    for (const part of ['slots', 'starts', 'sizes', 'hashes']) {
      const name = `__${mem.name}_${part}`;
      mems.set(name, { name, kind: 'I32', value: 'I32', prefix: `__mem_${name}_`, decl: mem.decl, hidden: true });
    }
  }
  for (const mem of mems.values()) {
    if (mem.hidden) continue;
    const source = wrappers(mem, jsName) + [...mems.values()]
      .filter(hidden => hidden.hidden && hidden.decl === mem.decl).map(hidden => wrappers(hidden, jsName)).join('')
      + (mem.interner ? interner(mem) : '');
    const decls = declarationsFromSource(parser, source, mem.decl, { createDocument });
    // Foreign type names were resolved before this pass; name the view's
    // typed array the way they were.
    const view = decls.find(decl => decl.getAttribute('name') === `${mem.prefix}view`);
    if (view) view.querySelector(':scope > ir-type-qualified, :scope > ir-type-ref:not(ir-param-list *)')
      ?.replaceWith(foreignTypeRef(doc, VIEWS[mem.kind], view));
    mem.decl.replaceWith(...decls);
  }
  root.setAttribute('data-mems', JSON.stringify([...mems.values()].map(({ name, kind, export: exported, host, data, count }) =>
    ({ name, kind, export: exported, host: Boolean(host), ...(data ? { data, count } : {}) }))));

  // The wrappers declared parameters of their own.
  hidden = shadowedUses(root, new Set(mems.keys()));
  const memOf = ident => {
    if (ident?.localName !== 'ir-ident') return null;
    const mem = mems.get(ident.getAttribute('name'));
    return mem && !hidden.has(ident) ? mem : null;
  };
  const replace = (node, code, splices) => node.replaceWith(expressionFromSource(parser, code, node, splices, { createDocument }));

  // Innermost first: operands are rewritten before the node that splices them
  // in. An assignment target is left for its assignment.
  for (const node of [...root.querySelectorAll('ir-assign, ir-index, ir-call')].reverse()) {
    const splices = new Map();
    const splice = value => { const key = `__mem_splice${splices.size}`; splices.set(key, value); return key; };

    if (node.localName === 'ir-assign' && node.firstElementChild?.localName === 'ir-index') {
      const [target, value] = node.children;
      const mem = memOf(target.firstElementChild);
      if (!mem) continue;
      const index = indexOf(target, mem);
      if (mem.constant) throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name} is const; it cannot be written`, node);
      const op = node.getAttribute('op') ?? '=';
      replace(node, op === '='
        ? `${mem.prefix}set(${splice(index)}, ${splice(value)})`
        : `{ let __mem_at: I32 = ${splice(index)}; ${mem.prefix}set(__mem_at, ${mem.prefix}get(__mem_at) ${op.slice(0, -1)} ${splice(value)}); }`, splices);
    } else if (node.localName === 'ir-index') {
      const mem = memOf(node.firstElementChild);
      if (!mem) continue;
      const parent = node.parentElement;
      if (parent?.localName === 'ir-assign' && parent.firstElementChild === node) continue;
      replace(node, `${mem.prefix}get(${splice(indexOf(node, mem))})`, splices);
    } else if (node.localName === 'ir-call') {
      const callee = node.firstElementChild;
      if (callee?.localName !== 'ir-field-access') continue;
      const mem = memOf(callee.firstElementChild);
      if (!mem) continue;
      const method = callee.getAttribute('field');
      if (!METHODS.has(method)) {
        throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_METHOD,
          `mem ${mem.name} has no method '${method}'; it has ${[...METHODS].join(', ')}`, callee);
      }
      if (mem.constant && WRITES.has(method)) {
        throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name} is const; it has no ${method}`, callee);
      }
      const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
      replace(node, `${mem.prefix}${method}(${args.map(splice).join(', ')})`, splices);
    }
  }

  for (const slice of root.querySelectorAll('ir-slice')) {
    const mem = memOf(slice.firstElementChild);
    if (mem) throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name} takes one index: ${mem.name}[i]`, slice);
  }
  // Rewriting cloned the operands it spliced in, so mark their uses again.
  hidden = shadowedUses(root, new Set(mems.keys()));
  for (const ident of root.querySelectorAll('ir-ident')) {
    const mem = memOf(ident);
    if (mem && ident.closest(SCOPES)) {
      throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH,
        `mem ${mem.name} is not a value; use ${mem.name}[i], ${mem.name}[i] = v, or ${mem.name}.len()`, ident);
    }
  }
}

/** The initializer's values: numbers, BigInts for 64-bit kinds, or raw bytes for @embed. */
async function initialValues(mem, init, { doc, readBinaryFile, resolvePath }) {
  const fail = message => compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name}: ${message}`, init);
  if (init.localName === 'ir-array-lit') {
    return [...init.children].map(element => {
      let negate = false, lit = element;
      if (lit.localName === 'ir-unary' && lit.getAttribute('op') === '-') { negate = true; lit = lit.firstElementChild; }
      if (lit?.localName !== 'ir-lit' || !['int', 'float'].includes(lit.getAttribute('kind'))) {
        throw fail('an initializer list holds number literals; compute other values with @comptime');
      }
      const text = lit.getAttribute('value').replace(/_/g, '');
      if (/^(I|U)64$/.test(mem.kind) && lit.getAttribute('kind') === 'int') return negate ? -BigInt(text) : BigInt(text);
      const value = Number(text);
      return negate ? -value : value;
    });
  }
  const dsl = init.localName === 'ir-dsl' ? init.getAttribute('name') : null;
  const body = dslBody(init);
  if (dsl === 'embed') {
    if (!readBinaryFile || !resolvePath) throw fail('@embed needs a host that can read files');
    const file = resolvePath(init.attr('data-origin-file') ?? doc.body.firstChild?.attr?.('data-file') ?? '', body);
    let bytes;
    try {
      bytes = await readBinaryFile(file);
    } catch (error) {
      throw fail(`@embed cannot read ${body}: ${error.code ?? error.message}`);
    }
    if (bytes.byteLength % (1 << SHIFTS[mem.kind])) throw fail(`${body} is ${bytes.byteLength} bytes, not a whole number of ${mem.kind} elements`);
    return { bytes: new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength) };
  }
  throw fail('an initializer is a list of number literals, @embed/\\ file \\/, or @comptime/\\ expression \\/');
}

function dslBody(dsl) {
  return (dsl.getAttribute('body') ?? '').replace(/^\/\\/, '').replace(/\\\/$/, '').trim();
}

/** The entry file without its exports, tests, and @comptime initializers; the caller adds the exports that evaluate them. */
function comptimeProgram(doc, parser) {
  const file = doc.body.firstChild.attr('data-file') ?? '';
  const text = doc.__utuSourceTexts?.get(file) ?? '';
  // Read the declarations as written: by now exports have been lowered.
  const source = parseToIR(parser, text, file).body.firstChild;
  const nodes = [...(source?.children ?? [])];
  // Whole declarations, and the `= @comptime/\ … \/` of other comptime mems,
  // which stay declared (empty) because code may use them.
  const cut = [
    ...nodes.filter(node => ['ir-export-main', 'ir-export-lib', 'ir-test', 'ir-bench'].includes(node.localName))
      .map(node => [Number(node.attr('data-start')), Number(node.attr('data-end'))]),
    ...nodes.filter(node => node.localName === 'ir-mem' && node.firstElementChild?.getAttribute('name') === 'comptime')
      .map(node => [text.lastIndexOf('=', Number(node.firstElementChild.attr('data-start'))), Number(node.firstElementChild.attr('data-end'))]),
  ].filter(([start, end]) => Number.isFinite(start) && start >= 0 && Number.isFinite(end)).sort((a, b) => b[0] - a[0]);
  // Cut text becomes its newlines, so line numbers still match the entry file.
  let program = text;
  const blank = removed => removed.replace(/[^\n]/g, '');
  for (const [start, end] of cut) {
    // A cut export, test, or bench may be followed by its `;`.
    const stop = text[start] !== '=' ? end + (/^\s*;/.exec(text.slice(end))?.[0].length ?? 0) : end;
    program = program.slice(0, start) + blank(program.slice(start, stop)) + program.slice(stop);
  }
  return { file, source: program };
}

function encode(mem, values, init) {
  if (values.bytes) return values.bytes;
  const fail = message => compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name}: ${message}`, init);
  const size = 1 << SHIFTS[mem.kind];
  const view = new DataView(new ArrayBuffer(values.length * size));
  values.forEach((value, i) => {
    const range = INT_RANGES[mem.kind];
    if (range) {
      const wide = typeof range[0] === 'bigint';
      const integral = typeof value === 'bigint' || Number.isInteger(value);
      if (!integral) throw fail(`element ${i} (${value}) is not an integer`);
      const v = wide ? BigInt(value) : Number(value);
      if (v < range[0] || v > range[1]) throw fail(`element ${i} (${value}) does not fit in ${mem.kind}`);
      switch (mem.kind) {
        case 'U8': case 'I8': view.setUint8(i, Number(v) & 0xff); break;
        case 'U16': case 'I16': view.setUint16(i * 2, Number(v) & 0xffff, true); break;
        case 'U32': case 'I32': view.setUint32(i * 4, Number(v) >>> 0, true); break;
        default: view.setBigUint64(i * 8, BigInt.asUintN(64, v), true);
      }
    } else if (mem.kind === 'F32') view.setFloat32(i * 4, Number(value), true);
    else view.setFloat64(i * 8, Number(value), true);
  });
  return new Uint8Array(view.buffer);
}

function bytesToBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The in-place interner of a byte mem, over its hidden mems. */
function interner({ name, prefix }) {
  const [slots, starts, sizes, hashes] = ['slots', 'starts', 'sizes', 'hashes'].map(part => `__${name}_${part}`);
  return `
fn ${prefix}intern_reset() void {
    ${slots}.resize(1024);
    for (0 ..< 1024) |slot| { ${slots}[slot] = 0; };
    ${starts}.clear();
    ${sizes}.clear();
    ${hashes}.clear();
}
fn ${prefix}interned() I32 { ${starts}.len(); }
fn ${prefix}interned_start(id: I32) I32 { ${starts}[id]; }
fn ${prefix}interned_size(id: I32) I32 { ${sizes}[id]; }
fn ${prefix}intern_same(a: I32, b: I32, size: I32) Bool {
    for (0 ..< size) |k| {
        if ${name}[a + k] != ${name}[b + k] { return false; };
    };
    true;
}
fn ${prefix}intern_rehash() void {
    let size = ${slots}.len() * 2;
    ${slots}.resize(size);
    for (0 ..< size) |slot| { ${slots}[slot] = 0; };
    let mask = size - 1;
    for (0 ..< ${starts}.len()) |id| {
        let slot = ${hashes}[id] & mask;
        while (${slots}[slot] != 0) { slot = (slot + 1) & mask; };
        ${slots}[slot] = id + 1;
    };
}
fn ${prefix}intern(start: I32, stop: I32) I32 {
    if ${slots}.len() == 0 { ${prefix}intern_reset(); };
    let hash = -2128831035;
    for (start ..< stop) |k| { hash = (hash ^ (${name}[k] & 255)) * 16777619; };
    let size = stop - start;
    let mask = ${slots}.len() - 1;
    let slot = hash & mask;
    while (${slots}[slot] != 0) {
        let id = ${slots}[slot] - 1;
        if ${hashes}[id] == hash and ${sizes}[id] == size and ${prefix}intern_same(${starts}[id], start, size) { return id; };
        slot = (slot + 1) & mask;
    };
    let id = ${starts}.len();
    ${starts}.push(start);
    ${sizes}.push(size);
    ${hashes}.push(hash);
    ${slots}[slot] = id + 1;
    if (id + 1) * 2 > ${slots}.len() { ${prefix}intern_rehash(); };
    id;
}
`;
}

function foreignTypeRef(doc, name, site) {
  const abi = doc.__utuForeign;
  const index = abi?.paths.get('std:JS');
  if (index === undefined) throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `mem views need std:JS; add \`using JS from std:JS;\``, site);
  const ref = createSyntheticNode(site.ownerDocument, 'ir-type-ref', site, 'lower-mems', 'view-type');
  ref.setAttribute('name', abi.type(index, abi.written(index, abi.schemas[index].names[name])));
  return ref;
}

function indexOf(node, mem) {
  if (node.children.length !== 2) {
    throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `mem ${mem.name} takes one index: ${mem.name}[i]`, node);
  }
  return node.children[1];
}

/** A parameter, local, or capture of the same name hides the mem. */
// The identifiers a parameter, let, or capture of the same name hides from a
// mem: each declaration marks the uses of its name in its scope, once.
function shadowedUses(root, memNames) {
  const hidden = new Set();
  const mark = (scope, name) => {
    for (const ident of scope.querySelectorAll(`ir-ident[name="${name}"]`)) hidden.add(ident);
    for (const access of scope.querySelectorAll('ir-field-access')) {
      if (access.firstElementChild?.getAttribute('name') === name) hidden.add(access);
    }
  };
  for (const param of root.querySelectorAll('ir-param[name], ir-self-param[name]')) {
    const name = param.getAttribute('name');
    const owner = param.closest(SCOPES);
    if (memNames.has(name) && owner) mark(owner, name);
  }
  for (const binding of root.querySelectorAll('ir-let[name]')) {
    const name = binding.getAttribute('name');
    if (memNames.has(name) && binding.parentElement?.localName === 'ir-block') mark(binding.parentElement, name);
  }
  for (const capture of root.querySelectorAll('ir-capture[names]')) {
    for (const name of capture.getAttribute('names').split(',')) {
      if (memNames.has(name) && capture.parentElement) mark(capture.parentElement, name);
    }
  }
  return hidden;
}

function wrappers({ name, kind, value, prefix, host }, jsName) {
  const op = (tag, ...args) => `@ir/\\ <ir-mem-${tag} mem="${name}" kind="${kind}">${args.map(arg => `<ir-ident name="${arg}"/>`).join('')}</ir-mem-${tag}> \\/;`;
  return `
fn ${prefix}get(i: I32) ${value} { ${op('get', 'i')} }
fn ${prefix}set(i: I32, v: ${value}) void { ${op('set', 'i', 'v')} }
fn ${prefix}len() I32 { ${op('len')} }
fn ${prefix}cap() I32 { ${op('cap')} }
fn ${prefix}push(v: ${value}) void { ${op('push', 'v')} }
fn ${prefix}reserve(n: I32) void { ${op('reserve', 'n')} }
fn ${prefix}resize(n: I32) void { ${op('resize', 'n')} }
fn ${prefix}clear() void { ${op('clear')} }
${host ? `fn ${prefix}copy_in(bytes: Externref) void { ${op('copy-in', 'bytes')} }` : ''}
${host && jsName ? `fn ${prefix}view(start: I32, end_: I32) ${jsName}.${VIEWS[kind]} { ${op('view', 'start', 'end_')} }` : ''}
`;
}
