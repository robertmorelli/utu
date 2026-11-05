// Not on BG: MoonBit translated from BG fannkuch-redux Node #5 (Andrey Filatkin,
// after Oleg Mazurov's Go #3), the fastest source that fits MoonBit (the C/C++/
// Rust ones are SSE shuffles):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-node-5.html
// Single-threaded: the same 720 chunks in order. p/pp/count are FixedArray[Int].
// bench(n) returns the FNV-1a hash of the bytes Node #5 prints.

///|
fn fannkuch(
  n : Int,
  fact : FixedArray[Int],
  idx_min : Int,
  idx_max : Int,
) -> (Int, Int) {
  let p = FixedArray::make(n, 0)
  let pp = FixedArray::make(n, 0)
  let count = FixedArray::make(n, 0)

  // first permutation
  for i in 0..<n {
    p[i] = i
  }
  let mut idx = idx_min
  for i = n - 1; i > 0; i = i - 1 {
    let d = idx / fact[i]
    count[i] = d
    idx = idx % fact[i]
    for j in 0..<n {
      pp[j] = p[j]
    }
    for j in 0..=i {
      if j + d <= i {
        p[j] = pp[j + d]
      } else {
        p[j] = pp[j + d - i - 1]
      }
    }
  }

  let mut max_flips = 1
  let mut check_sum = 0
  idx = idx_min
  let mut sign = true
  while true {
    let mut first = p[0]
    if first != 0 {
      let mut flips = 1
      if p[first] != 0 {
        for j in 1..<n {
          pp[j] = p[j]
        }
        let mut p0 = first
        while true {
          flips += 1
          let mut i = 1
          let mut j = p0 - 1
          while i < j {
            let t = pp[i]
            pp[i] = pp[j]
            pp[j] = t
            i += 1
            j -= 1
          }
          let t = pp[p0]
          pp[p0] = p0
          p0 = t
          if pp[p0] == 0 {
            break
          }
        }
      }
      if max_flips < flips {
        max_flips = flips
      }
      if sign {
        check_sum += flips
      } else {
        check_sum -= flips
      }
    }
    idx += 1
    if idx == idx_max {
      break
    }

    // next permutation
    if sign {
      p[0] = p[1]
      p[1] = first
    } else {
      let t = p[1]
      p[1] = p[2]
      p[2] = t
      let mut k = 2
      while true {
        count[k] += 1
        if count[k] <= k {
          break
        }
        count[k] = 0
        for j in 0..=k {
          p[j] = p[j + 1]
        }
        p[k + 1] = first
        first = p[0]
        k += 1
      }
    }
    sign = not(sign)
  }
  (max_flips, check_sum)
}

///|
fn fnv_str(h0 : Int, s : String) -> Int {
  let mut h = h0
  for i in 0..<s.length() {
    h = (h ^ s.code_unit_at(i).to_int()) * 16777619
  }
  h
}

///|
pub fn bench(n : Int) -> Int {
  let fact = FixedArray::make(n + 1, 1)
  for i in 1..=n {
    fact[i] = fact[i - 1] * i
  }
  let nchunks = 720
  let mut chunk_size = (fact[n] + nchunks - 1) / nchunks
  chunk_size += chunk_size % 2
  let len = (fact[n] + chunk_size - 1) / chunk_size
  let mut flips = 0
  let mut chk = 0
  for i in 0..<len {
    let idx_min = chunk_size * i
    let idx_max = if fact[n] < idx_min + chunk_size {
      fact[n]
    } else {
      idx_min + chunk_size
    }
    let (max_flips, check_sum) = fannkuch(n, fact, idx_min, idx_max)
    if flips < max_flips {
      flips = max_flips
    }
    chk += check_sum
  }
  fnv_str(-2128831035, "\{chk}\nPfannkuchen(\{n}) = \{flips}\n")
}
