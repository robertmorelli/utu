// Not on BG: MoonBit translated from BG spectralnorm Node #6 (Ian Osgood, Roy
// Williams, Isaac Gouy, Andrey Filatkin), the scalar algorithm (MoonBit has no SIMD):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-node-6.html
// One thread: au/atu over all rows. bench(n) returns the FNV-1a hash of the bytes
// the program prints ("%.9f\n" of the norm, formatted by hand).

///|
fn a(i : Int, j : Int) -> Int {
  (((i + j) * (i + j + 1)).reinterpret_as_uint() >> 1).reinterpret_as_int() + i + 1
}

///|
fn au(n : Int, u : FixedArray[Double], v : FixedArray[Double]) -> Unit {
  for i in 0..<n {
    let mut t = 0.0
    for j in 0..<n {
      t += u[j] / a(i, j).to_double()
    }
    v[i] = t
  }
}

///|
fn atu(n : Int, u : FixedArray[Double], v : FixedArray[Double]) -> Unit {
  for i in 0..<n {
    let mut t = 0.0
    for j in 0..<n {
      t += u[j] / a(j, i).to_double()
    }
    v[i] = t
  }
}

///|
fn at_au(n : Int, u : FixedArray[Double], v : FixedArray[Double], w : FixedArray[Double]) -> Unit {
  au(n, u, w)
  atu(n, w, v)
}

///|
fn spectralnorm(n : Int) -> Double {
  let u = FixedArray::make(n, 1.0)
  let v = FixedArray::make(n, 0.0)
  let w = FixedArray::make(n, 0.0)
  for _ in 0..<10 {
    at_au(n, u, v, w)
    at_au(n, v, u, w)
  }
  let mut vbv = 0.0
  let mut vv = 0.0
  for i in 0..<n {
    vbv += u[i] * v[i]
    vv += v[i] * v[i]
  }
  (vbv / vv).sqrt()
}

///|
fn fnv(h : Int, byte : Int) -> Int {
  (h ^ byte) * 16777619
}

///|
/// Hashes the bytes of "%.9f\n" for x: x rounded to nanos, then the digits.
fn fnv_fixed9(h0 : Int, x : Double) -> Int {
  let mut h = h0
  if x < 0.0 {
    h = fnv(h, '-'.to_int())
  }
  let nanos = (x.abs() * 1.0e9 + 0.5).floor().to_int64()
  let whole = nanos / 1000000000L
  let mut p = 1L
  while p * 10L <= whole {
    p = p * 10L
  }
  while p > 0L {
    h = fnv(h, 48 + (whole / p % 10L).to_int())
    p = p / 10L
  }
  h = fnv(h, '.'.to_int())
  let frac = nanos % 1000000000L
  let mut d = 100000000L
  while d > 0L {
    h = fnv(h, 48 + (frac / d % 10L).to_int())
    d = d / 10L
  }
  fnv(h, '\n'.to_int())
}

///|
pub fn bench(n : Int) -> Int {
  fnv_fixed9(-2128831035, spectralnorm(n))
}
