// wasm/optimize.js — local cleanup for -Oz and -O3 builds.
//
// Lowerings leave copies and temporaries a hand-written program would not
// have: a generator's parameters bound to the call's arguments, the value of
// each `yield` held in a local for the consumer. Three rewrites remove them,
// in each function:
//
//   copies       a local set once, to a parameter that is never assigned, is
//                that parameter: its reads read the parameter
//   temporaries  a local set once to a pure value and read once in the next
//                statement, outside any loop and before anything assigns
//                what the value reads, is that value: it moves to the read
//   unused       a local never read is not stored (its value is kept when it
//                has effects), and is no longer declared
//
// So a consumed generator compiles to what the equivalent loop compiles to.
// Every local codegen creates is set before it is read (a `let` before its
// scope, a temporary before its use), which is what makes the first two
// rewrites sound.

import { expandType, none, unreachable } from './types.js';

export function optimizeModule(module) {
  for (const fn of module.functions) if (fn.body) optimizeFunction(fn);
}

// Numeric instructions that can trap, so are not pure.
const TRAPPING = new Set([
  'i32.div_s', 'i32.div_u', 'i32.rem_s', 'i32.rem_u', 'i64.div_s', 'i64.div_u', 'i64.rem_s', 'i64.rem_u',
  'i32.trunc_s.f32', 'i32.trunc_u.f32', 'i32.trunc_s.f64', 'i32.trunc_u.f64',
  'i64.trunc_s.f32', 'i64.trunc_u.f32', 'i64.trunc_s.f64', 'i64.trunc_u.f64',
]);

/** Computes a value without effects or traps, reading at most locals. */
function isPure(e) {
  switch (e.op) {
    case 'const': case 'local.get': case 'ref.null': case 'ref.func': case 'nop':
      return true;
    case 'numeric': case 'ref.is_null': case 'ref.eq': case 'ref.i31': case 'i31.get': case 'select':
      return !TRAPPING.has(e.name) && e.kids.every(isPure);
    default:
      return false;
  }
}

function optimizeFunction(fn) {
  const params = expandType(fn.params).length;
  for (let changed = true; changed;) {
    const uses = collectUses(fn, params);
    changed = propagateCopies(fn, uses, params) || sinkTemporaries(fn, uses, params);
  }
  removeUnusedLocals(fn, params);
}

/** Every read and write of each local, with where it is (parent, index). */
function collectUses(fn, params) {
  const gets = new Map();
  const sets = new Map();
  const add = (map, index, site) => {
    const list = map.get(index);
    if (list) list.push(site); else map.set(index, [site]);
  };
  walk(fn, (e, parent, index) => {
    if (e.op === 'local.get') add(gets, e.index, { e, parent, index });
    else if (e.op === 'local.set' || e.op === 'local.tee') add(sets, e.index, { e, parent, index });
  });
  return { gets, sets, params };
}

function propagateCopies(fn, { gets, sets }, params) {
  let changed = false;
  for (const [local, writes] of sets) {
    if (local < params || writes.length !== 1) continue;
    const [{ e: write }] = writes;
    const source = write.kids[0];
    if (write.op !== 'local.set' || source.op !== 'local.get' || source.index >= params || sets.has(source.index)) continue;
    if (expandType(source.type).length !== 1) continue;
    for (const { e: read } of gets.get(local) ?? []) {
      read.index = source.index;
      read.type = source.type;
      changed = true;
    }
  }
  return changed;
}

function sinkTemporaries(fn, { gets, sets }, params) {
  // Each temporary moves at most once per pass; `gets` follows the moves.
  let changed = false;
  walk(fn, block => {
    if (block.op !== 'block') return;
    const kids = block.kids;
    for (let i = 0; i + 1 < kids.length; i++) {
      const write = kids[i];
      if (write.op !== 'local.set' || write.index < params) continue;
      const local = write.index;
      if (sets.get(local)?.length !== 1 || gets.get(local)?.length !== 1) continue;
      const value = write.kids[0];
      if (!isPure(value) || value.type === unreachable || expandType(value.type).length !== 1) continue;
      const read = gets.get(local)[0];
      if (!canSinkInto(kids[i + 1], read.e, localsReadBy(value))) continue;
      if (!read.parent) continue;
      read.parent.kids[read.index] = value;
      kids[i] = nopLike(write);
      // A value that is itself a read now sits where the sunk read was.
      if (value.op === 'local.get') {
        const site = gets.get(value.index)?.find(entry => entry.e === value);
        if (site) Object.assign(site, { parent: read.parent, index: read.index });
      }
      gets.delete(local);
      sets.delete(local);
      changed = true;
    }
  });
  return changed;
}

function localsReadBy(e) {
  const read = new Set();
  const stack = [e];
  while (stack.length) {
    const at = stack.pop();
    if (at.op === 'local.get') read.add(at.index);
    stack.push(...at.kids);
  }
  return read;
}

/**
 * Whether `target` (a read) is reached in `root` before anything assigns a
 * local in `reads`, and not inside a loop (where the value would be
 * recomputed each iteration).
 */
function canSinkInto(root, target, reads) {
  let found = false;
  let blocked = false;
  const visit = (e, inLoop) => {
    if (found || blocked) return;
    if (e === target) { found = true; blocked = inLoop; return; }
    const loop = inLoop || e.op === 'loop';
    for (const kid of e.kids) {
      visit(kid, loop);
      if (found || blocked) return;
    }
    if ((e.op === 'local.set' || e.op === 'local.tee') && reads.has(e.index)) blocked = true;
  };
  visit(root, false);
  return found && !blocked;
}

function removeUnusedLocals(fn, params) {
  const read = new Set();
  walk(fn, e => { if (e.op === 'local.get') read.add(e.index); });
  walk(fn, (e, parent, index) => {
    if ((e.op !== 'local.set' && e.op !== 'local.tee') || e.index < params || read.has(e.index)) return;
    const value = e.kids[0];
    const replacement = e.op === 'local.tee' || !isPure(value)
      ? (e.op === 'local.set' && value.type !== unreachable && value.type !== none ? dropOf(e, value) : value)
      : nopLike(e);
    if (parent) parent.kids[index] = replacement;
    else fn.body = replacement;
  });
  // Renumber the locals still read.
  const renumber = new Map();
  const vars = [];
  fn.vars.forEach((type, i) => {
    if (!read.has(params + i)) return;
    renumber.set(params + i, params + vars.length);
    vars.push(type);
  });
  if (vars.length === fn.vars.length) return;
  fn.vars = vars;
  walk(fn, e => {
    if ((e.op === 'local.get' || e.op === 'local.set' || e.op === 'local.tee') && e.index >= params) e.index = renumber.get(e.index);
  });
}

function nopLike(proto) {
  return Object.assign(Object.create(Object.getPrototypeOf(proto)), { op: 'nop', type: none, kids: [], br: null });
}

function dropOf(proto, value) {
  return Object.assign(Object.create(Object.getPrototypeOf(proto)), { op: 'drop', type: none, kids: [value], br: value.br });
}

/** Visit every expression of `fn` after its children, with its parent and index there. */
function walk(fn, visit) {
  const stack = [[fn.body, null, -1, false]];
  while (stack.length) {
    const entry = stack.pop();
    const [e, parent, index, done] = entry;
    if (done) { visit(e, parent, index); continue; }
    stack.push([e, parent, index, true]);
    for (let i = e.kids.length - 1; i >= 0; i--) stack.push([e.kids[i], e, i, false]);
  }
}
