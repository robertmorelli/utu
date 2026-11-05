// Not on BG: AssemblyScript translated from BG mandelbrot gcc #6 (Kevin Miller):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-gcc-6.html
// C's __m128d is v128 (f64x2); mand8's arrays of four pairs r[4], i[4], sum[4]
// are four v128 locals each (C's loops over `pair`, unrolled as gcc does);
// 64 pixels (a u64) at a time when the width is a multiple of 64, else 8. One
// thread (C used OpenMP). bench(n) returns the FNV-1a hash of the bytes C writes:
// "P4\n<n> <n>\n" and the bitmap.

// @ts-nocheck

// 8 iterations of C's calcSum on the four pairs, keeping the last sums.
@inline function nle(s0: v128, s1: v128, s2: v128, s3: v128): bool {
  const f = f64x2.splat(4.0);
  // C's vec_nle: no lane <= 4.0
  return !v128.any_true(v128.or(v128.or(f64x2.le(s0, f), f64x2.le(s1, f)), v128.or(f64x2.le(s2, f), f64x2.le(s3, f))));
}

let r0: v128, r1: v128, r2: v128, r3: v128;
let i0: v128, i1: v128, i2: v128, i3: v128;
let s0: v128, s1: v128, s2: v128, s3: v128;

@inline function calcSum(c0: v128, c1: v128, c2: v128, c3: v128, ci: v128): void {
  let a = f64x2.mul(r0, r0), b = f64x2.mul(i0, i0), c = f64x2.mul(r0, i0);
  s0 = f64x2.add(a, b); r0 = f64x2.add(f64x2.sub(a, b), c0); i0 = f64x2.add(f64x2.add(c, c), ci);
  a = f64x2.mul(r1, r1); b = f64x2.mul(i1, i1); c = f64x2.mul(r1, i1);
  s1 = f64x2.add(a, b); r1 = f64x2.add(f64x2.sub(a, b), c1); i1 = f64x2.add(f64x2.add(c, c), ci);
  a = f64x2.mul(r2, r2); b = f64x2.mul(i2, i2); c = f64x2.mul(r2, i2);
  s2 = f64x2.add(a, b); r2 = f64x2.add(f64x2.sub(a, b), c2); i2 = f64x2.add(f64x2.add(c, c), ci);
  a = f64x2.mul(r3, r3); b = f64x2.mul(i3, i3); c = f64x2.mul(r3, i3);
  s3 = f64x2.add(a, b); r3 = f64x2.add(f64x2.sub(a, b), c3); i3 = f64x2.add(f64x2.add(c, c), ci);
}

@inline function bit(v: v128, lane: i32, mask: u64, pix8: u64): u64 {
  const x = lane ? f64x2.extract_lane(v, 1) : f64x2.extract_lane(v, 0);
  return !(x <= 4.0) ? pix8 & mask : pix8;
}

function mand8(initR: usize, ci: v128): u64 {
  const c0 = v128.load(initR), c1 = v128.load(initR, 16), c2 = v128.load(initR, 32), c3 = v128.load(initR, 48);
  r0 = c0; r1 = c1; r2 = c2; r3 = c3;
  i0 = ci; i1 = ci; i2 = ci; i3 = ci;
  let pix8: u64 = 0xff;
  for (let j = 0; j < 6; j++) {
    for (let k = 0; k < 8; k++) calcSum(c0, c1, c2, c3, ci);
    if (nle(s0, s1, s2, s3)) { pix8 = 0x00; break; }
  }
  if (pix8) {
    calcSum(c0, c1, c2, c3, ci);
    calcSum(c0, c1, c2, c3, ci);
    pix8 = bit(s0, 0, 0x7f, pix8); pix8 = bit(s0, 1, 0xbf, pix8);
    pix8 = bit(s1, 0, 0xdf, pix8); pix8 = bit(s1, 1, 0xef, pix8);
    pix8 = bit(s2, 0, 0xf7, pix8); pix8 = bit(s2, 1, 0xfb, pix8);
    pix8 = bit(s3, 0, 0xfd, pix8); pix8 = bit(s3, 1, 0xfe, pix8);
  }
  return pix8;
}

function mand64(initR: usize, ci: v128): u64 {
  let pix64: u64 = 0;
  for (let byte = 0; byte < 8; byte++) {
    const pix8 = mand8(initR, ci);
    pix64 = (pix64 >> 8) | (pix8 << 56);
    initR += 64;
  }
  return pix64;
}

@inline function fnv(h: u32, byte: u32): u32 { return (h ^ byte) * 16777619; }

function fnvInt(h: u32, x: i32): u32 {
  let p = 1;
  while (p * 10 <= x) p *= 10;
  for (; p > 0; p /= 10) h = fnv(h, 48 + x / p % 10);
  return h;
}

export function bench(n: i32): u32 {
  const wid = (n + 7) & ~7;
  const r0s = new StaticArray<v128>(wid >> 1);
  const i0s = new StaticArray<f64>(wid);
  for (let xy = 0; xy < wid; xy += 2) {
    unchecked(r0s[xy >> 1] = f64x2.sub(f64x2.mul(f64x2.splat(2.0 / wid), f64x2(<f64>xy, <f64>(xy + 1))), f64x2.splat(1.5)));
    unchecked(i0s[xy] = 2.0 / wid * xy - 1.0);
    unchecked(i0s[xy + 1] = 2.0 / wid * (xy + 1) - 1.0);
  }
  const pixels = new StaticArray<u8>(wid * (wid >> 3));
  const pix = changetype<usize>(pixels), r0p = changetype<usize>(r0s);
  if (wid % 64) {
    for (let y = 0; y < wid; y++) {
      const ci = f64x2.splat(unchecked(i0s[y]));
      const rowstart = y * wid / 8;
      for (let x = 0; x < wid; x += 8) store<u8>(pix + rowstart + x / 8, <u8>mand8(r0p + (x / 2 << 4), ci));
    }
  } else {
    for (let y = 0; y < wid; y++) {
      const ci = f64x2.splat(unchecked(i0s[y]));
      const rowstart = y * wid / 64;
      for (let x = 0; x < wid; x += 64) store<u64>(pix + ((rowstart + x / 64) << 3), mand64(r0p + (x / 2 << 4), ci));
    }
  }
  // "P4\n<wid> <wid>\n" and the bitmap
  let h: u32 = fnv(fnv(fnv(2166136261, 80), 52), 10);
  h = fnv(fnvInt(fnv(fnvInt(h, wid), 32), wid), 10);
  for (let i = 0; i < pixels.length; i++) h = fnv(h, unchecked(pixels[i]));
  return h;
}
