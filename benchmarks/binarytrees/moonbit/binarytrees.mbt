// binary-trees, from the Computer Language Benchmarks Game, in idiomatic
// MoonBit: a stretch tree, a long-lived tree, and many short-lived trees of
// increasing depth. Each node is a GC struct whose children are `Node?`,
// `None` at the leaves.

///|
priv struct Node {
  left : Node?
  right : Node?
}

///|
/// The number of nodes in the tree.
fn Node::check(self : Node) -> Int {
  match (self.left, self.right) {
    (Some(left), Some(right)) => 1 + left.check() + right.check()
    _ => 1
  }
}

///|
/// A perfect tree of the given depth, left subtree built first.
fn bottom_up_tree(depth : Int) -> Node {
  if depth > 0 {
    let left = bottom_up_tree(depth - 1)
    let right = bottom_up_tree(depth - 1)
    { left: Some(left), right: Some(right) }
  } else {
    { left: None, right: None }
  }
}

///|
const MIN_DEPTH : Int = 4

///|
const MAX_DEPTH : Int = 14

///|
/// One run of the benchmark; the sum of every tree's check.
fn binary_trees() -> Int64 {
  let mut checksum = 0L
  let stretch_depth = MAX_DEPTH + 1
  checksum += bottom_up_tree(stretch_depth).check().to_int64()
  let long_lived = bottom_up_tree(MAX_DEPTH)
  for depth = MIN_DEPTH; depth <= MAX_DEPTH; depth = depth + 2 {
    let iterations = 1 << (MAX_DEPTH - depth + MIN_DEPTH)
    let mut check = 0
    for _ in 0..<iterations {
      check += bottom_up_tree(depth).check()
    }
    checksum += check.to_int64()
  }
  checksum += long_lived.check().to_int64()
  checksum
}

///|
pub fn bench(iterations : Int) -> Int64 {
  let mut sink = 0L
  for _ in 0..<iterations {
    sink += binary_trees()
  }
  sink
}
