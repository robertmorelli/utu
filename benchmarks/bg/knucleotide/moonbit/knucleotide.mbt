// Not on BG: MoonBit translated from BG k-nucleotide Rust #7 (Alexander), the
// fastest source with a hash map MoonBit has:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-rust-7.html
// Same rolling 2-bit key (A0 C1 T2 G3) masked to the fragment length, one map
// per length (core @hashmap.HashMap in place of hashbrown; Int keys up to 12
// codes, Int64 for 18, as Rust picks u8..u64), counts sorted by value then key
// descending, "%.3f" of the f32 percentage formatted by hand. Single-threaded
// (Rust's thread pool jobs in order). stdin -> the fasta text setup(n) makes;
// println! -> FNV-1a 32 of the bytes, returned by bench(n).

///|
let input : Ref[FixedArray[Byte]] = { val: FixedArray::make(0, b'\x00') }

///|
fn match_key(k : Int) -> Char {
  match k {
    0 => 'A'
    1 => 'C'
    2 => 'T'
    _ => 'G'
  }
}

///|
fn freq(s : Array[Int], len : Int) -> @hashmap.HashMap[Int, Int] {
  let h : @hashmap.HashMap[Int, Int] = @hashmap.HashMap([])
  let mask = (1 << (2 * len)) - 1
  let mut a = 0
  for i in 0..<(len - 1) {
    a = (mask & (a << 2)) | s[i]
  }
  for i in (len - 1)..<s.length() {
    a = (mask & (a << 2)) | s[i]
    h.update_or_default(a, 1, fn(v) { v + 1 })
  }
  h
}

///|
fn freq64(s : Array[Int], len : Int) -> @hashmap.HashMap[Int64, Int] {
  let h : @hashmap.HashMap[Int64, Int] = @hashmap.HashMap([])
  let mask = (1L << (2 * len)) - 1L
  let mut a = 0L
  for i in 0..<(len - 1) {
    a = (mask & (a << 2)) | s[i].to_int64()
  }
  for i in (len - 1)..<s.length() {
    a = (mask & (a << 2)) | s[i].to_int64()
    h.update_or_default(a, 1, fn(v) { v + 1 })
  }
  h
}

// "%.3f"
///|
fn format3(sb : StringBuilder, x : Double) -> Unit {
  let r = (x * 1000.0 + 0.5).floor().to_int()
  sb.write_string((r / 1000).to_string())
  sb.write_char('.')
  let f = r % 1000
  sb.write_char(Int::unsafe_to_char(48 + f / 100))
  sb.write_char(Int::unsafe_to_char(48 + f / 10 % 10))
  sb.write_char(Int::unsafe_to_char(48 + f % 10))
}

///|
fn print_stat(sb : StringBuilder, h : @hashmap.HashMap[Int, Int], seq_len : Int) -> Unit {
  let mut total = 0
  h.each(fn(_k, v) { total += v })
  let entries = h.to_array()
  entries.sort_by(fn(p, q) {
    let (a, x) = p
    let (b, y) = q
    if x != y {
      y.compare(x)
    } else {
      b.compare(a)
    }
  })
  for e in entries {
    let (k, v) = e
    if seq_len == 1 {
      sb.write_char(match_key(k))
    } else {
      sb.write_char(match_key(k >> 2))
      sb.write_char(match_key(3 & k))
    }
    sb.write_char(' ')
    let f : Float = Float::from_int(100 * v) / Float::from_int(total)
    format3(sb, f.to_double())
    sb.write_char('\n')
  }
  sb.write_char('\n')
}

///|
fn key_of(seq : String) -> Int64 {
  let mut k = 0L
  for i in 0..<seq.length() {
    let x = seq.code_unit_at(i).to_int() | 0x20 // to_ascii_lowercase
    k = (k << 2) | (3 & (x >> 1)).to_int64()
  }
  k
}

///|
fn print(sb : StringBuilder, s : Array[Int], seq : String) -> Unit {
  let k = key_of(seq)
  let count = if seq.length() > 12 {
    freq64(s, seq.length()).get_or_default(k, 0)
  } else {
    freq(s, seq.length()).get_or_default(k.to_int(), 0)
  }
  sb.write_string(count.to_string())
  sb.write_char('\t')
  sb.write_string(seq)
  sb.write_char('\n')
}

// Rust's get_seq: skip lines up to ">THREE", then each line's codes.
///|
fn get_seq(r : FixedArray[Byte]) -> Array[Int] {
  let res : Array[Int] = Array(capacity=65536)
  let mut pos = 0
  let n = r.length()
  let key = ">THREE"
  while pos < n {
    let start = pos
    while pos < n && r[pos] != b'\n' {
      pos += 1
    }
    pos += 1
    let mut is_key = pos - start >= key.length()
    if is_key {
      for i in 0..<key.length() {
        if r[start + i].to_int() != key.code_unit_at(i).to_int() {
          is_key = false
        }
      }
    }
    if is_key {
      break
    }
  }
  while pos < n {
    let start = pos
    while pos < n && r[pos] != b'\n' {
      pos += 1
    }
    for i in start..<pos {
      res.push(3 & (r[i].to_int() >> 1))
    }
    pos += 1
  }
  res
}

///|
fn calc() -> String {
  let s = get_seq(input.val)
  let sb = StringBuilder()
  print_stat(sb, freq(s, 1), 1)
  print_stat(sb, freq(s, 2), 2)
  print(sb, s, "GGT")
  print(sb, s, "GGTA")
  print(sb, s, "GGTATT")
  print(sb, s, "GGTATTTTAATT")
  print(sb, s, "GGTATTTTAATTTATAGT")
  sb.to_string()
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
///|
fn fasta(n : Int) -> FixedArray[Byte] {
  let alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
  let out : Array[Byte] = []
  fn puts(s : String) {
    for i in 0..<s.length() {
      out.push(s.code_unit_at(i).to_byte())
    }
  }
  puts(">ONE Homo sapiens alu\n")
  let mut k = 0
  let mut left = 2 * n
  while left > 0 {
    let m = if left < 60 { left } else { 60 }
    for _ in 0..<m {
      out.push(alu.code_unit_at(k).to_byte())
      k = (k + 1) % alu.length()
    }
    out.push(b'\n')
    left -= 60
  }
  let seed : Ref[Int] = { val: 42 }
  fn random(chars : String, probs : Array[Double], count : Int) {
    let cum : Array[Double] = []
    let mut c = 0.0
    for p in probs {
      c += p
      cum.push(c)
    }
    let mut left = count
    while left > 0 {
      let m = if left < 60 { left } else { 60 }
      for _ in 0..<m {
        seed.val = (seed.val * 3877 + 29573) % 139968
        let r = seed.val.to_double() / 139968.0
        let mut j = 0
        while j < cum.length() - 1 && r >= cum[j] {
          j += 1
        }
        out.push(chars.code_unit_at(j).to_byte())
      }
      out.push(b'\n')
      left -= 60
    }
  }
  puts(">TWO IUB ambiguity codes\n")
  random("acgtBDHKMNRSVWY", [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n)
  puts(">THREE Homo sapiens frequency\n")
  random("acgt", [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n)
  FixedArray::from_array(out)
}

///|
pub fn setup(n : Int) -> Unit {
  input.val = fasta(n)
}

///|
pub fn bench(_n : Int) -> Int {
  let s = calc()
  let mut h = -2128831035
  for i in 0..<s.length() {
    h = (h ^ s.code_unit_at(i).to_int()) * 16777619
  }
  h
}
