// Not on BG: AssemblyScript translated from BG nbody gcc #9 (Miles), the fastest
// source, which fits AssemblyScript (it has simd128 and raw memory):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/nbody-gcc-9.html
// Each __m256d (lanes 0, x, y, z) is two v128s, lo = (0, x) and hi = (y, z), and
// the AVX intrinsics are the functions below, as Emscripten's <immintrin.h>
// emulates them (_mm_rsqrt_ps is 1/sqrt in f32). The arrays live in static
// memory as in C. bench(n) builds the system, runs n steps, and returns the
// FNV-1a hash of the bytes gcc #9 prints ("%.9f\n" twice), hashed as formatted.

const N = 5;
const PAIRS = N * (N - 1) / 2;
const PI = 3.141592653589793;
const SOLAR_MASS = 4 * PI * PI;
const DAYS_PER_YEAR = 365.24;

// An __m256d at `a` is the v128s at a and a + 16.
const M = memory.data(N * 8, 16);              // double m[N]
const P = memory.data(N * 32, 16);             // __m256d p[N]
const V = memory.data(N * 32, 16);             // __m256d v[N]
const R = memory.data((PAIRS + 3) * 32, 16);   // __m256d r[PAIRS+3]
const W = memory.data((PAIRS + 3) * 8, 16);    // double w[PAIRS+3]
const RM = memory.data(N * 32, 16);            // __m256d rm[N]

@inline function lo(a: usize): v128 { return v128.load(a); }
@inline function hi(a: usize): v128 { return v128.load(a, 16); }
@inline function put(a: usize, l: v128, h: v128): void { v128.store(a, l); v128.store(a, h, 16); }
@inline function set1(a: usize, x: f64): void { const s = f64x2.splat(x); put(a, s, s); }
@inline function setr(a: usize, x0: f64, x1: f64, x2: f64, x3: f64): void {
  put(a, f64x2(x0, x1), f64x2(x2, x3));
}
@inline function hadd(a: v128, b: v128): v128 {
  return f64x2.add(v128.shuffle<f64>(a, b, 0, 2), v128.shuffle<f64>(a, b, 1, 3));
}
// _mm256_rsqrt_pd of the four doubles (l, h), stored at w.
@inline function rsqrt4(w: usize, sl: v128, sh: v128): void {
  let q = v128.shuffle<f64>(f32x4.demote_f64x2_zero(sl), f32x4.demote_f64x2_zero(sh), 0, 2);
  q = f32x4.div(f32x4.splat(1), f32x4.sqrt(q));
  const xl = f64x2.promote_low_f32x4(q), xh = f64x2.promote_low_f32x4(v128.shuffle<f64>(q, q, 1, 1));
  rsqrt2(w, sl, xl);
  rsqrt2(w + 16, sh, xh);
}
@inline function rsqrt2(w: usize, s: v128, x: v128): void {
  let y = f64x2.mul(f64x2.mul(s, x), x);
  let a = f64x2.mul(y, f64x2.splat(0.375));
  a = f64x2.mul(a, y);
  let b = f64x2.mul(y, f64x2.splat(1.25));
  b = f64x2.sub(b, f64x2.splat(1.875));
  y = f64x2.sub(a, b);
  v128.store(w, f64x2.mul(x, y));
}

// compute rsqrt of distance between each pair of bodies
@inline function kernel(): void {
  for (let i = 1, k = 0; i < N; i++)
    for (let j = 0; j < i; j++, k++) {
      const pi = P + i * 32, pj = P + j * 32;
      put(R + k * 32, f64x2.sub(lo(pi), lo(pj)), f64x2.sub(hi(pi), hi(pj)));
    }

  for (let k = 0; k < PAIRS; k += 4) {
    const r0 = R + k * 32, r1 = r0 + 32, r2 = r0 + 64, r3 = r0 + 96;
    const x0l = f64x2.mul(lo(r0), lo(r0)), x0h = f64x2.mul(hi(r0), hi(r0));
    const x1l = f64x2.mul(lo(r1), lo(r1)), x1h = f64x2.mul(hi(r1), hi(r1));
    const x2l = f64x2.mul(lo(r2), lo(r2)), x2h = f64x2.mul(hi(r2), hi(r2));
    const x3l = f64x2.mul(lo(r3), lo(r3)), x3h = f64x2.mul(hi(r3), hi(r3));

    // t0 = hadd(x0, x1), t1 = hadd(x2, x3)
    const t0l = hadd(x0l, x1l), t0h = hadd(x0h, x1h);
    const t1l = hadd(x2l, x3l), t1h = hadd(x2h, x3h);
    // y0 = permute2f128(t0, t1, 0x21) = (t0.hi, t1.lo); y1 = blend(t0, t1, 0b1100) = (t0.lo, t1.hi)
    // z = y0 + y1
    rsqrt4(W + k * 8, f64x2.add(t0h, t0l), f64x2.add(t1l, t1h));
  }
}

