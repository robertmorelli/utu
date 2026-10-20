//! binary-trees, from the Computer Language Benchmarks Game, in idiomatic safe
//! Rust: a stretch tree, a long-lived tree, and many short-lived trees of
//! increasing depth. Each node owns its children through `Option<Box<Node>>`,
//! so every node is its own heap allocation and every tree is freed when it
//! is dropped.
//!
//! There is no `unsafe` code. The crate denies `unsafe_code` rather than
//! forbidding it only because that lint also flags `#[no_mangle]`, so the
//! export at the bottom opts out of it.
#![deny(unsafe_code)]

struct Node {
    left: Option<Box<Node>>,
    right: Option<Box<Node>>,
}

impl Node {
    /// The number of nodes in the tree.
    fn check(&self) -> i32 {
        match (&self.left, &self.right) {
            (Some(left), Some(right)) => 1 + left.check() + right.check(),
            _ => 1,
        }
    }
}

/// A perfect tree of the given depth, left subtree built first.
fn bottom_up_tree(depth: i32) -> Box<Node> {
    if depth > 0 {
        let left = bottom_up_tree(depth - 1);
        let right = bottom_up_tree(depth - 1);
        Box::new(Node { left: Some(left), right: Some(right) })
    } else {
        Box::new(Node { left: None, right: None })
    }
}

const MIN_DEPTH: i32 = 4;
const MAX_DEPTH: i32 = 14;

/// One run of the benchmark; the sum of every tree's check.
fn binary_trees() -> i64 {
    let mut checksum: i64 = 0;
    let stretch_depth = MAX_DEPTH + 1;
    checksum += bottom_up_tree(stretch_depth).check() as i64;

    let long_lived = bottom_up_tree(MAX_DEPTH);

    for depth in (MIN_DEPTH..=MAX_DEPTH).step_by(2) {
        let iterations = 1 << (MAX_DEPTH - depth + MIN_DEPTH);
        let mut check: i32 = 0;
        for _ in 0..iterations {
            check += bottom_up_tree(depth).check();
        }
        checksum += check as i64;
    }

    checksum += long_lived.check() as i64;
    checksum
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn bench(iterations: i32) -> i64 {
    (0..iterations).map(|_| binary_trees()).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trees_count_their_nodes() {
        assert_eq!(bottom_up_tree(0).check(), 1);
        assert_eq!(bottom_up_tree(3).check(), 15);
        assert_eq!(binary_trees(), 3_222_190);
    }
}
