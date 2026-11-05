// Not on BG: MoonBit translated from BG binary-trees Node #6 (Léo Sarrazin;
// Andrey Filatkin), the fastest source that fits MoonBit (a GC'd tree; the C/C++/
// Rust ones use arena allocators MoonBit does not have):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-node-6.html
// Single-threaded: each depth's work() in order. bench(n) returns the FNV-1a hash
// of the bytes Node #6 prints.

///|
priv struct TreeNode {
  left : TreeNode?
  right : TreeNode?
}

///|
fn item_check(node : TreeNode) -> Int {
  match node.left {
    None => 1
    Some(left) =>
      match node.right {
        Some(right) => 1 + item_check(left) + item_check(right)
        None => 1
      }
  }
}

///|
fn bottom_up_tree(depth : Int) -> TreeNode {
  if depth > 0 {
    { left: Some(bottom_up_tree(depth - 1)), right: Some(bottom_up_tree(depth - 1)) }
  } else {
    { left: None, right: None }
  }
}

///|
fn work(iterations : Int, depth : Int) -> String {
  let mut check = 0
  for _ in 0..<iterations {
    check += item_check(bottom_up_tree(depth))
  }
  "\{iterations}\t trees of depth \{depth}\t check: \{check}"
}

///|
fn fnv_str(h0 : Int, s : String) -> Int {
  let mut h = h0
  for i in 0..<s.length() {
    h = (h ^ s.code_unit_at(i).to_int()) * 16777619
  }
  h
}

///|
pub fn bench(n : Int) -> Int {
  let out = StringBuilder::new()
  let max_depth = if n > 6 { n } else { 6 }
  let stretch_depth = max_depth + 1
  let check = item_check(bottom_up_tree(stretch_depth))
  out.write_string("stretch tree of depth \{stretch_depth}\t check: \{check}\n")
  let long_lived_tree = bottom_up_tree(max_depth)
  for depth = 4; depth <= max_depth; depth = depth + 2 {
    let iterations = 1 << (max_depth - depth + 4)
    out.write_string(work(iterations, depth) + "\n")
  }
  out.write_string(
    "long lived tree of depth \{max_depth}\t check: \{item_check(long_lived_tree)}\n",
  )
  fnv_str(-2128831035, out.to_string())
}
