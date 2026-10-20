//! fannkuch-redux from the Computer Language Benchmarks Game, after its
//! single-threaded C program, as a perf-minded Rust author would write it:
//! the same `Vec<i32>` buffers and loops as the safe port, indexed with
//! `get_unchecked`/`get_unchecked_mut` so no access is bounds-checked.
//!
//! Safety invariant, relied on by every `unsafe` block below: every index is
//! below `n`, the length of all three buffers. `r` stays in 1..n while it
//! indexes (the loop returns once it reaches n), `k` is a permutation element
//! (< n), and the flip and rotate loops stay within 0..=k and 0..=r.

/// checksum * 1000 + max_flips for all permutations of 0..n.
fn fannkuch(n: i32) -> i64 {
    let n = n as usize;
    let mut perm = vec![0i32; n];
    let mut perm1: Vec<i32> = (0..n as i32).collect();
    let mut count = vec![0i32; n];
    let mut max_flips = 0i32;
    let mut checksum = 0i32;
    let mut perm_count = 0i32;
    let mut r = n;
    unsafe {
        loop {
            while r != 1 {
                *count.get_unchecked_mut(r - 1) = r as i32;
                r -= 1;
            }
            for i in 0..n {
                *perm.get_unchecked_mut(i) = *perm1.get_unchecked(i);
            }
            let mut flips = 0i32;
            let mut k = *perm.get_unchecked(0) as usize;
            while k != 0 {
                let k2 = (k + 1) >> 1;
                for i in 0..k2 {
                    let p = perm.as_mut_ptr();
                    core::ptr::swap(p.add(i), p.add(k - i));
                }
                flips += 1;
                k = *perm.get_unchecked(0) as usize;
            }
            if flips > max_flips {
                max_flips = flips;
            }
            if perm_count % 2 == 0 {
                checksum += flips;
            } else {
                checksum -= flips;
            }
            // The next permutation: rotate the first r + 1 elements left until a count stays positive.
            loop {
                if r == n {
                    return checksum as i64 * 1000 + max_flips as i64;
                }
                let perm0 = *perm1.get_unchecked(0);
                for i in 0..r {
                    *perm1.get_unchecked_mut(i) = *perm1.get_unchecked(i + 1);
                }
                *perm1.get_unchecked_mut(r) = perm0;
                *count.get_unchecked_mut(r) -= 1;
                if *count.get_unchecked(r) > 0 {
                    break;
                }
                r += 1;
            }
            perm_count += 1;
        }
    }
}

#[no_mangle]
pub extern "C" fn bench(iterations: i32) -> i64 {
    (0..iterations).map(|_| fannkuch(9)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_output() {
        assert_eq!(fannkuch(7), 228016);
    }
}
