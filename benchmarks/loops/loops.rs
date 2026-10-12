// Rust mirror of loops.utu. Idiomatic iterators; i32 arithmetic wraps like utu.
// group_by / distinct_by use the same linear key table utu documents, so the
// comparison is of code generation, not of hashing.
#![allow(static_mut_refs)]
use std::num::Wrapping;

static mut INTS: Vec<i32> = Vec::new();
static mut FLOATS: Vec<f64> = Vec::new();
static mut SORTED: Vec<i32> = Vec::new();

fn ints() -> &'static [i32] { unsafe { &INTS } }
fn floats() -> &'static [f64] { unsafe { &FLOATS } }
fn sorted() -> &'static [i32] { unsafe { &SORTED } }

#[no_mangle]
pub extern "C" fn setup(n: i32) {
    let n = n as usize;
    let mut seed = Wrapping(12345i32);
    let mut xs = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed * Wrapping(1103515245) + Wrapping(12345);
        xs.push(((seed.0 >> 8) & 1023) % 1000 - 500);
    }
    if n > 0 { xs[n - 1] = 1000; }
    unsafe {
        INTS = xs;
        FLOATS = (0..n).map(|i| i as f64 * 0.5).collect();
        SORTED = (0..n as i32).map(|i| i * 3).collect();
    }
}

#[no_mangle]
pub extern "C" fn while_sum() -> i32 {
    let xs = ints();
    let (mut s, mut i) = (0i32, 0usize);
    while i < xs.len() { s = s.wrapping_add(xs[i]); i += 1; }
    s
}

#[no_mangle]
pub extern "C" fn for_range_sum() -> i32 {
    let xs = ints();
    let mut s = 0i32;
    for i in 0..xs.len() { s = s.wrapping_add(xs[i]); }
    s
}

#[no_mangle]
pub extern "C" fn for_each_sum() -> i32 {
    let mut s = 0i32;
    for &x in ints() { s = s.wrapping_add(x); }
    s
}

#[no_mangle]
pub extern "C" fn each_sum() -> i32 {
    let mut s = 0i32;
    ints().iter().for_each(|&x| s = s.wrapping_add(x));
    s
}

#[no_mangle]
pub extern "C" fn sum() -> i32 { ints().iter().fold(0i32, |a, &x| a.wrapping_add(x)) }

#[no_mangle]
pub extern "C" fn map_filter_fold() -> i32 {
    ints().iter().map(|&x| x.wrapping_mul(3)).filter(|x| x % 2 == 0).fold(0i32, |a, x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn count_where() -> i32 { ints().iter().filter(|&&x| x > 0).count() as i32 }

#[no_mangle]
pub extern "C" fn any_miss() -> i32 { ints().iter().any(|&x| x > 100000) as i32 }

#[no_mangle]
pub extern "C" fn collect_map() -> i32 {
    let ys: Vec<i32> = ints().iter().map(|&x| x + 1).collect();
    ys.len() as i32 + ys[ys.len() - 1]
}

#[no_mangle]
pub extern "C" fn scan_last() -> i32 {
    let ys: Vec<i32> = ints().iter().scan(0i32, |a, &x| { *a = a.wrapping_add(x); Some(*a) }).collect();
    ys[ys.len() - 1]
}

#[no_mangle]
pub extern "C" fn zip_dot() -> i32 {
    let xs = ints();
    xs.iter().zip(xs).map(|(a, b)| a.wrapping_mul(*b)).fold(0i32, |a, x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn flat_map_sum() -> i32 {
    ints().iter().flat_map(|&x| [x, x + 1]).fold(0i32, |a, x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn skip_take() -> i32 {
    let xs = ints();
    xs.iter().skip(10).take(xs.len() / 2).fold(0i32, |a, &x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn take_while_count() -> i32 { ints().iter().take_while(|&&x| x > -1000).count() as i32 }

#[no_mangle]
pub extern "C" fn chain_sum() -> i32 {
    let xs = ints();
    xs.iter().chain(xs).fold(0i32, |a, &x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn sort_ints() -> i32 {
    // Stable, like utu's sort.
    let mut s = ints().to_vec();
    s.sort();
    s[0] + s[s.len() / 2] + s[s.len() - 1]
}

#[no_mangle]
pub extern "C" fn group_by_16() -> i32 {
    let mut groups: Vec<(i32, Vec<i32>)> = Vec::new();
    for &x in ints() {
        let key = x & 15;
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, values)) => values.push(x),
            None => groups.push((key, vec![x])),
        }
    }
    groups.len() as i32 * 1000 + groups[0].1.len() as i32
}

#[no_mangle]
pub extern "C" fn distinct_64() -> i32 {
    let mut keys: Vec<i32> = Vec::new();
    let mut out: Vec<i32> = Vec::new();
    for &x in ints() {
        let key = x & 63;
        if !keys.contains(&key) { keys.push(key); out.push(x); }
    }
    out.len() as i32
}

#[no_mangle]
pub extern "C" fn group_by_4096() -> i32 {
    let mut groups: std::collections::HashMap<i32, Vec<i32>> = std::collections::HashMap::new();
    for (i, &x) in ints().iter().enumerate() {
        groups.entry((x.wrapping_mul(31).wrapping_add(i as i32)) & 4095).or_default().push(x);
    }
    groups.len() as i32
}

#[no_mangle]
pub extern "C" fn distinct_4096() -> i32 {
    let mut seen = std::collections::HashSet::new();
    let mut firsts = Vec::new();
    for (i, &x) in ints().iter().enumerate() {
        if seen.insert((x.wrapping_mul(31).wrapping_add(i as i32)) & 4095) { firsts.push(x); }
    }
    firsts.len() as i32
}

#[no_mangle]
pub extern "C" fn collect_then_filter() -> i32 {
    let ys: Vec<i32> = ints().iter().map(|&x| x + 1).collect();
    ys.iter().filter(|&&x| x > 0).fold(0i32, |a, &x| a.wrapping_add(x))
}

#[no_mangle]
pub extern "C" fn partition_positive() -> i32 {
    let (yes, _no): (Vec<i32>, Vec<i32>) = ints().iter().partition(|&&x| x > 0);
    yes.len() as i32
}

#[no_mangle]
pub extern "C" fn batched_64() -> i32 {
    let batches: Vec<Vec<i32>> = ints().chunks(64).map(|c| c.to_vec()).collect();
    batches.len() as i32 + batches[0][0]
}

#[no_mangle]
pub extern "C" fn windows_4() -> i32 {
    let windows: Vec<Vec<i32>> = ints().windows(4).map(|w| w.to_vec()).collect();
    windows.len() as i32 + windows[1][3]
}

#[no_mangle]
pub extern "C" fn min_value() -> i32 { *ints().iter().min().unwrap() }

#[no_mangle]
pub extern "C" fn first_late() -> i32 { *ints().iter().find(|&&x| x == 1000).unwrap() }

#[no_mangle]
pub extern "C" fn reduce_sum() -> i32 { ints().iter().copied().reduce(|a, x| a.wrapping_add(x)).unwrap() }

#[no_mangle]
pub extern "C" fn bisect_many() -> i32 {
    let s = sorted();
    let n = s.len() as i32;
    let mut hits = 0i32;
    for q in 0..n {
        let target = q.wrapping_mul(7) % (n * 3);
        hits = hits.wrapping_add(s.partition_point(|&v| v < target) as i32);
    }
    hits
}

#[no_mangle]
pub extern "C" fn dot_f64() -> f64 {
    let xs = floats();
    xs.iter().zip(xs).map(|(a, b)| a * b).sum()
}
