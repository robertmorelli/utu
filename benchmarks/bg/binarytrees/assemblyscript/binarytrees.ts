// Not on BG: AssemblyScript translated from BG binary-trees gcc #2 (Jeremy
// Zerfas), the fastest source, which fits AssemblyScript (raw linear memory):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-gcc-2.html
// Nodes are 8 bytes (two u32 pointers) in memory pools with the C port's
// apr_pools.h shim semantics: 8 KiB blocks from heap.alloc, bump allocation of
// zeroed memory, clear keeps the blocks, destroy frees them. Single-threaded: the
// long-lived tree, then each depth in order with one pool. bench(n) returns the
// FNV-1a hash of the bytes gcc #2 prints.

const BLOCK: usize = 8192;
const NODE: usize = 8;   // struct tree_node { tree_node *left_Node, *right_Node; }

// A block: [next: usize][end: usize] then memory. A pool: [first][current][free].
function block_new(): usize {
  const b = heap.alloc(BLOCK);
  store<usize>(b, 0);
  store<usize>(b, b + BLOCK, 4);
  return b;
}

function pool_create(): usize {
  const p = heap.alloc(12);
  const b = block_new();
  store<usize>(p, b);
  store<usize>(p, b, 4);
  store<usize>(p, b + 8, 8);
  return p;
}

@inline function pcalloc(p: usize, size: usize): usize {
  size = (size + 7) & ~(<usize>7);
  let free = load<usize>(p, 8);
  let current = load<usize>(p, 4);
  if (free + size > load<usize>(current, 4)) {
    let next = load<usize>(current);
    if (!next) { next = block_new(); store<usize>(current, next); }
    store<usize>(p, next, 4);
    free = next + 8;
  }
  store<usize>(p, free + size, 8);
  memory.fill(free, 0, size);
  return free;
}

function pool_clear(p: usize): void {
  const first = load<usize>(p);
  store<usize>(p, first, 4);
  store<usize>(p, first + 8, 8);
}

function pool_destroy(p: usize): void {
  let b = load<usize>(p);
  while (b) { const next = load<usize>(b); heap.free(b); b = next; }
  heap.free(p);
}

// Create a binary tree of depth tree_Depth in memory_Pool and return a pointer
// to the created binary tree.
function create_Tree(tree_Depth: i32, memory_Pool: usize): usize {
  const root_Node = pcalloc(memory_Pool, NODE);
  if (tree_Depth > 0) {
    store<usize>(root_Node, create_Tree(tree_Depth - 1, memory_Pool));
    store<usize>(root_Node, create_Tree(tree_Depth - 1, memory_Pool), 4);
  }
  return root_Node;
}

// Compute and return the checksum for the binary tree that has root_Node as the
// root node.
function compute_Tree_Checksum(root_Node: usize): i32 {
  const left = load<usize>(root_Node), right = load<usize>(root_Node, 4);
  if (left && right)
    return compute_Tree_Checksum(left) + compute_Tree_Checksum(right) + 1;
  return 1;
}

function fnv(h: u32, s: string): u32 {
  for (let i = 0; i < s.length; i++) h = (h ^ <u32>s.charCodeAt(i)) * 16777619;
  return h;
}

export function bench(n: i32): u32 {
  let h: u32 = 2166136261;
  const minimum_Tree_Depth = 4;
  const maximum_Tree_Depth = n < minimum_Tree_Depth + 2 ? minimum_Tree_Depth + 2 : n;

  const memory_Pool = pool_create();

  const stretch_Tree = create_Tree(maximum_Tree_Depth + 1, memory_Pool);
  h = fnv(h, "stretch tree of depth " + (maximum_Tree_Depth + 1).toString() + "\t check: " +
    compute_Tree_Checksum(stretch_Tree).toString() + "\n");
  pool_clear(memory_Pool);

  const long_Lived_Tree = create_Tree(maximum_Tree_Depth, memory_Pool);
  const long_Lived_Tree_Checksum = compute_Tree_Checksum(long_Lived_Tree);

  const tree_Checksums = new StaticArray<i32>((maximum_Tree_Depth - minimum_Tree_Depth + 2) / 2);
  const thread_Memory_Pool = pool_create();
  for (let tree_Depth = minimum_Tree_Depth; tree_Depth <= maximum_Tree_Depth; tree_Depth += 2) {
    let total_Trees_Checksum = 0;
    for (let iterations = 1 << (maximum_Tree_Depth - tree_Depth + minimum_Tree_Depth); iterations-- > 0;) {
      pool_clear(thread_Memory_Pool);
      total_Trees_Checksum += compute_Tree_Checksum(create_Tree(tree_Depth, thread_Memory_Pool));
    }
    tree_Checksums[(tree_Depth - minimum_Tree_Depth) / 2] = total_Trees_Checksum;
  }
  pool_destroy(thread_Memory_Pool);

  for (let tree_Depth = minimum_Tree_Depth; tree_Depth <= maximum_Tree_Depth; tree_Depth += 2)
    h = fnv(h, (1 << (maximum_Tree_Depth - tree_Depth + minimum_Tree_Depth)).toString() + "\t trees of depth " +
      tree_Depth.toString() + "\t check: " + tree_Checksums[(tree_Depth - minimum_Tree_Depth) / 2].toString() + "\n");

  h = fnv(h, "long lived tree of depth " + maximum_Tree_Depth.toString() + "\t check: " +
    long_Lived_Tree_Checksum.toString() + "\n");
  pool_destroy(memory_Pool);
  return h;
}
