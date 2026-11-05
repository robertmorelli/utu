// BG revcomp Rust #1 (Ryohei Machida), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-rust-1.html
// Changes: single-threaded: rayon::scope's spawns run in place, in order (same
// blocks). The SSSE3 module (BG builds for ivybridge) is written on
// core::arch::wasm32: _mm_shuffle_epi8 as Emscripten emulates it (i8x16_swizzle of
// the index & 0x8F, so a set high bit gives 0), the rest one to one; built with
// +simd128 and selected by it. stdin -> the fasta output setup(n) generated (a
// &[u8], which implements Read: reads copy from it as from stdin); stdout -> FNV-1a
// over what is written. setup(n) runs fasta Rust #7's generator (below) with out()
// appending to the input. main -> bench(n), which returns the hash.


// The Computer Language Benchmarks Game
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/
//
// Contributed by Ryohei Machida
// Inspired by C++ #2 implementation Adam Kewley

extern crate memchr;

use memchr::memchr;
use std::cmp;
use std::io::{self, Read};

const READ_SIZE: usize = 1 << 16;

/// Length of a normal line including the terminating \n.
const LINE_LEN: usize = 60;
/// Maximum number of rows to process in serial.
const BLOCK_ROWS: usize = 4096;

#[rustfmt::skip]
static KNUCLEOTIDE_MAPPING: &[u8; 256] = b"\
    \0\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\
    \x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\
    \x20!\"#$%&'()*+,-./\
    0123456789:;<=>?\
    @TVGHEFCDIJMLKNO\
    PQYSAABWXRZ[\\]^_\
    `TVGHefCDijMlKNo\
    pqYSAABWxRz{|}~\x7f\
    \x80\x81\x82\x83\x84\x85\x86\x87\x88\x89\x8a\x8b\x8c\x8d\x8e\x8f\
    \x90\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9a\x9b\x9c\x9d\x9e\x9f\
    \xa0\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xad\xae\xaf\
    \xb0\xb1\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xbb\xbc\xbd\xbe\xbf\
    \xc0\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf\
    \xd0\xd1\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xdb\xdc\xdd\xde\xdf\
    \xe0\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef\
    \xf0\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff";

#[cfg(target_feature = "simd128")]
mod ssse3 {
    // The SSE intrinsics used, on wasm simd128 (as Emscripten's <immintrin.h>).
    #[allow(non_camel_case_types)]
    type __m128i = core::arch::wasm32::v128;
    mod sse {
        use core::arch::wasm32::*;
        #[inline(always)] pub unsafe fn _mm_shuffle_epi8(a: v128, b: v128) -> v128 { i8x16_swizzle(a, v128_and(b, i8x16_splat(0x8f_u8 as i8))) }
        #[rustfmt::skip]
        #[inline(always)] pub unsafe fn _mm_set_epi8(e15: i8, e14: i8, e13: i8, e12: i8, e11: i8, e10: i8, e9: i8, e8: i8, e7: i8, e6: i8, e5: i8, e4: i8, e3: i8, e2: i8, e1: i8, e0: i8) -> v128 { i8x16(e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12, e13, e14, e15) }
        #[inline(always)] pub unsafe fn _mm_set1_epi8(a: i8) -> v128 { i8x16_splat(a) }
        #[inline(always)] pub unsafe fn _mm_and_si128(a: v128, b: v128) -> v128 { v128_and(a, b) }
        #[inline(always)] pub unsafe fn _mm_or_si128(a: v128, b: v128) -> v128 { v128_or(a, b) }
        #[inline(always)] pub unsafe fn _mm_add_epi8(a: v128, b: v128) -> v128 { i8x16_add(a, b) }
        #[inline(always)] pub unsafe fn _mm_sub_epi8(a: v128, b: v128) -> v128 { i8x16_sub(a, b) }
        #[inline(always)] pub unsafe fn _mm_lddqu_si128(p: *const v128) -> v128 { v128_load(p) }
        #[inline(always)] pub unsafe fn _mm_storeu_si128(p: *mut v128, a: v128) { v128_store(p, a) }
    }
    use sse::*;

    use super::KNUCLEOTIDE_MAPPING;

