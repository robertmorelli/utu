//! binary-trees, from the Computer Language Benchmarks Game, as a perf-minded
//! Rust author writes it: the same stretch tree, long-lived tree, and
//! short-lived trees, but each tree lives in a bump arena of its own (as the
//! fast Rust entries do with `typed_arena`). The arena is one `Vec<Node>` sized
//! for the whole tree up front, so nodes never move and children are raw
//! pointers into it (null at the leaves); the tree is freed at once when its
//! arena is dropped.

use std::ptr;

struct Node {
    left: *const Node,
    right: *const Node,
}

impl Node {
    /// The number of nodes in the tree.
    fn check(&self) -> i32 {
        if self.left.is_null() {
            1
        } else {
            // SAFETY: non-null children point into the live arena that owns
            // this node, and a node has both children or neither.
            unsafe { 1 + (*self.left).check() + (*self.right).check() }
        }
    }
}

/// A bump allocator for exactly one tree's nodes.
struct Arena {
    nodes: Vec<Node>,
}

impl Arena {
    /// An arena with room for a perfect tree of the given depth.
    fn for_depth(depth: i32) -> Arena {
        Arena { nodes: Vec::with_capacity((1usize << (depth + 1)) - 1) }
    }

    fn alloc(&mut self, left: *const Node, right: *const Node) -> *const Node {
        let len = self.nodes.len();
        debug_assert!(len < self.nodes.capacity());
        // SAFETY: the arena was sized for the whole tree, so there is room,
        // and the buffer never reallocates, so earlier pointers stay valid.
        unsafe {
            let slot = self.nodes.as_mut_ptr().add(len);
            slot.write(Node { left, right });
            self.nodes.set_len(len + 1);
            slot
        }
    }
}

/// A perfect tree of the given depth, left subtree built first.
fn bottom_up_tree(arena: &mut Arena, depth: i32) -> *const Node {
    if depth > 0 {
        let left = bottom_up_tree(arena, depth - 1);
        let right = bottom_up_tree(arena, depth - 1);
        arena.alloc(left, right)
    } else {
        arena.alloc(ptr::null(), ptr::null())
    }
}

/// Builds a tree of the given depth in a fresh arena and checks it.
fn check_tree(arena: &mut Arena, depth: i32) -> i32 {
    let root = bottom_up_tree(arena, depth);
    // SAFETY: the root points into `arena`, which outlives this call.
    unsafe { (*root).check() }
}

const MIN_DEPTH: i32 = 4;
const MAX_DEPTH: i32 = 14;

/// One run of the benchmark; the sum of every tree's check.
fn binary_trees() -> i64 {
    let mut checksum: i64 = 0;
    let stretch_depth = MAX_DEPTH + 1;
    checksum += check_tree(&mut Arena::for_depth(stretch_depth), stretch_depth) as i64;

    let mut long_lived_arena = Arena::for_depth(MAX_DEPTH);
    let long_lived = bottom_up_tree(&mut long_lived_arena, MAX_DEPTH);

    for depth in (MIN_DEPTH..=MAX_DEPTH).step_by(2) {
        let iterations = 1 << (MAX_DEPTH - depth + MIN_DEPTH);
        let mut check: i32 = 0;
        for _ in 0..iterations {
            check += check_tree(&mut Arena::for_depth(depth), depth);
        }
        checksum += check as i64;
    }

    // SAFETY: `long_lived` points into `long_lived_arena`, still alive here.
    checksum += unsafe { (*long_lived).check() } as i64;
    checksum
}

#[no_mangle]
pub extern "C" fn bench(iterations: i32) -> i64 {
    (0..iterations).map(|_| binary_trees()).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trees_count_their_nodes() {
        assert_eq!(check_tree(&mut Arena::for_depth(0), 0), 1);
        assert_eq!(check_tree(&mut Arena::for_depth(3), 3), 15);
        assert_eq!(binary_trees(), 3_222_190);
    }
}
