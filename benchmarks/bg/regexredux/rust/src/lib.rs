// BG regex-redux Rust #7 (Tom Kaitchuck, Ryohei Machida), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-rust-7.html
// Changes: PCRE2 (pcre2-sys, C + JIT) does not build for wasm32-unknown-unknown,
// so module `pcre2` wraps the regex crate (regex::bytes::Regex, the crate other
// BG Rust programs use) behind the same API (find_at, count, replace,
// replace_inplace); single-threaded (rayon tasks and channels run in order);
// stdin -> the fasta text setup(n) makes; println! -> format! + FNV-1a 32,
// returned by bench(n).

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Tom Kaitchuck
// contributed by Ryohei Machida

use crate::pcre2::Regex;
use std::mem;

mod pcre2 {
    pub struct Regex {
        pattern: &'static str,
        re: regex::bytes::Regex,
    }

    impl Regex {
        pub fn new(pattern: &'static str) -> Regex {
            Regex { pattern, re: regex::bytes::Regex::new(pattern).unwrap() }
        }

        pub fn pattern(&self) -> &str {
            self.pattern
        }

        pub fn find_at<'s>(
            &self,
            subject: &'s [u8],
            start: usize,
        ) -> Option<(usize, usize)> {
            assert!(start <= subject.len());
            self.re.find_at(subject, start).map(|m| (m.start(), m.end()))
        }

        pub fn count<'s>(&self, subject: &'s [u8]) -> usize {
            let mut count = 0;
            let mut last_match = 0;

            while let Some((_, e)) = self.find_at(subject, last_match) {
                count += 1;
                last_match = e;
            }

            count
        }

        pub fn replace<'s, 'a, 'o>(
            &self,
            subject: &'s [u8],
            alt: &'a [u8],
            out: &'o mut Vec<u8>,
        ) {
            let mut last_match = 0;

            while let Some((s, e)) = self.find_at(subject, last_match) {
                out.extend_from_slice(&subject[last_match..s]);
                out.extend_from_slice(alt);
                last_match = e;
            }

            out.extend_from_slice(&subject[last_match..]);
        }

        pub fn replace_inplace<'s, 'a>(
            &self,
            subject: &'s mut Vec<u8>,
            alt: &'a [u8],
        ) {
            let mut last_match = 0;
            let mut last_write = 0;

            while let Some((s, e)) = self.find_at(subject, last_match) {
                assert!(e - s >= alt.len());
                subject.copy_within(last_match..s, last_write);
                last_write += s - last_match;
                subject[last_write..last_write + alt.len()]
                    .copy_from_slice(alt);
                last_write += alt.len();
                last_match = e;
            }

            subject.copy_within(last_match.., last_write);
            subject.truncate(last_write + (subject.len() - last_match));
        }
    }
}

fn count_reverse_complements(sequence: &[u8]) -> Vec<String> {
    // Search for occurrences of the following patterns:
    let variants = vec![
        Regex::new("agggtaaa|tttaccct"),
        Regex::new("[cgt]gggtaaa|tttaccc[acg]"),
        Regex::new("a[act]ggtaaa|tttacc[agt]t"),
        Regex::new("ag[act]gtaaa|tttac[agt]ct"),
        Regex::new("agg[act]taaa|ttta[agt]cct"),
        Regex::new("aggg[acg]aaa|ttt[cgt]ccct"),
        Regex::new("agggt[cgt]aa|tt[acg]accct"),
        Regex::new("agggta[cgt]a|t[acg]taccct"),
        Regex::new("agggtaa[cgt]|[acg]ttaccct"),
    ];

    variants
        .into_iter()
        .map(|variant| {
            let count = variant.count(sequence);
            format!("{} {}", variant.pattern(), count)
        })
        .collect()
}

fn find_replaced_sequence_length(mut buf: Vec<u8>) -> usize {
    // Replace the following patterns, one at a time:
    let substs = vec![
        (Regex::new("tHa[Nt]"), &b"<4>"[..]),
        (Regex::new("aND|caN|Ha[DS]|WaS"), &b"<3>"[..]),
        (Regex::new("a[NSt]|BY"), &b"<2>"[..]),
        (Regex::new("<[^>]*>"), &b"|"[..]),
        (Regex::new("\\|[^|][^|]*\\|"), &b"-"[..]),
    ];

    substs[0].0.replace_inplace(&mut buf, substs[0].1);
    substs[1].0.replace_inplace(&mut buf, substs[1].1);

    {
        // the length of tmp will be at most 1.5 * buf.len() bytes because
        // substs[2] replaces two characters with triple characters.
        let mut tmp = Vec::with_capacity(buf.len() * 3 / 2);
        substs[2].0.replace(&buf, substs[2].1, &mut tmp);
        mem::swap(&mut buf, &mut tmp);
    }

    substs[3].0.replace_inplace(&mut buf, substs[3].1);
    substs[4].0.replace_inplace(&mut buf, substs[4].1);

    buf.len()
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
        let m = left.min(60);
        for _ in 0..m {
            out.push(ALU[k]);
            k += 1;
            if k == ALU.len() { k = 0; }
        }
        out.push(b'\n');
        left -= m;
    }
    let mut seed: u32 = 42;
    let mut random = |out: &mut Vec<u8>, chars: &[u8], probs: &[f64], count: usize| {
        let mut cum = Vec::new();
        let mut c = 0.0;
        for p in probs { c += p; cum.push(c); }
        let mut left = count;
        while left > 0 {
            let m = left.min(60);
            for _ in 0..m {
                seed = (seed * 3877 + 29573) % 139968;
                let r = seed as f64 / 139968.0;
                let mut j = 0;
                while j < cum.len() - 1 && r >= cum[j] { j += 1; }
                out.push(chars[j]);
            }
            out.push(b'\n');
            left -= m;
        }
    };
    out.extend_from_slice(b">TWO IUB ambiguity codes\n");
    random(&mut out, b"acgtBDHKMNRSVWY", &[0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
    out.extend_from_slice(b">THREE Homo sapiens frequency\n");
    random(&mut out, b"acgt", &[0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
    out
}

fn fnv(mut h: u32, s: &[u8]) -> u32 {
    for &b in s {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

#[no_mangle]
pub extern "C" fn setup(n: i32) {
    unsafe { INPUT = fasta(n as usize); }
}

#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn bench(_n: i32) -> u32 {
    // (BG: read from stdin, with a capacity hint.)
    let mut input = unsafe { INPUT.clone() };
    let input_len = input.len();

    Regex::new(">[^\n]*\n|\n").replace_inplace(&mut input, b"");

    let sequence_len = input.len();

    let result = find_replaced_sequence_length(input.clone());
    let counts = count_reverse_complements(&input);

    let mut h = 2166136261u32;
    for variant in counts {
        h = fnv(h, format!("{}\n", variant).as_bytes());
    }
    h = fnv(h, format!("\n{}\n{}\n{:?}\n", input_len, sequence_len, result).as_bytes());
    h
}
