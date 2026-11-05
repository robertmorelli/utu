//! The Computer Language Benchmarks Game, pidigits Rust #4
//! https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-rust-4.html
//!
//! Contributed by TeXitoi, contributed by Ryohei Machida
//!
//! Adapted for Wasm: rug (GMP through gmp-mpfr-sys, which builds GMP with a
//! C toolchain and does not support wasm32-unknown-unknown) -> num-bigint 0.4
//! (pure Rust). `assign` -> `=` (num-bigint has no in-place assign from an
//! expression); main -> bench(n); stdout -> FNV-1a of the same bytes.

use num_bigint::BigInt;
use num_traits::ToPrimitive;
use std::cmp;

pub struct Context {
    q: BigInt,
    r: BigInt,
    t: BigInt,
    tmp1: BigInt,
    tmp2: BigInt,
    k: u32,
}

impl Context {
    pub fn new() -> Context {
        Context {
            q: BigInt::from(1),
            r: BigInt::from(0),
            t: BigInt::from(1),
            tmp1: BigInt::from(0),
            tmp2: BigInt::from(0),
            k: 0,
        }
    }

    pub fn next(&mut self) -> u8 {
        loop {
            self.next_term();
            if self.q > self.r {
                continue;
            }
            let d = self.extract(3);
            if d != self.extract(4) {
                continue;
            }

            self.produce(d);
            return d;
        }
    }

    fn next_term(&mut self) {
        self.k += 1;
        let k2 = self.k * 2 + 1;

        self.tmp1 = &self.q << 1;
        self.r += &self.tmp1;
        self.r *= k2;
        self.t *= k2;
        self.q *= self.k;
    }

    #[inline]
    fn extract(&mut self, nth: u32) -> u8 {
        if nth.is_power_of_two() {
            // use shift operation if possible
            self.tmp1 = &self.q << nth.trailing_zeros();
        } else {
            self.tmp1 = &self.q * nth;
        };

        self.tmp2 = &self.tmp1 + &self.r;
        self.tmp1 = &self.tmp2 / &self.t;
        self.tmp1.to_u8().unwrap()
    }

    fn produce(&mut self, n: u8) {
        self.q *= 10u8;
        self.r -= &self.t * n;
        self.r *= 10u8;
    }
}

fn fnv(mut h: u32, s: &[u8]) -> u32 {
    for &b in s {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

#[no_mangle]
pub extern "C" fn bench(n: i32) -> u32 {
    let n = n as usize;
    let mut ctx = Context::new();

    // line buffer
    let mut line_buf = [0u8; 12];
    line_buf[10] = b'\t';
    line_buf[11] = b':';

    let mut h = 2166136261u32;

    for d in (0..n).step_by(10) {
        let count = cmp::min(10, n - d);

        for i in 0..count {
            line_buf[i] = b'0' + ctx.next();
        }

        for i in count..10 {
            line_buf[i] = b' ';
        }

        h = fnv(h, &line_buf);
        h = fnv(h, format!("{}\n", d + count).as_bytes());
    }
    h
}
