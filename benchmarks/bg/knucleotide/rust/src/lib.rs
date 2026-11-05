// BG k-nucleotide Rust #7 (Alexander), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-rust-7.html
// Changes: single-threaded (the seven tokio_threadpool jobs run in order;
// futures/tokio_threadpool dropped); `num` -> num-traits (the same traits);
// stdin -> the fasta text setup(n) makes (BufRead over a byte slice);
// println! -> write! into a String whose bytes are hashed (FNV-1a 32) and
// returned by bench(n). hashbrown 0.15 (its default hasher, foldhash).

use itertools::Itertools;
use num_traits::{FromPrimitive, ToPrimitive};
use std::cmp::Ordering;
use std::fmt::Write;

type Map<T> = hashbrown::HashMap<T, u32>;

trait ShlXorMsk<T> {
    fn sh(a: T, x: u8, m: T) -> T;
    fn mask(len: usize) -> T;
}

impl ShlXorMsk<u8> for u8 {
    fn sh(a: u8, x: u8, m: u8) -> u8 {
        m & (a << 2) | x
    }
    fn mask(len: usize) -> u8 {
        ((1u16 << 2 * len) - 1) as u8
    }
}

impl ShlXorMsk<u16> for u16 {
    fn sh(a: u16, x: u8, m: u16) -> u16 {
        m & (a << 2) | (x as u16)
    }
    fn mask(len: usize) -> u16 {
        ((1u32 << 2 * len) - 1) as u16
    }
}

impl ShlXorMsk<u32> for u32 {
    fn sh(a: u32, x: u8, m: u32) -> u32 {
        m & (a << 2) | (x as u32)
    }
    fn mask(len: usize) -> u32 {
        ((1u64 << 2 * len) - 1) as u32
    }
}

impl ShlXorMsk<u64> for u64 {
    fn sh(a: u64, x: u8, m: u64) -> u64 {
        m & (a << 2) | (x as u64)
    }
    fn mask(len: usize) -> u64 {
        (1u64 << 2 * len) - 1
    }
}

fn match_key(k: u8) -> char {
    match k {
        0b00 => 'A',
        0b01 => 'C',
        0b10 => 'T',
        0b11 => 'G',
        _ => '_',
    }
}

fn print_stat(out: &mut String, h: Map<u8>, seq_len: usize) {
    let total = h.values().sum::<u32>();

    h.into_iter()
        .sorted_by(|&(ref a, x), &(ref b, y)| {
            let ord1 = Ord::cmp(&y, &x);
            if ord1 == Ordering::Equal {
                Ord::cmp(&b, &a)
            } else {
                ord1
            }
        })
        .for_each(|(k, v)| {
            if seq_len == 1 {
                writeln!(out, "{} {:.3}", match_key(k), (100 * v) as f32 / total as f32).unwrap();
            } else {
                writeln!(
                    out,
                    "{}{} {:.3}",
                    match_key(k >> 2),
                    match_key(0b11 & k),
                    (100 * v) as f32 / total as f32
                ).unwrap();
            };
        });
    writeln!(out).unwrap();
}

fn print<
    T: FromPrimitive + ToPrimitive + Default + std::hash::Hash + std::cmp::Eq + ShlXorMsk<T> + Copy,
>(
    out: &mut String,
    h: Map<T>,
    seq: &str,
) {
    let mask = T::from_u64((1u64 << (2 * seq.len() as u32)) - 1).unwrap();
    let k = seq.to_ascii_lowercase()
        .as_bytes()
        .iter()
        .map(|x| 0b11u8 & x >> 1)
        .fold(T::default(), |acc, x| T::sh(acc, x, mask));
    writeln!(out, "{}\t{}", h.get(&k).unwrap_or(&0), seq).unwrap();
}

fn freq<
    T: FromPrimitive + ToPrimitive + Default + std::hash::Hash + std::cmp::Eq + ShlXorMsk<T> + Copy,
