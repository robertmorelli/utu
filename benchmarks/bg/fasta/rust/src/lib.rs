// BG fasta Rust #7 (TeXitoi, Alisdair Owens, Ryohei Machida), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-rust-7.html
// Changes: single-threaded: fasta_random's loop runs once, on the calling thread
// (no rayon-less thread pool, spin locks or turn-taking; same blocks of LINES
// lines). The SSE2 gen_from_u32 is written on core::arch::wasm32 (i32x4_lt and
// i32x4_sub for _mm_cmplt_epi32 and _mm_sub_epi32). Writes to stdout -> out(),
// the output sink (here: FNV-1a over the bytes); main -> fasta(n) and bench(n).
// Programs that read fasta's output copy the block between the "fasta generator" markers
// and make out() append (scratchpad fasta-input.md).

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by the Rust Project Developers
// contributed by TeXitoi
// contributed by Alisdair Owens
// contributed by Ryohei Machida

use std::cmp;

// ---- output sink: what BG writes to stdout goes here
static mut HASH: u32 = 0;
fn out(data: &[u8]) {
    unsafe {
        let mut h = HASH;
        for &b in data {
            h ^= b as u32;
            h = h.wrapping_mul(16777619);
        }
        HASH = h;
    }
}

// ---- fasta generator: copy from here to "end of the fasta generator"
const LINE_LENGTH: usize = 60;
const IM: u32 = 139968;
const LINES: usize = 1024;
const BLKLEN: usize = LINE_LENGTH * LINES;

#[repr(align(32))]
#[derive(Clone)]
struct Aligned<T>(T);

#[derive(Clone)]
struct WeightedRandom<T> {
    cumprob: Aligned<[u32; 16]>,
    elements: [T; 16],
}

impl<T: Copy + Default> WeightedRandom<T> {
    fn from_slice(mapping: &[(T, f32)]) -> Self {
        assert!(0 < mapping.len());
        assert!(mapping.len() <= 16);
        let mut elements = [T::default(); 16];
        let mut cumprob = Aligned([i32::MAX as u32; 16]);
        let mut acc = 0.;

        for (i, map) in mapping.iter().enumerate() {
            elements[i] = map.0;
            acc += map.1;
            cumprob.0[i] = (acc * IM as f32).floor() as u32;
        }

        Self { elements, cumprob }
    }

    #[cfg(target_feature = "simd128")]
    #[inline(always)]
    fn gen_from_u32(&self, prob: u32) -> T {
        use core::arch::wasm32::*;

        // count elements in cumprob which satisfy `cumprob[i] < prob`
        unsafe {
            let needle = i32x4_splat(prob as i32);
            let ptr = self.cumprob.0.as_ptr();

            let vcp1 = v128_load(ptr as _);
            let vcp2 = v128_load(ptr.add(4) as _);
            let vcp3 = v128_load(ptr.add(8) as _);
            let vcp4 = v128_load(ptr.add(12) as _);

            let mut count = i32x4_splat(0);
            count = i32x4_sub(count, i32x4_lt(vcp1, needle));
            count = i32x4_sub(count, i32x4_lt(vcp2, needle));
            count = i32x4_sub(count, i32x4_lt(vcp3, needle));
            count = i32x4_sub(count, i32x4_lt(vcp4, needle));

            let idx = i32x4_extract_lane::<0>(count)
                + i32x4_extract_lane::<1>(count)
                + i32x4_extract_lane::<2>(count)
                + i32x4_extract_lane::<3>(count);
            *self.elements.get_unchecked(idx as usize)
        }
    }

    #[cfg(not(target_feature = "simd128"))]
    fn gen_from_u32(&self, prob: u32) -> T {
        let mut cnt = 0;

        for i in 0..16 {
            if self.cumprob.0[i] < prob {
                cnt += 1;
            }
        }

        self.elements[cnt]
    }
}

struct MyRandom {
    seed: u32,
    count: usize,
}

impl MyRandom {
    fn new(count: usize) -> MyRandom {
        MyRandom { seed: 42, count }
    }

