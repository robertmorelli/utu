// Not on BG: MoonBit translated from BG pidigits gcc #2 (Michael Ganss; Oleksii
// Prudkyi; Mike Pall, Wim Couwenberg; Craig Russell; Mr Ledrug):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-gcc-2.html
// gcc #2's loop with MoonBit's own BigInt (moonbitlang/core, 32-bit limbs,
// immutable) in place of GMP: each mpz call becomes the expression it computes.
// bench(n) returns the FNV-1a hash of the bytes gcc #2 prints.

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
pub fn bench(n : Int) -> Int {
  let mut h = -2128831035
  let mut k = 1
  let mut i = 0
  let mut n1 : BigInt = 4N
  let mut n2 : BigInt = 3N
  let mut d : BigInt = 1N
  while true {
    let u = n1 / d
    let v = n2 / d
    if u == v {
      h = fnv(h, 48 + u.to_int())
      i += 1
      if i % 10 == 0 {
        h = fnv_int(fnv(fnv(h, '\t'.to_int()), ':'.to_int()), i)
        h = fnv(h, '\n'.to_int())
      }
      if i == n {
        break
      }
      // extract
      let u = d * (u * BigInt::from_int(-10))
      n1 = n1 * 10N + u
      n2 = n2 * 10N + u
    } else {
      // produce
      let k2 = k * 2
      let u = n1 * BigInt::from_int(k2 - 1)
      let v = n2 + n2
      let w = n1 * BigInt::from_int(k - 1)
      n1 = u + v
      n2 = w + n2 * BigInt::from_int(k + 2)
      d = d * BigInt::from_int(k2 + 1)
      k += 1
    }
  }
  if i % 10 != 0 {
    for _ in 0..<(10 - n % 10) {
      h = fnv(h, ' '.to_int())
    }
    h = fnv_int(fnv(fnv(h, '\t'.to_int()), ':'.to_int()), n)
    h = fnv(h, '\n'.to_int())
  }
  h
}
