// Not on BG: AssemblyScript translated from BG spectralnorm Rust #6 (Cobzarenco,
// Bogus et al.), whose F64x2 maps onto AssemblyScript's v128:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-rust-6.html
// Vectors are StaticArray<v128> of pairs; each output pair's two sums are f64x2
// accumulators of x / a(i, j) over the input pairs, then hadd. One thread (Rust
// used rayon). bench(n) returns the FNV-1a hash of "%.9f\n" (formatted by hand).

// @ts-nocheck

@inline function a(i0: i32, i1: i32, j0: i32, j1: i32): v128 {
  return f64x2(
    <f64>(((i0 + j0) * (i0 + j0 + 1) >>> 1) + i0 + 1),
    <f64>(((i1 + j1) * (i1 + j1 + 1) >>> 1) + i1 + 1));
}

@inline function hadd(a: v128, b: v128): v128 {
  return f64x2.add(v128.shuffle<i64>(a, b, 0, 2), v128.shuffle<i64>(a, b, 1, 3));
}

function mult(v: StaticArray<v128>, out: StaticArray<v128>, transpose: bool): void {
  const m = v.length;
  for (let k = 0; k < out.length; k++) {
    const i = 2 * k;
    let sum0 = f64x2.splat(0), sum1 = f64x2.splat(0);
    for (let jj = 0; jj < m; jj++) {
      const x = unchecked(v[jj]);
      const j = 2 * jj;
      if (transpose) {
        sum0 = f64x2.add(sum0, f64x2.div(x, a(j, j + 1, i, i)));
        sum1 = f64x2.add(sum1, f64x2.div(x, a(j, j + 1, i + 1, i + 1)));
      } else {
        sum0 = f64x2.add(sum0, f64x2.div(x, a(i, i, j, j + 1)));
        sum1 = f64x2.add(sum1, f64x2.div(x, a(i + 1, i + 1, j, j + 1)));
      }
    }
    unchecked(out[k] = hadd(sum0, sum1));
  }
}

function multAtAv(v: StaticArray<v128>, out: StaticArray<v128>, tmp: StaticArray<v128>): void {
  mult(v, tmp, false);
  mult(tmp, out, true);
}

function dot(v: StaticArray<v128>, u: StaticArray<v128>): f64 {
  let r = f64x2.splat(0);
  for (let i = 0; i < v.length; i++) r = f64x2.add(r, f64x2.mul(unchecked(u[i]), unchecked(v[i])));
  return f64x2.extract_lane(r, 0) + f64x2.extract_lane(r, 1);
}

function spectralnorm(n: i32): f64 {
  const h = n / 2;
  const u = new StaticArray<v128>(h), v = new StaticArray<v128>(h), tmp = new StaticArray<v128>(h);
  for (let i = 0; i < h; i++) u[i] = f64x2.splat(1);
  for (let i = 0; i < 10; i++) {
    multAtAv(u, v, tmp);
    multAtAv(v, u, tmp);
  }
  return Math.sqrt(dot(u, v) / dot(v, v));
}

@inline function fnv(h: u32, byte: u32): u32 { return (h ^ byte) * 16777619; }

// "%.9f": x rounded to nanos, then the digits.
function fnvFixed9(h: u32, x: f64): u32 {
  if (x < 0) h = fnv(h, 45); // '-'
  const nanos = <u64>Math.floor(Math.abs(x) * 1e9 + 0.5);
  const whole = nanos / 1000000000, frac = nanos % 1000000000;
  let p: u64 = 1;
  while (p * 10 <= whole) p *= 10;
  for (; p > 0; p /= 10) h = fnv(h, 48 + <u32>(whole / p % 10));
  h = fnv(h, 46); // '.'
  for (let d: u64 = 100000000; d > 0; d /= 10) h = fnv(h, 48 + <u32>(frac / d % 10));
  return fnv(h, 10);
}

export function bench(n: i32): u32 {
  return fnvFixed9(2166136261, spectralnorm(n));
}
