// src/selfhost/grep.js — semantic grep: utu code by its syntax, names, and types.
//
// A pattern is utu with holes: `$x` stands for any one node (the same
// subtree each time it recurs), `$...xs` for any run of siblings (arguments,
// statements), `$_` for any node, unbound. It is parsed by the compiler's
// own parser, so it matches what the code is, not how it is spaced:
//
//   $v.push($x)                 every push, on anything
//   if $c { $...body; }         every if without an else
//   $a + $a                     a value added to itself
//
// Matches are filtered by the types the compiler checked (`where`:
// `{ x: 'Array[I32]' }`, `*` for any run of characters), and names are
// found by what they resolve to, not by their spelling (`references`).
// Every query runs over a build of each entry file the host gives; the
// matches in files several entries import are reported once.

import { compile } from './compiler.js';
import { programIndex } from './query.js';

const HOLE = '__utu_hole_';
const MANY = '__utu_many_';
const COMMENT = 8;  // lex.utu's Tok.Comment

/**
 * A pattern as the compiler parses it: a list of nodes (one, or a run of
 * statements), each { kind, own (the texts of its tokens outside its
 * children), text, children, hole, many }.
 */
export function parsePattern(utu, pattern) {
  const holes = pattern
    .replace(/\$\.\.\.([A-Za-z_]\w*)/g, (_, name) => `${MANY}${name}`)
    .replace(/\$([A-Za-z_]\w*)/g, (_, name) => `${HOLE}${name}`)
    .trim().replace(/;$/, '');
  // An expression or statements, in a function; else declarations.
  for (const [prefix, suffix] of [['fn __utu_pattern() void { ', '; }'], ['', '']]) {
    const tree = parseSource(utu, `${prefix}${holes}${suffix}`);
    if (!tree) continue;
    if (!prefix) return tree.children.length ? tree.children : null;
    const block = tree.children[0]?.children.at(-1);
    if (block?.children.length) return block.children;
  }
  return null;
}

/** A source parsed alone (the compiler's lexer and parser), as a tree of plain objects; null when it does not parse. */
function parseSource(utu, text) {
  const bytes = new TextEncoder().encode(text);
  new Uint8Array(utu.src.buffer).set(bytes, utu.source(bytes.length));
  utu.tokens(bytes.length);
  let root;
  try { root = utu.nodes(bytes.length); } catch { return null; }
  if (root < 0) return null;
  const mem = name => new Int32Array(utu[name].buffer);
  const kinds = new Uint8Array(utu.node_kind.buffer);
  const [first, last, child, next, tokStart, tokEnd] = ['node_first', 'node_last', 'node_child', 'node_next', 'tok_start', 'tok_end'].map(mem);
  const tokKind = new Uint8Array(utu.tok_kind.buffer);
  const decoder = new TextDecoder();
  const src = new Uint8Array(utu.src.buffer);
  const tokenText = t => decoder.decode(src.subarray(tokStart[t], tokEnd[t]));
  const build = n => {
    const children = [];
    for (let c = child[n]; c >= 0; c = next[c]) if (utu.node_kind_name(kinds[c]) !== 'comment') children.push(build(c));
    const covered = new Set();
    for (let c = child[n]; c >= 0; c = next[c]) for (let t = first[c]; t < last[c]; t++) covered.add(t);
    const own = [];
    for (let t = first[n]; t < last[n]; t++) if (!covered.has(t) && tokKind[t] !== COMMENT) own.push(tokenText(t));
    const text = own.join(' ');
    const node = { kind: kinds[n], own, text, children };
    if (!children.length && text.startsWith(HOLE)) node.hole = text.slice(HOLE.length);
    if (!children.length && text.startsWith(MANY)) node.many = text.slice(MANY.length);
    // Runs alone (`f($...xs)`'s arguments) may be empty, and the code then has no node there (`f()`).
    if (own.every(t => t === ',' || t === ';') && children.length && children.every(c => c.many !== undefined)) node.optional = true;
    // `$x` as a statement is the expression in it.
    return node;
  };
  return build(root);
}

/**
 * Every match of `pattern` (from parsePattern) in the program the compiler
 * holds: { at (file, start, end), bindings ({ name: place }) }.
 * `where` maps a hole's name to the type its node must have.
 */