    fn reset(&mut self, count: usize) {
        self.count = count;
    }

    // performance bottleneck
    fn gen(&mut self, buf: &mut [u32]) -> usize {
        let to_gen = cmp::min(buf.len(), self.count);
        for i in 0..to_gen {
            self.seed = (self.seed * 3877 + 29573) % IM;
            buf[i] = self.seed;
        }
        self.count -= to_gen;
        to_gen
    }
}

fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

fn fasta_repeat(seq: &[u8], n: usize) {
    let num_lines_per_buf = seq.len() / gcd(seq.len(), LINE_LENGTH);
    let buf_size = num_lines_per_buf * (LINE_LENGTH + 1);
    let mut buf = vec![0u8; buf_size];
    let mut n2 = n + n / LINE_LENGTH;

    // fill buf
    let mut it = seq.iter().copied().cycle();
    for i in 0..num_lines_per_buf {
        for j in 0..LINE_LENGTH {
            buf[i * (LINE_LENGTH + 1) + j] = it.next().unwrap();
        }
        buf[i * (LINE_LENGTH + 1) + LINE_LENGTH] = b'\n';
    }

    // write to stdout
    while n2 >= buf_size {
        out(buf.as_slice());
        n2 -= buf_size;
    }

    // trailing line feed
    if n % LINE_LENGTH != 0 {
        buf[n2] = b'\n';
        n2 += 1;
    }

    out(&buf[..n2]);
}

fn fasta_random(rng: &mut MyRandom, wr: WeightedRandom<u8>) {
    let mut rng_buf = vec![0u32; BLKLEN];
    let mut out_buf = vec![0u8; BLKLEN + LINES];
    loop {
        let count = rng.gen(&mut rng_buf);

        if count == 0 {
            break;
        }

        let rng_buf = &rng_buf[..count];

        let mut line_count = 0;
        for begin in (0..rng_buf.len()).step_by(LINE_LENGTH) {
            let end = cmp::min(begin + LINE_LENGTH, rng_buf.len());

            for j in begin..end {
                let rn = rng_buf[j];
                out_buf[j + line_count] = wr.gen_from_u32(rn);
            }

            out_buf[end + line_count] = b'\n';
            line_count += 1;
        }

        out(&out_buf[..(rng_buf.len() + line_count)]);
    }
}

fn fasta(n: usize) {
    // Homo sapiens alu
    {
        let alu: [u8; 287] = *b"GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTT\
                                GGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTC\
                                GAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACT\
                                AAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTG\
                                TAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCT\
                                TGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCG\
                                CCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTC\
                                TCAAAAA";

        out(b">ONE Homo sapiens alu\n");
        fasta_repeat(&alu, n * 2);
    }

    let mut rng = MyRandom::new(n * 3);

    // IUB ambiguity codes
    {
        let iub = WeightedRandom::from_slice(&[
            (b'a', 0.27),
            (b'c', 0.12),
            (b'g', 0.12),
            (b't', 0.27),
            (b'B', 0.02),
            (b'D', 0.02),
            (b'H', 0.02),
            (b'K', 0.02),
            (b'M', 0.02),
            (b'N', 0.02),
            (b'R', 0.02),
            (b'S', 0.02),
            (b'V', 0.02),
            (b'W', 0.02),
            (b'Y', 0.02),
        ]);

        out(b">TWO IUB ambiguity codes\n");
        fasta_random(&mut rng, iub);
    }

    rng.reset(n * 5);

    // Homo sapience frequency
    {
        let homosapiens = WeightedRandom::from_slice(&[
            (b'a', 0.3029549426680),
            (b'c', 0.1979883004921),
            (b'g', 0.1975473066391),
            (b't', 0.3015094502008),
        ]);

        out(b">THREE Homo sapiens frequency\n");
        fasta_random(&mut rng, homosapiens);
    }
}
// ---- end of the fasta generator

#[no_mangle]
pub extern "C" fn bench(n: i32) -> u32 {
    unsafe { HASH = 2166136261; }
    fasta(n as usize);
    unsafe { HASH }
}
