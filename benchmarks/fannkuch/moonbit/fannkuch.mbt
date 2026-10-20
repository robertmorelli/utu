// fannkuch-redux from the Computer Language Benchmarks Game, after its
// single-threaded C program, in MoonBit over `FixedArray[Int]`: permutations
// generated in place with a count array, each one flipped (prefix reversal)
// until its first element is 0.

///|
/// checksum * 1000 + max_flips for all permutations of 0..n-1.
fn fannkuch(n : Int) -> Int64 {
  let perm = FixedArray::make(n, 0)
  let perm1 = FixedArray::makei(n, i => i)
  let count = FixedArray::make(n, 0)
  let mut max_flips = 0
  let mut checksum = 0
  let mut perm_count = 0
  let mut r = n
  while true {
    while r != 1 {
      count[r - 1] = r
      r -= 1
    }
    for i in 0..<n {
      perm[i] = perm1[i]
    }
    let mut flips = 0
    let mut k = perm[0]
    while k != 0 {
      let k2 = (k + 1) >> 1
      for i in 0..<k2 {
        perm.swap(i, k - i)
      }
      flips += 1
      k = perm[0]
    }
    if flips > max_flips {
      max_flips = flips
    }
    if perm_count % 2 == 0 {
      checksum += flips
    } else {
      checksum -= flips
    }
    // The next permutation: rotate the first r + 1 elements left until a count stays positive.
    while true {
      if r == n {
        return checksum.to_int64() * 1000L + max_flips.to_int64()
      }
      let perm0 = perm1[0]
      for i in 0..<r {
        perm1[i] = perm1[i + 1]
      }
      perm1[r] = perm0
      count[r] -= 1
      if count[r] > 0 {
        break
      }
      r += 1
    }
    perm_count += 1
  }
  panic()
}

///|
pub fn bench(iterations : Int) -> Int64 {
  let mut sink = 0L
  for _ in 0..<iterations {
    sink += fannkuch(9)
  }
  sink
}