>(
    s_vec: &[u8],
    len: usize,
) -> Map<T> {
    let mut h = Map::default();
    let mask = T::mask(len);
    let mut it = s_vec.iter();
    let mut a = it.by_ref()
        .take(len - 1)
        .fold(T::default(), |acc, &x| T::sh(acc, x, mask));
    for &x in it {
        a = T::sh(a, x, mask);
        *h.entry(a).or_insert(0) += 1;
    }
    h
}

fn get_seq<R: std::io::BufRead>(mut r: R, key: &[u8]) -> Vec<u8> {
    let mut res = Vec::with_capacity(65536);
    let mut line = Vec::with_capacity(64);

    loop {
        match r.read_until(b'\n', &mut line) {
            Ok(b) if b > 0 => if line.starts_with(key) { break },
            _ => break,
        }
        line.clear();
    }

    loop {
        line.clear();
        match r.read_until(b'\n', &mut line) {
            Ok(b) if b > 0 => res.extend(line[..line.len()-1].iter().map(|&x| 0b11 & x >> 1)),
            _ => break,
        }
    }

    res
}

pub fn calc<R: std::io::BufRead>(r: R) -> String {
    let s_vec = get_seq(r, b">THREE");
    let mut out = String::new();

    // BG: seven jobs on a tokio_threadpool, waited for in this order.
    print_stat(&mut out, freq(&s_vec, 1), 1);
    print_stat(&mut out, freq(&s_vec, 2), 2);
    print::<u8>(&mut out, freq(&s_vec, 3), "GGT");
    print::<u8>(&mut out, freq(&s_vec, 4), "GGTA");
    print::<u16>(&mut out, freq(&s_vec, 6), "GGTATT");
    print::<u32>(&mut out, freq(&s_vec, 12), "GGTATTTTAATT");
    print::<u64>(&mut out, freq(&s_vec, 18), "GGTATTTTAATTTATAGT");
    out
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
static mut INPUT: Vec<u8> = Vec::new();

fn fasta(n: usize) -> Vec<u8> {
    const ALU: &[u8] = b"GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";
    let mut out = Vec::new();
    out.extend_from_slice(b">ONE Homo sapiens alu\n");
    let mut k = 0;
    let mut left = 2 * n;
    while left > 0 {
        for _ in 0..left.min(60) {
            out.push(ALU[k]);
            k = (k + 1) % ALU.len();
        }
        out.push(b'\n');
        left = left.saturating_sub(60);
    }
    let mut seed: u32 = 42;
    let mut random = |out: &mut Vec<u8>, chars: &[u8], probs: &[f64], count: usize| {
        let mut cum = Vec::new();
        let mut c = 0.0;
        for p in probs {
            c += p;
            cum.push(c);
        }
        let mut left = count;
        while left > 0 {
            for _ in 0..left.min(60) {
                seed = (seed * 3877 + 29573) % 139968;
                let r = seed as f64 / 139968.0;
                let mut j = 0;
                while j < cum.len() - 1 && r >= cum[j] {
                    j += 1;
                }
                out.push(chars[j]);
            }
            out.push(b'\n');
            left = left.saturating_sub(60);
        }
    };
    out.extend_from_slice(b">TWO IUB ambiguity codes\n");
    random(&mut out, b"acgtBDHKMNRSVWY", &[0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
    out.extend_from_slice(b">THREE Homo sapiens frequency\n");
    random(&mut out, b"acgt", &[0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
    out
}

#[no_mangle]
pub extern "C" fn setup(n: i32) {
    unsafe { INPUT = fasta(n as usize); }
}

#[no_mangle]
pub extern "C" fn bench(_n: i32) -> u32 {
    let input: &[u8] = unsafe { &*std::ptr::addr_of!(INPUT) };
    let s = calc(input);
    let mut h: u32 = 2166136261;
    for &b in s.as_bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}
