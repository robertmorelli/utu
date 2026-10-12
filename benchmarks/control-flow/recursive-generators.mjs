// Walking a tree: what does a recursive generator cost?
//
//   recursive generator   for (walk(root)) |n| { … }: one loop over an explicit stack
//   recursion             fn visit(n) { …; for (children(n)) |c| { visit(c); }; }
//   callback              tsc's forEachChild(node, cb) with a utu closure (a JS function)
//   JavaScript            the same tree as JS objects, walked by tsc-style forEachChild
//
// The tree is AST-shaped: leaves, binary nodes and lists of 2–5 children,
// built from one seeded LCG so every strategy (and JS) walks identical nodes.
// Workloads: a full walk, a walk that prunes list subtrees, and a search that
// stops once its running total passes 70% of the full total.
import { compileUtu, engine, row, time } from './bench-lib.mjs';

const DEPTH = Number(process.env.DEPTH ?? 12);
const WIDTH = Number(process.env.WIDTH ?? 4000);
const SEED = 7;

const shared = `
tag enum Node:
    | Leaf { v: I32 }
    | Bin { l: Node, r: Node }
    | List { xs: Array[Node] }

struct Rng:
    | s: I32

fn next(r: Rng) I32 { r.s = r.s * 1103515245 + 12345; (r.s >>> 8) & 65535; }

fn grow(r: Rng, depth: I32) Node {
    let pick = next(r) % 16;
    if depth == 0 or pick < 6 { return Leaf { v: next(r) % 1000 }; };
    if pick < 12 { return Bin { l: grow(r, depth - 1), r: grow(r, depth - 1) }; };
    let k = 2 + next(r) % 4;
    let xs = Array[Node].new(k, Leaf { v: 0 });
    for (0..<k) |i| { xs[i] = grow(r, depth - 1); };
    List { xs: xs };
}

// The root is a list of WIDTH subtrees, so the size does not hinge on one coin flip.
fn forest(seed: I32, width: I32, depth: I32) Node {
    let r = Rng { s: seed };
    let xs = Array[Node].new(width, Leaf { v: 0 });
    for (0..<width) |i| { xs[i] = grow(r, depth); };
    List { xs: xs };
}

fn children(n: Node) yield Node {
    alt n {
        Leaf |x| => {},
        Bin |b| => { yield b.l; yield b.r; },
        List |k| => { for (k.xs) |c| { yield c; }; },
    };
}

fn value(n: Node) I32 { alt n { Leaf |x| => x.v, ~> 0, }; }
fn is_wide(n: Node) Bool { alt n { List |k| => k.xs.len() == 5, ~> false, }; }
`;

const strategies = {
  'recursive generator': `
fn walk(n: Node) yield Node {
    for (children(n)) |c| { yield c; for (walk(c)) |d| { yield d; }; };
}
export lib {
    fn tree(seed: I32, width: I32, depth: I32) Node { forest(seed, width, depth); }
    fn full(root: Node) I32 { let s = 0; for (walk(root)) |n| { s += value(n) + 1; }; s; }
    fn pruned(root: Node) I32 { let s = 0; for (walk(root)) |n| { if is_wide(n) { prune; }; s += value(n) + 1; }; s; }
    fn find(root: Node, limit: I32) I32 { let s = 0; for (walk(root)) |n| { s += value(n) + 1; if s > limit { break; }; }; s; }
}`,
  recursion: `
struct Acc:
    | s: I32
    | done: Bool
fn full_from(n: Node) I32 { let s = 0; for (children(n)) |c| { s += value(c) + 1 + full_from(c); }; s; }
fn pruned_from(n: Node) I32 {
    let s = 0;
    for (children(n)) |c| { s += value(c) + 1; if not is_wide(c) { s += pruned_from(c); }; };
    s;
}
fn find_from(n: Node, limit: I32, a: Acc) void {
    for (children(n)) |c| {
        a.s += value(c) + 1;
        if a.s > limit { a.done = true; break; };
        find_from(c, limit, a);
        if a.done { break; };
    };
}
export lib {
    fn tree(seed: I32, width: I32, depth: I32) Node { forest(seed, width, depth); }
    fn full(root: Node) I32 { full_from(root); }
    fn pruned(root: Node) I32 { pruned_from(root); }
    fn find(root: Node, limit: I32) I32 { let a = Acc { s: 0, done: false }; find_from(root, limit, a); a.s; }
}`,
  callback: `
struct Acc:
    | s: I32
fn for_each_child(n: Node, f: cl(Node) void) void { for (children(n)) |c| { f(c); }; }
fn full_from(n: Node, a: Acc) void {
    for_each_child(n, cl(c: Node) void { a.s += value(c) + 1; full_from(c, a); });
}
fn pruned_from(n: Node, a: Acc) void {
    for_each_child(n, cl(c: Node) void { a.s += value(c) + 1; if not is_wide(c) { pruned_from(c, a); }; });
}
export lib {
    fn tree(seed: I32, width: I32, depth: I32) Node { forest(seed, width, depth); }
    fn full(root: Node) I32 { let a = Acc { s: 0 }; full_from(root, a); a.s; }
    fn pruned(root: Node) I32 { let a = Acc { s: 0 }; pruned_from(root, a); a.s; }
}`,
};