function energy(): f64 {
  let e = 0.0;

  set1(R + N * 32, 0.0);
  set1(R + (N + 1) * 32, 0.0);
  set1(R + (N + 2) * 32, 0.0);

  for (let k = 0; k < N; k++) {
    const vk = V + k * 32;
    put(R + k * 32, f64x2.mul(lo(vk), lo(vk)), f64x2.mul(hi(vk), hi(vk)));
  }

  for (let k = 0; k < N; k += 4) {
    const r0 = R + k * 32, r1 = r0 + 32, r2 = r0 + 64, r3 = r0 + 96;
    const t0l = hadd(lo(r0), lo(r1)), t0h = hadd(hi(r0), hi(r1));
    const t1l = hadd(lo(r2), lo(r3)), t1h = hadd(hi(r2), hi(r3));
    put(W + k * 8, f64x2.add(t0h, t0l), f64x2.add(t1l, t1h));
  }

  for (let k = 0; k < N; k++)
    e += 0.5 * load<f64>(M + k * 8) * load<f64>(W + k * 8);

  set1(R + PAIRS * 32, 1.0);
  set1(R + (PAIRS + 1) * 32, 1.0);
  set1(R + (PAIRS + 2) * 32, 1.0);

  kernel();

  for (let i = 1, k = 0; i < N; i++)
    for (let j = 0; j < i; j++, k++)
      e -= load<f64>(M + i * 8) * load<f64>(M + j * 8) * load<f64>(W + k * 8);

  return e;
}

function advance(n: i32, dt: f64): void {
  set1(R + PAIRS * 32, 1.0);
  set1(R + (PAIRS + 1) * 32, 1.0);
  set1(R + (PAIRS + 2) * 32, 1.0);

  const rt = f64x2.splat(dt);

  for (let i = 0; i < N; i++) set1(RM + i * 32, load<f64>(M + i * 8));

  for (let s = 0; s < n; s++) {
    kernel();

    for (let k = 0; k < PAIRS; k += 2) {
      const x = v128.load(W + k * 8);
      const y = f64x2.mul(x, x);
      const z = f64x2.mul(x, rt);
      v128.store(W + k * 8, f64x2.mul(y, z));
    }

    for (let i = 1, k = 0; i < N; i++)
      for (let j = 0; j < i; j++, k++) {
        const t = f64x2.splat(load<f64>(W + k * 8));
        const rk = R + k * 32, vi = V + i * 32, vj = V + j * 32;
        const tl = f64x2.mul(lo(rk), t), th = f64x2.mul(hi(rk), t);
        const mj = lo(RM + j * 32), mi = lo(RM + i * 32);
        put(vi, f64x2.sub(lo(vi), f64x2.mul(tl, mj)), f64x2.sub(hi(vi), f64x2.mul(th, mj)));
        put(vj, f64x2.add(lo(vj), f64x2.mul(tl, mi)), f64x2.add(hi(vj), f64x2.mul(th, mi)));
      }

    for (let i = 0; i < N; i++) {
      const pi = P + i * 32, vi = V + i * 32;
      put(pi, f64x2.add(lo(pi), f64x2.mul(lo(vi), rt)), f64x2.add(hi(pi), f64x2.mul(hi(vi), rt)));
    }
  }
}

@inline function fnv(h: u32, byte: u32): u32 { return (h ^ byte) * 16777619; }

// Hashes the bytes of "%.9f\n" for x: x rounded to nanos, then the digits.
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
  // sun
  store<f64>(M, SOLAR_MASS);
  set1(P, 0.0);
  set1(V, 0.0);

  // jupiter
  store<f64>(M + 8, 9.54791938424326609e-04 * SOLAR_MASS);
  setr(P + 32, 0.0, 4.84143144246472090e+00, -1.16032004402742839e+00, -1.03622044471123109e-01);
  setr(V + 32, 0.0, 1.66007664274403694e-03 * DAYS_PER_YEAR, 7.69901118419740425e-03 * DAYS_PER_YEAR, -6.90460016972063023e-05 * DAYS_PER_YEAR);

  // saturn
  store<f64>(M + 16, 2.85885980666130812e-04 * SOLAR_MASS);
  setr(P + 64, 0.0, 8.34336671824457987e+00, 4.12479856412430479e+00, -4.03523417114321381e-01);
  setr(V + 64, 0.0, -2.76742510726862411e-03 * DAYS_PER_YEAR, 4.99852801234917238e-03 * DAYS_PER_YEAR, 2.30417297573763929e-05 * DAYS_PER_YEAR);

  // uranus
  store<f64>(M + 24, 4.36624404335156298e-05 * SOLAR_MASS);
  setr(P + 96, 0.0, 1.28943695621391310e+01, -1.51111514016986312e+01, -2.23307578892655734e-01);
  setr(V + 96, 0.0, 2.96460137564761618e-03 * DAYS_PER_YEAR, 2.37847173959480950e-03 * DAYS_PER_YEAR, -2.96589568540237556e-05 * DAYS_PER_YEAR);

  // neptune
  store<f64>(M + 32, 5.15138902046611451e-05 * SOLAR_MASS);
  setr(P + 128, 0.0, 1.53796971148509165e+01, -2.59193146099879641e+01, 1.79258772950371181e-01);
  setr(V + 128, 0.0, 2.68067772490389322e-03 * DAYS_PER_YEAR, 1.62824170038242295e-03 * DAYS_PER_YEAR, -9.51592254519715870e-05 * DAYS_PER_YEAR);

  // offset momentum
  let ol = f64x2.splat(0), oh = f64x2.splat(0);
  for (let i = 0; i < N; i++) {
    const m = f64x2.splat(load<f64>(M + i * 8)), vi = V + i * 32;
    ol = f64x2.add(ol, f64x2.mul(m, lo(vi)));
    oh = f64x2.add(oh, f64x2.mul(m, hi(vi)));
  }
  const k = f64x2.splat(-1.0 / SOLAR_MASS);
  put(V, f64x2.mul(ol, k), f64x2.mul(oh, k));

  let h = fnvFixed9(2166136261, energy());
  advance(n, 0.01);
  return fnvFixed9(h, energy());
}