export function matchProgram(utu, files, pattern, { where = {}, seen = null } = {}) {
  const index = programIndex(utu, files);
  const kinds = new Uint8Array(utu.node_kind.buffer);
  const mem = name => new Int32Array(utu[name].buffer);
  const [first, last, child, next, tokStart, tokEnd] = ['node_first', 'node_last', 'node_child', 'node_next', 'tok_start', 'tok_end'].map(mem);
  const tokKind = new Uint8Array(utu.tok_kind.buffer);
  const src = new Uint8Array(utu.src.buffer);
  const decoder = new TextDecoder();
  const tokenText = t => decoder.decode(src.subarray(tokStart[t], tokEnd[t]));
  const own = new Set(files.filter(f => f.role !== 2 && !f.key.startsWith('std:')).map(f => f.key));
  const childrenOf = n => {
    const out = [];
    for (let c = child[n]; c >= 0; c = next[c]) if (utu.node_kind_name(kinds[c]) !== 'comment') out.push(c);
    return out;
  };
  const ownTokens = n => {
    const covered = new Set();
    for (let c = child[n]; c >= 0; c = next[c]) for (let t = first[c]; t < last[c]; t++) covered.add(t);
    const out = [];
    for (let t = first[n]; t < last[n]; t++) if (!covered.has(t) && tokKind[t] !== COMMENT) out.push(tokenText(t));
    return out;
  };
  // A node's code, its tokens joined: how a recurring hole compares.
  const code = n => {
    const out = [];
    for (let t = first[n]; t < last[n]; t++) if (tokKind[t] !== COMMENT) out.push(tokenText(t));
    return out.join(' ');
  };
  const typeMatches = (n, want) => {
    const got = utu.node_type(n);
    // A node this build did not type (a test build's main) has no type to meet; the build that typed it decides.
    if (!got) return false;
    const re = new RegExp(`^${want.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return re.test(got) || re.test(got.replace(/\s+/g, ''));
  };

  // A statement, which a typed hole never is: a `let`, or an `if`, loop,
  // `match`, or `alt` in a block that gives no value.
  const STATEMENTS = new Set(['if_expr', 'for_expr', 'while_expr', 'match_expr', 'loop_match_expr', 'alt_expr', 'defer_expr', 'errdefer_expr']);
  let parent = null;
  const isStatement = n => {
    const kind = utu.node_kind_name(kinds[n]);
    if (kind === 'bind_expr') return true;
    if (!STATEMENTS.has(kind) || utu.node_type(n) !== 'void') return false;
    if (!parent) {
      parent = new Int32Array(utu.node_count()).fill(-1);
      for (let m = 0; m < parent.length; m++) for (let c = child[m]; c >= 0; c = next[c]) parent[c] = m;
    }
    return parent[n] >= 0 && utu.node_kind_name(kinds[parent[n]]) === 'block';
  };
  // Whether node n meets hole `name`'s `--where` (none: it does); noted in `seen`.
  const meets = (name, n) => {
    if (!where[name]) return true;
    const ok = !isStatement(n) && typeMatches(n, where[name]);
    if (seen) {
      // What each constrained hole met: whether any had the type, and the types.
      if (!seen.has(name)) seen.set(name, { matched: false, types: new Set() });
      const s = seen.get(name);
      if (ok) s.matched = true; else if (!isStatement(n)) s.types.add(utu.node_type(n));
    }
    return ok;
  };

  const matchNode = (p, n, env) => {
    if (p.hole !== undefined) {
      if (!meets(p.hole, n)) return false;
      if (p.hole === '_') return true;
      if (env.has(p.hole)) return code(env.get(p.hole)) === code(n);
      env.set(p.hole, n);
      return true;
    }
    if (p.kind !== kinds[n]) return false;
    const many = p.children.some(c => c.many !== undefined);
    const tokens = ownTokens(n);
    // With a run hole, separators (`,` `;`) come and go with the run.
    const strip = list => (many ? list.filter(t => t !== ',' && t !== ';') : list);
    if (strip(tokens).join(' ') !== strip(p.own).join(' ')) return false;
    return matchList(p.children, childrenOf(n), env);
  };
  // Pattern children against node children, a run hole taking any number.
  const matchList = (ps, ns, env, i = 0, j = 0) => {
    if (i === ps.length) return j === ns.length;
    const p = ps[i];
    if (p.many !== undefined) {
      // A run named twice is the same code both times.
      const bound = env.get(`...${p.many}`);
      for (let k = j; k <= ns.length; k++) {
        // A typed run: every element has the type.
        if (k > j && !meets(p.many, ns[k - 1])) break;
        if (bound && (bound.length !== k - j || bound.some((b, i) => code(b) !== code(ns[j + i])))) continue;
        const saved = new Map(env);
        if (p.many !== '_') env.set(`...${p.many}`, ns.slice(j, k));
        if (matchList(ps, ns, env, i + 1, k)) return true;
        env.clear();
        for (const [key, value] of saved) env.set(key, value);
      }
      return false;
    }
    const saved = new Map(env);
    if (p.optional && p.children.every(c => !env.get(`...${c.many}`)?.length)) {
      // Each run empty, the node absent.
      for (const c of p.children) if (c.many !== '_') env.set(`...${c.many}`, []);
      if (matchList(ps, ns, env, i + 1, j)) return true;
      env.clear();
      for (const [key, value] of saved) env.set(key, value);
    }
    if (j >= ns.length) return false;
    if (matchNode(p, ns[j], env) && matchList(ps, ns, env, i + 1, j + 1)) return true;
    env.clear();
    for (const [key, value] of saved) env.set(key, value);
    return false;
  };

  const matches = [];
  const count = utu.node_count();
  const lone = pattern.length === 1 ? pattern[0] : null;
  // A lone hole matches every expression the compiler typed (filtered by `where`).
  const any = lone?.hole !== undefined;
  for (let n = 0; n < count; n++) {
    const at = index.at(n);
    if (!at || !own.has(at.file)) continue;
    const env = new Map();
    if (lone) {
      if (any ? !utu.node_type(n) || isStatement(n) : kinds[n] !== lone.kind) continue;
      if (!matchNode(lone, n, env)) continue;
      matches.push({ at, bindings: bindings(env, index) });
    } else {
      // A run of statements: consecutive children of a block.
      const kids = childrenOf(n);
      for (let k = 0; k + pattern.length <= kids.length; k++) {
        const local = new Map();
        if (matchList(pattern, kids.slice(k, k + pattern.length), local)) {
          const from = index.at(kids[k]);
          const to = index.at(kids[k + pattern.length - 1]);
          matches.push({ at: { file: from.file, start: from.start, end: to.end }, bindings: bindings(local, index) });
        }
      }
    }
  }
  // An expression wrapped in another of the same span (a statement) is one match.
  const spans = new Set();
  return matches.filter(({ at }) => {
    const key = `${at.file}\0${at.start}\0${at.end}`;
    return !spans.has(key) && spans.add(key);
  });
}

function bindings(env, index) {
  const out = {};
  for (const [name, value] of env) {
    if (name.startsWith('...')) {
      const places = value.map(n => index.at(n)).filter(Boolean);
      out[name] = places.length ? { file: places[0].file, start: places[0].start, end: places.at(-1).end } : null;
    } else {
      out[name] = index.at(value);
    }
  }
  return out;
}

/** The declarations named `name` in the program's own files, each with its references. */
export function findReferences(utu, files, name) {
  const index = programIndex(utu, files);
  const own = new Set(files.filter(f => f.role !== 2 && !f.key.startsWith('std:')).map(f => f.key));
  const out = [];
  const all = index.declarations();
  for (const { decl, kind } of all) {
    const definition = index.definition(decl);
    if (!definition || !own.has(definition.file) || index.text(definition) !== name) continue;
    let references = index.references(decl, { includeDeclaration: false });
    if (kind === 'Alias') {
      // An import's alias (`using m |Point| …`): each place its file spells
      // it so, whatever that resolves to through it (the module, its type).
      references = index.names(definition.file)
        .filter(n => n.at.start !== definition.start && index.text(n.at) === name && (n.decl === decl || index.text(index.definition(n.decl) ?? n.at) !== name))
        .map(n => n.at);
    } else if (kind === 'Module') {
      // A module's own type (`struct &`), where it is named: by an alias.
      for (const own of all.filter(d => d.owner === decl && index.text(index.definition(d.decl) ?? definition) === '&')) {
        references = references.concat(index.references(own.decl, { includeDeclaration: false }).filter(at => index.text(at) !== '&'));
      }
    }
    out.push({ kind, definition, references });
  }
  return out;
}

/**
 * Run a query over each entry file: a pattern (with `where`), or the
 * references of a name. Returns { matches: [{ at, bindings? , kind? }], error }.
 */
export async function grep(utu, entries, hostFor, { pattern = null, where = {}, references = null } = {}) {
  const parsed = pattern ? parsePattern(utu, pattern) : null;
  if (pattern && !parsed) return { matches: [], error: `the pattern is not utu: ${pattern}` };
  const holes = new Set([...(pattern ?? '').matchAll(/\$(?:\.\.\.)?([A-Za-z_]\w*)/g)].map(m => m[1]));
  const stray = Object.keys(where).find(name => !holes.has(name));
  if (stray !== undefined) return { matches: [], error: `--where names $${stray}, which the pattern has not` };
  const skipped = new Set();
  const seen = new Set();
  const matches = [];
  const add = match => {
    const key = `${match.at.file}\0${match.at.start}\0${match.at.end}`;
    if (!seen.has(key)) { seen.add(key); matches.push(match); }
  };
  const texts = new Map();
  const met = new Map();
  for (const entry of entries) {
    // Both builds: the exports' functions are checked in one, the tests in the other.
    for (const target of ['normal', 'test']) {
      const built = await compile(utu, entry, { ...hostFor(entry), target, optimize: 'none' });
      for (const file of built.files) texts.set(file.key, file.text);
      // A file that does not parse has no tree to search.
      for (const d of built.diagnostics) if (d.kind === 'parse-error' && d.file != null) skipped.add(d.file);
      if (parsed) for (const match of matchProgram(utu, built.files, parsed, { where, seen: met })) add(match);
      if (!references) continue;
      for (const { kind, definition, references: refs } of findReferences(utu, built.files, references)) {
        add({ at: definition, kind, declaration: true });
        for (const at of refs) add({ at, kind });
      }
    }
  }
  matches.sort((a, b) => a.at.file.localeCompare(b.at.file) || a.at.start - b.at.start);
  // A constraint no candidate met: its type is likely misspelled.
  const unmatched = Object.entries(where).filter(([hole]) => met.has(hole) && !met.get(hole).matched)
    .map(([hole, type]) => ({ hole, type, seen: [...met.get(hole).types].filter(Boolean).sort() }));
  return { matches, texts, skipped: [...skipped], unmatched };
}