    /// reverse bytes and complement each byte
    #[rustfmt::skip]
    unsafe fn reverse_chunks_simd(mut v: __m128i) -> __m128i {
        v = _mm_shuffle_epi8(
            v,
            _mm_set_epi8(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
        );
        v = _mm_and_si128(v, _mm_set1_epi8(0x1f));

        let lt16_els = _mm_add_epi8(v, _mm_set1_epi8(0x70));
        let lt16_lut = _mm_set_epi8(
            0,          78 /* N */, 75 /* K */, 0,
            77 /* M */, 10,         0,          68 /* D */,
            67 /* C */, 0,          0,          72 /* H */,
            71 /* G */, 86 /* V */, 84 /* T */, 0,
        );
        let lt16_vals = _mm_shuffle_epi8(lt16_lut, lt16_els);

        let g16_els = _mm_sub_epi8(v, _mm_set1_epi8(0x10));
        let g16_lut = _mm_set_epi8(
            0,          0,          0,          0,
            0,          0,          82 /* R */, 0,
            87 /* W */, 66 /* B */, 65 /* A */, 65 /* A */,
            83 /* S */, 89 /* Y */, 0,          0,
        );
        let g16_vals = _mm_shuffle_epi8(g16_lut, g16_els);

        return _mm_or_si128(lt16_vals, g16_vals);
    }

    pub fn reverse_chunks(left: &mut [u8], right: &mut [u8]) {
        debug_assert_eq!(left.len(), right.len());

        unsafe {
            let mut len = left.len();
            let mut pl = left.as_mut_ptr();
            let mut pr = right.as_mut_ptr().add(right.len());

            while len >= 16 {
                pr = pr.sub(16);
                let l = _mm_lddqu_si128(pl as _);
                let r = _mm_lddqu_si128(pr as _);
                _mm_storeu_si128(pr as _, reverse_chunks_simd(l));
                _mm_storeu_si128(pl as _, reverse_chunks_simd(r));
                pl = pl.add(16);

                len -= 16;
            }

            for _ in 0..len {
                pr = pr.sub(1);
                let l = *pl;
                let r = *pr;
                *pr = KNUCLEOTIDE_MAPPING[l as usize];
                *pl = KNUCLEOTIDE_MAPPING[r as usize];
                pl = pl.add(1);
            }
        }
    }
}

#[cfg(target_feature = "simd128")]
use ssse3::*;

#[cfg(not(target_feature = "simd128"))]
mod fallback {
    use super::KNUCLEOTIDE_MAPPING;

    pub fn reverse_chunks(left: &mut [u8], right: &mut [u8]) {
        for (pl, pr) in left.iter_mut().zip(right.iter_mut().rev()) {
            let l = *pl;
            let r = *pr;
            *pr = KNUCLEOTIDE_MAPPING[l as usize];
            *pl = KNUCLEOTIDE_MAPPING[r as usize];
        }
    }
}

#[cfg(not(target_feature = "simd128"))]
use fallback::*;

struct Sequence<'a> {
    buf: &'a mut [u8],
    content_offset: usize,
}

