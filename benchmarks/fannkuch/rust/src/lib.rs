//! fannkuch-redux from the Computer Language Benchmarks Game, after its
//! single-threaded C program, as safe Rust over `Vec<i32>`: permutations
//! generated in place with a count array, each one flipped (prefix reversal)
//! until its first element is 0.
//!
//! The crate denies `unsafe_code`; the export at the bottom opts out only
//! because that lint also flags `#[no_mangle]`.
#![deny(unsafe_code)]

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
    loop {
        while r != 1 {
            count[r - 1] = r as i32;
            r -= 1;
        }
        for i in 0..n {
            perm[i] = perm1[i];
        }
        let mut flips = 0i32;
        let mut k = perm[0] as usize;
        while k != 0 {
            let k2 = (k + 1) >> 1;
            for i in 0..k2 {
                perm.swap(i, k - i);
            }
            flips += 1;
            k = perm[0] as usize;
        }
        max_flips = max_flips.max(flips);
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
            let perm0 = perm1[0];
            for i in 0..r {
                perm1[i] = perm1[i + 1];
            }
            perm1[r] = perm0;
            count[r] -= 1;
            if count[r] > 0 {
                break;
            }
            r += 1;
        }
        perm_count += 1;
    }
}

#[allow(unsafe_code)]
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
