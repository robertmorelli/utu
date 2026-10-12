// type-table.js — every type the compiler meets, interned once.
//
// A TypeId is a small integer naming one type spelling (`I32`, `?Point`,
// `cl(I32) Bool`, `.{I32, F64}`). Its structure — the type inside an
// optional, a callable's parameters and result, a tuple's parts — is parsed
// once, when the spelling is first seen, and kept as TypeIds, so the
// structural questions passes ask (`unwrapNullable`, `callableParts`,
// `tupleParts`) are table reads instead of string scans.
//
// Spellings are the key: two spellings of the same type are two ids, exactly
// as two strings were. That keeps every type the compiler prints byte for
// byte what it printed before. See docs/fact-store.md (the type table).
//
// Dependency-free, like type-strings.js, which every layer imports.

export const TYPE_KIND = Object.freeze({ NAMED: 0, OPTIONAL: 1, FUN: 2, CLOSURE: 3, TUPLE: 4 });

const CALLABLE_PREFIX = /^(fun|cl)\(/;

export class TypeTable {
  constructor() {
    this.ids = new Map();
    this.names = [];
    this.kinds = [];
    // OPTIONAL: the inner type. FUN/CLOSURE: the result type.
    this.inner = [];
    // FUN/CLOSURE: parameter types. TUPLE: part types.
    this.lists = [];
    // Frozen string views, as type-strings.js returns them.
    this.callables = [];
    this.tuples = [];
  }

  /** The id of a type spelling, interning it (and the types inside it) on first sight. */
  id(name) {
    let id = this.ids.get(name);
    if (id !== undefined) return id;
    id = this.names.length;
    this.ids.set(name, id);
    this.names.push(name);
    this.kinds.push(TYPE_KIND.NAMED);
    this.inner.push(-1);
    this.lists.push(null);
    this.callables.push(null);
    this.tuples.push(null);
    this.parse(id, name);
    return id;
  }

  name(id) {
    return this.names[id];
  }

  parse(id, name) {
    if (name.startsWith('?')) {
      this.kinds[id] = TYPE_KIND.OPTIONAL;
      this.inner[id] = this.id(name.slice(1));
      return;
    }
    const callable = splitCallable(name);
    if (callable) {
      this.kinds[id] = callable.kind === 'fun' ? TYPE_KIND.FUN : TYPE_KIND.CLOSURE;
      this.lists[id] = callable.params.map(param => this.id(param));
      this.inner[id] = this.id(callable.ret);
      this.callables[id] = Object.freeze({ kind: callable.kind, params: Object.freeze(callable.params), ret: callable.ret });
      return;
    }
    if (name.startsWith('.{') && name.endsWith('}')) {
      const parts = splitTypeList(name.slice(2, -1));
      this.kinds[id] = TYPE_KIND.TUPLE;
      this.lists[id] = parts.map(part => this.id(part));
      this.tuples[id] = Object.freeze(parts);
    }
  }
}

/**
 * The table every pass shares. Type spellings are few (hundreds per program)
 * and the same across compilations, so it lives for the process; it starts
 * over if it ever grows past a bound, which only costs re-parsing.
 */
let shared = new TypeTable();
const LIMIT = 200_000;

export function typeTable() {
  if (shared.names.length > LIMIT) shared = new TypeTable();
  return shared;
}

/** `fun(I32) Bool` → `{ kind, params, ret }` as strings, else null (the parse behind the table). */
export function splitCallable(typeStr) {
  const match = CALLABLE_PREFIX.exec(typeStr);
  if (!match) return null;
  const open = match[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < typeStr.length; i++) {
    if (typeStr[i] === '(') depth++;
    else if (typeStr[i] === ')' && --depth === 0) { close = i; break; }
  }
  if (close === -1) return null;
  return {
    kind: match[1],
    params: splitTypeList(typeStr.slice(open + 1, close)),
    ret: typeStr.slice(close + 1).trim() || 'void',
  };
}

/** Split a comma-separated type list, ignoring commas nested in `()`, `[]`, or `{}`. */
export function splitTypeList(text) {
  if (!text) return [];
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}
