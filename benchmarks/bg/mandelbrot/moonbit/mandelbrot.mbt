// Not on BG: MoonBit translated from BG mandelbrot Node #3 (Andrey Filatkin,
// after Go #4), the scalar algorithm (MoonBit has no SIMD):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-node-3.html
// One thread: the rows in order. bench(n) returns the FNV-1a hash of the bytes the
// program writes ("P4\n<n> <n>\n" and the bitmap), each byte hashed as it is made.

///|
fn fnv(h : Int, byte : Int) -> Int {
  (h ^ byte) * 16777619
}

///|
fn fnv_int(h0 : Int, x : Int) -> Int {
  let mut h = h0
  let mut p = 1
  while p * 10 <= x {
    p = p * 10
  }
  while p > 0 {
    h = fnv(h, 48 + x / p % 10)
    p = p / 10
  }
  h
}

///|
fn render_row(h0 : Int, y0 : Int, initial_r : FixedArray[Double], initial_i : FixedArray[Double], bytes_per_row : Int) -> Int {
  let mut h = h0
  for x_byte in 0..<bytes_per_row {
    let ci = initial_i[y0]
    let mut res = 0
    let mut i = 0
    while i < 8 {
      let x = x_byte << 3
      let cr1 = initial_r[x + i]
      let cr2 = initial_r[x + i + 1]
      let mut zr1 = cr1
      let mut zi1 = ci
      let mut zr2 = cr2
      let mut zi2 = ci
      let mut b = 0
      for _ in 0..<50 {
        let tr1 = zr1 * zr1
        let ti1 = zi1 * zi1
        zi1 = 2.0 * zr1 * zi1 + ci
        zr1 = tr1 - ti1 + cr1
        if tr1 + ti1 > 4.0 {
          b = b | 2
          if b == 3 {
            break
          }
        }
        let tr2 = zr2 * zr2
        let ti2 = zi2 * zi2
        zi2 = 2.0 * zr2 * zi2 + ci
        zr2 = tr2 - ti2 + cr2
        if tr2 + ti2 > 4.0 {
          b = b | 1
          if b == 3 {
            break
          }
        }
      }
      res = (res << 2) | b
      i += 2
    }
    h = fnv(h, res.lnot() & 255)
  }
  h
}

///|
pub fn bench(size : Int) -> Int {
  let bytes_per_row = size >> 3
  let initial_r = FixedArray::make(size, 0.0)
  let initial_i = FixedArray::make(size, 0.0)
  let inv = 2.0 / size.to_double()
  for xy in 0..<size {
    let i = inv * xy.to_double()
    initial_r[xy] = i - 1.5
    initial_i[xy] = i - 1.0
  }
  let mut h = fnv(fnv(fnv(-2128831035, 80), 52), 10)
  h = fnv(fnv_int(fnv(fnv_int(h, size), 32), size), 10)
  for y in 0..<size {
    h = render_row(h, y, initial_r, initial_i, bytes_per_row)
  }
  h
}
