// Not on BG: AssemblyScript translated from BG fannkuch-redux gcc #6 (Ilya
// Kurdyukov), the fastest source, which fits AssemblyScript (simd128, raw memory):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-gcc-6.html
// Single-threaded: one walk over the 24 blocks. The SSE intrinsics are the
// functions below, as Emscripten's <smmintrin.h> emulates them (pshufb is
// i8x16.swizzle of the index & 0x8F; blendv is bitselect on the sign).
// masks_shift and factorials live in static memory as in C. bench(n) returns the
// FNV-1a hash of the bytes gcc #6 prints.

const MAX_N = 16;
const MAX_BLOCKS: u64 = 24;

const MASKS_SHIFT = memory.data(16 * 16, 16);   // __m128i masks_shift[16]
const FACTORIALS = memory.data((MAX_N + 1) * 8, 8); // uint64_t factorials[MAX_N + 1]

@inline function fact(i: i32): u64 { return load<u64>(FACTORIALS + (<usize>i << 3)); }
@inline function shuffle_epi8(a: v128, b: v128): v128 { return i8x16.swizzle(a, v128.and(b, i8x16.splat(<i8>0x8F))); }
@inline function blendv_epi8(a: v128, b: v128, mask: v128): v128 { return v128.bitselect(b, a, i8x16.shr_s(mask, 7)); }
// _mm_alignr_epi8(a, b, 15): b's last byte, then a's first 15.
@inline function alignr15(a: v128, b: v128): v128 { return i8x16.shuffle(b, a, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30); }
@inline function andnot(a: v128, b: v128): v128 { return v128.andnot(b, a); }  // ~a & b
@inline function cvtsi128_si32(a: v128): u32 { return <u32>i32x4.extract_lane(a, 0); }

let checksum: i64 = 0;
let max_flips: u32 = 0;

function fannkuch_func(n: i32, block_size: u64, block_end: u64): void {
  let checksum: i64 = 0;
  let max_flips: u32 = 0;
  const c0 = i8x16.splat(0);
  const ramp = i8x16(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);

  // iterate over each block.
  for (let block_start: u64 = 0; block_start < block_end; block_start += block_size) {
    let current = ramp;
    let count_vec = c0;
    let i = n;
    {
      let j = block_start;
      let v0: v128, v1: v128, v2: v128, mask: v128;
      const c1 = i8x16.splat(1);
      mask = i8x16.sub(ramp, i8x16.splat(<i8>i));
      while (i--) {
        const d = j / fact(i);
        j -= d * fact(i);
        v2 = i8x16.splat(<i8>d);
        count_vec = alignr15(count_vec, v2);
        v1 = i8x16.add(ramp, v2);
        v0 = i8x16.add(mask, v2);  // ramp - i + d
        v0 = blendv_epi8(v0, v1, v0);
        v2 = shuffle_epi8(current, v0);
        current = blendv_epi8(current, v2, mask);
        mask = i8x16.add(mask, c1);
      }
    }

    // iterate over each permutation in the block.
    let block_left = block_size;
    let odd = false;
    while (true) {
      let v2 = current;
      let first = cvtsi128_si32(current);
      let v0 = i8x16.sub(count_vec, ramp);
      const k = ctz(i8x16.bitmask(v0));
      v0 = i8x16.splat(<i8>k);
      const v1 = andnot(i8x16.gt_s(v0, ramp), count_vec);
      count_vec = i8x16.sub(v1, i8x16.eq(v0, ramp));
      current = shuffle_epi8(current, v128.load(MASKS_SHIFT + (<usize>k << 4)));
      if (first & 0xff) {
        let flips: u32 = 0;
        let v3 = shuffle_epi8(v2, c0);
        do {
          v0 = i8x16.sub(v3, ramp);
          v3 = shuffle_epi8(v2, v3);
          v0 = blendv_epi8(v0, ramp, v0);
          v2 = shuffle_epi8(v2, v0);
          first = cvtsi128_si32(v3);
          flips++;
        } while (first & 0xff);
        if (odd) checksum -= flips; else checksum += flips;
        if (flips > max_flips) max_flips = flips;
      }
      // C: X(+=) if (block_left == 1) break; X(-=) } while (block_left -= 2);
      if (odd) {
        block_left -= 2;
        if (block_left == 0) break;
      } else if (block_left == 1) break;
      odd = !odd;
    }
  }
  // (single-threaded: the reductions are plain)
  reduce(checksum, max_flips);
}

@inline function reduce(c: i64, m: u32): void {
  checksum += c;
  if (max_flips < m) max_flips = m;
}

function fnv(h: u32, s: string): u32 {
  for (let i = 0; i < s.length; i++) h = (h ^ <u32>s.charCodeAt(i)) * 16777619;
  return h;
}

export function bench(n: i32): u32 {
  let tmp: u64 = 1;
  const ramp = i8x16(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
  const c1 = i8x16.splat(1);
  const ramp1 = i8x16.shuffle(ramp, i8x16.splat(0), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);  // _mm_bsrli_si128(ramp, 1)
  let old = ramp;
  store<u64>(FACTORIALS, 1);
  let v0 = i8x16.sub(i8x16.splat(0), ramp);
  for (let i = 0; i < MAX_N; v0 = i8x16.add(v0, c1)) {
    const v2 = blendv_epi8(v0, ramp, v0);
    const v1 = blendv_epi8(ramp1, v2, i8x16.sub(v0, c1));
    old = shuffle_epi8(old, v1);
    v128.store(MASKS_SHIFT + (<usize>i << 4), old);
    tmp *= <u64>(++i);
    store<u64>(FACTORIALS + (<usize>i << 3), tmp);
  }

  checksum = 0;
  max_flips = 0;
  if (n < 1 || n > MAX_N) return 1;
  const block_end = fact(n);
  const block_size = block_end / (block_end > MAX_BLOCKS ? MAX_BLOCKS : 1);
  fannkuch_func(n, block_size, block_end);
  return fnv(2166136261, checksum.toString() + "\nPfannkuchen(" + n.toString() + ") = " + max_flips.toString() + "\n");
}