impl<'a> Sequence<'a> {
    fn from_slice(data: &'a mut [u8]) -> Option<Sequence<'a>> {
        match memchr(b'\n', data) {
            Some(pos) => Some(Sequence { buf: data, content_offset: pos + 1 }),
            None => None,
        }
    }

    fn as_slice(&self) -> &[u8] {
        self.buf
    }

    fn get_content_mut(&mut self) -> &mut [u8] {
        // remove header and last character (\n)
        let end = self.buf.len() - 1;
        &mut self.buf[self.content_offset..end]
    }

    /// reverse and complement the whole sequence
    fn reverse_complement(&mut self) {
        let mut content = self.get_content_mut();
        let block_bytes = BLOCK_ROWS * (LINE_LEN + 1);
        let trailing_len = content.len() % (LINE_LEN + 1);

        while content.len() >= block_bytes * 2 {
            let (left, tmp) = content.split_at_mut(block_bytes);
            let (inner, right) = tmp.split_at_mut(tmp.len() - block_bytes);
            content = inner;

            reverse_complement_left_right(left, right, trailing_len);
        }

        let n = content.len() / 2;
        let (left, right) = content.split_at_mut(n);
        reverse_complement_left_right(left, right, trailing_len);
    }
}

fn reverse_complement_left_right(
    mut left: &mut [u8],
    mut right: &mut [u8],
    trailing_len: usize,
) {
    debug_assert!(left.len() <= right.len());
    debug_assert!(right.len() <= left.len() + 1);

    while left.len() >= trailing_len {
        let (n, m) = (trailing_len, right.len() - trailing_len);
        let (a, left_) = left.split_at_mut(n);
        let (right_, b) = right.split_at_mut(m);
        left = left_;
        right = &mut right_[..m - 1];

        reverse_chunks(a, b);

        let n = LINE_LEN - trailing_len;
        if right.len() <= n {
            break;
        }
        let m = right.len() - n;
        let (a, left_) = left.split_at_mut(n);
        let (right_, b) = right.split_at_mut(m);
        left = &mut left_[1..];
        right = right_;

        reverse_chunks(a, b);
    }

    let n = cmp::min(left.len(), right.len());
    let m = right.len() - n;
    reverse_chunks(&mut left[..n], &mut right[m..]);

    // character at the middle of sequence
    let mid = if left.len() > right.len() {
        left.last_mut().unwrap()
    } else if right.len() > left.len() {
        right.first_mut().unwrap()
    } else {
        return;
    };

    *mid = KNUCLEOTIDE_MAPPING[*mid as usize];
}

/// Scan stdin directly into the growing buffer
struct SequenceReader<R: Read> {
    inner: R,
    buf: Vec<u8>,
    next_pos: usize,
    eof_reached: bool,
}

impl<R: Read> SequenceReader<R> {
    fn new(inner: R) -> Self {
        SequenceReader {
            inner,
            buf: Vec::new(),
            next_pos: 0,
            eof_reached: false,
        }
    }

    fn next(&mut self) -> Option<io::Result<Sequence<'_>>> {
        // scan in buffer first
        if !self.buf.is_empty() {
            if self.next_pos >= self.buf.len() {
                return None;
            }

            // remove current sequence (first `self.next_pos` bytes)
            self.buf.copy_within(self.next_pos.., 0);
            self.buf.truncate(self.buf.len() - self.next_pos);

            // find next header in buffer
            let next_header_pos = match memchr(b'>', &self.buf[1..]) {
                Some(pos) => Some(pos + 1),
                None if self.eof_reached => Some(self.buf.len()),
                None => None,
            };

            if let Some(pos) = next_header_pos {
                self.next_pos = pos;
                return Some(Ok(
                    Sequence::from_slice(&mut self.buf[..pos]).unwrap()
                ));
            }
        }

        self.buf.reserve(READ_SIZE);

        loop {
            let old_len = self.buf.len();

            // read at most READ_SIZE bytes
            let mut reader = self.inner.by_ref().take(READ_SIZE as u64);
            let read_len = match reader.read_to_end(&mut self.buf) {
                Ok(n) => n,
                Err(e) => {
                    self.eof_reached = true;
                    return Some(Err(e));
                }
            };

            self.eof_reached = read_len != READ_SIZE;

            // find next header
            let offset = cmp::min(cmp::max(old_len, 1), self.buf.len());
            self.next_pos = match memchr(b'>', &self.buf[offset..]) {
                None if !self.eof_reached => continue,
                Some(pos) => offset + pos,
                None => self.buf.len(),
            };

            // if next header is found, return the slice to current buffer
            return Some(Ok(Sequence::from_slice(
                &mut self.buf[..self.next_pos],
            )
            .unwrap()));
        }
    }
}

// ---- input: the fasta output setup(n) generates
static mut INPUT: Vec<u8> = Vec::new();
fn out(data: &[u8]) {
    unsafe { (*std::ptr::addr_of_mut!(INPUT)).extend_from_slice(data) }
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
pub extern "C" fn setup(n: i32) {
    unsafe { (*std::ptr::addr_of_mut!(INPUT)).clear() }
    fasta(n as usize);
}

fn write_out(h: &mut u32, data: &[u8]) {
    for &b in data {
        *h ^= b as u32;
        *h = h.wrapping_mul(16777619);
    }
}

#[no_mangle]
pub extern "C" fn bench(_n: i32) -> u32 {
    let stdin: &[u8] = unsafe { &*std::ptr::addr_of!(INPUT) };
    let mut hash = 2166136261u32;

    let mut reader = SequenceReader::new(stdin);

    while let Some(seq) = reader.next() {
        let mut seq = seq.unwrap();
        seq.reverse_complement();
        write_out(&mut hash, seq.as_slice());
    }

    hash
}
