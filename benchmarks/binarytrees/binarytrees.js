// binary-trees, from the Computer Language Benchmarks Game, in idiomatic
// JavaScript: a stretch tree, a long-lived tree, and many short-lived trees of
// increasing depth, each node an object whose children are null at the leaves.
// Every port in this directory allocates and walks the same trees in the same
// order.

class Node {
  constructor(left, right) {
    this.left = left;
    this.right = right;
  }

  // The number of nodes in the tree.
  check() {
    if (this.left === null) return 1;
    return 1 + this.left.check() + this.right.check();
  }
}

// A perfect tree of the given depth, left subtree built first.
function bottomUpTree(depth) {
  if (depth > 0) {
    const left = bottomUpTree(depth - 1);
    const right = bottomUpTree(depth - 1);
    return new Node(left, right);
  }
  return new Node(null, null);
}

const MIN_DEPTH = 4;
const MAX_DEPTH = 14;

// One run of the benchmark; the sum of every tree's check.
function binaryTrees() {
  let checksum = 0;
  const stretchDepth = MAX_DEPTH + 1;
  checksum += bottomUpTree(stretchDepth).check();

  const longLived = bottomUpTree(MAX_DEPTH);

  for (let depth = MIN_DEPTH; depth <= MAX_DEPTH; depth += 2) {
    const iterations = 1 << (MAX_DEPTH - depth + MIN_DEPTH);
    let check = 0;
    for (let i = 0; i < iterations; i++) {
      check += bottomUpTree(depth).check();
    }
    checksum += check;
  }

  checksum += longLived.check();
  return checksum;
}

export function bench(iterations) {
  let sink = 0;
  for (let i = 0; i < iterations; i++) sink += binaryTrees();
  return sink;
}
