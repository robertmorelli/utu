// BG binary-trees Rust #5 (the Rust Project Developers; TeXitoi; Cristi
// Cobzarenco; Matt Brubeck; Tom Kaitchuck; Volodymyr M. Lisivka; Ryohei Machida),
// adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-rust-5.html
// Changes: single-threaded (rayon's into_par_iter -> into_iter, same order; the
// rayon crate is dropped); bumpalo arenas as in the original (the crate builds for
// wasm32-unknown-unknown). main() -> bench(n), which returns the FNV-1a hash of
// the bytes main() printed (format!).

// The Computer Language Benchmarks Game
// http://benchmarksgame.alioth.debian.org/
//
// contributed by the Rust Project Developers
// contributed by TeXitoi
// contributed by Cristi Cobzarenco
// contributed by Matt Brubeck
// modified by Tom Kaitchuck
// modified by Volodymyr M. Lisivka
// modified by Ryohei Machida

extern crate bumpalo;

use bumpalo::Bump;

#[derive(Debug, PartialEq, Clone, Copy)]
struct Tree<'a> {
    left: Option<&'a Tree<'a>>,
    right: Option<&'a Tree<'a>>,
}

fn item_check(tree: &Tree) -> i32 {
    if let (Some(left), Some(right)) = (tree.left, tree.right) {
        1 + item_check(right) + item_check(left)
    } else {
        1
    }
}

fn bottom_up_tree<'r>(arena: &'r Bump, depth: i32) -> &'r Tree<'r> {
    let tree = arena.alloc(Tree { left: None, right: None });
    if depth > 0 {
        tree.right = Some(bottom_up_tree(arena, depth - 1));
        tree.left = Some(bottom_up_tree(arena, depth - 1));
    }
    tree
}

fn inner(depth: i32, iterations: i32) -> String {
    let chk: i32 = (0..iterations)
        .into_iter()
        .map(|_| {
            let arena = Bump::new();
            let a = bottom_up_tree(&arena, depth);
            item_check(a)
        })
        .sum();
    format!("{}\t trees of depth {}\t check: {}", iterations, depth, chk)
}

fn fnv(mut h: u32, s: &[u8]) -> u32 {
    for &b in s { h ^= b as u32; h = h.wrapping_mul(16777619); }
    h
}

#[no_mangle]
pub extern "C" fn bench(n: i32) -> u32 {
    let mut out = String::new();
    let min_depth = 4;
    let max_depth = if min_depth + 2 > n { min_depth + 2 } else { n };

    {
        let arena = Bump::new();
        let depth = max_depth + 1;
        let tree = bottom_up_tree(&arena, depth);
        out += &format!(
            "stretch tree of depth {}\t check: {}\n",
            depth,
            item_check(tree)
        );
    }

    let long_lived_arena = Bump::new();
    let long_lived_tree = bottom_up_tree(&long_lived_arena, max_depth);

    let messages = (min_depth / 2..=max_depth / 2)
        .into_iter()
        .map(|half_depth| {
            let depth = half_depth * 2;
            let iterations = 1 << ((max_depth - depth + min_depth) as u32);
            let res = inner(depth, iterations);
            res
        })
        .collect::<Vec<_>>();

    for message in messages {
        out += &format!("{}\n", message);
    }

    out += &format!(
        "long lived tree of depth {}\t check: {}\n",
        max_depth,
        item_check(long_lived_tree)
    );
    fnv(2166136261, out.as_bytes())
}