// The same generator and tree in JavaScript, walked the way tsc walks its AST.
function jsTree(seed, width, depth) {
  let s = seed;
  const next = () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return (s >>> 8) & 65535; };
  const grow = (d) => {
    const pick = next() % 16;
    if (d === 0 || pick < 6) return { kind: 0, v: next() % 1000 };
    if (pick < 12) { const l = grow(d - 1); const r = grow(d - 1); return { kind: 1, v: 0, l, r }; }
    const k = 2 + next() % 4;
    const xs = [];
    for (let i = 0; i < k; i++) xs.push(grow(d - 1));
    return { kind: 2, v: 0, xs };
  };
  const xs = [];
  for (let i = 0; i < width; i++) xs.push(grow(depth));
  return { kind: 2, v: 0, xs };
}
function forEachChild(n, cb) {
  if (n.kind === 1) return cb(n.l) || cb(n.r);
  if (n.kind === 2) { for (const c of n.xs) { const r = cb(c); if (r) return r; } }
  return undefined;
}
const js = {
  full(root) { let s = 0; const visit = c => { s += c.v + 1; forEachChild(c, visit); }; forEachChild(root, visit); return s; },
  pruned(root) { let s = 0; const visit = c => { s += c.v + 1; if (!(c.kind === 2 && c.xs.length === 5)) forEachChild(c, visit); }; forEachChild(root, visit); return s; },
  find(root, limit) { let s = 0; const visit = c => { s += c.v + 1; return s > limit ? true : forEachChild(c, visit); }; forEachChild(root, visit); return s; },
};

console.log(`${engine}, ${WIDTH} subtrees, depth limit ${DEPTH}`);
const jsRoot = jsTree(SEED, WIDTH, DEPTH);
let nodes = 0;
(function count(n) { nodes += 1; forEachChild(n, c => { count(c); }); })(jsRoot);
// Stop once the running total passes 70% of the full walk's total.
const limit = Math.floor(js.full(jsRoot) * 0.7);
console.log(`${nodes.toLocaleString()} nodes`);

const expected = { full: js.full(jsRoot), pruned: js.pruned(jsRoot), find: js.find(jsRoot, limit) };
const results = [];
for (const optimize of ['size', 'speed']) {
  console.log(`\n${optimize === 'size' ? '-Oz' : '-O3'}`);
  for (const [name, source] of Object.entries(strategies)) {
    const { exports, bytes } = await compileUtu(`tree_${name.replace(/\W+/g, '_')}_${optimize}`, shared + source, optimize);
    const root = exports.tree(SEED, WIDTH, DEPTH);
    for (const work of ['full', 'pruned', 'find']) {
      if (!exports[work]) continue;
      const run = work === 'find' ? () => exports.find(root, limit) : () => exports[work](root);
      const got = run();
      if (got !== expected[work]) throw new Error(`${name} ${work}: ${got} != ${expected[work]}`);
      const ms = time(run, { rounds: work === 'full' || name !== 'callback' ? undefined : 5 });
      row(`${name} ${work}`, ms, `${bytes} B module`);
      results.push({ optimize, name, work, ms, bytes });
    }
  }
}
console.log('\nJavaScript (tsc-style forEachChild)');
for (const work of ['full', 'pruned', 'find']) {
  const ms = time(() => js[work](jsRoot, limit));
  row(`JS ${work}`, ms);
  results.push({ optimize: 'js', name: 'JavaScript', work, ms });
}
if (process.env.JSON) console.log(JSON.stringify(results));
