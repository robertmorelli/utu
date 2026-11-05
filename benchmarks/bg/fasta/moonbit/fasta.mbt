// Not on BG: MoonBit translated from BG fasta gcc #3 (Drake Diedrich), the
// fastest C source and the simplest to carry over:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-gcc-3.html
// Same lookup table of IM symbols built in Float (f32) as C does, same
// BUFLINES-line buffer with fixed newlines. write(1, ...) -> out(), the output
// sink (here: FNV-1a over the bytes); main -> fasta(n) and bench(n). Programs
// that read fasta's output copy the block between the "fasta generator" markers and make
// out() append (scratchpad fasta-input.md).

// ---- output sink: what BG writes to stdout goes here
///|
let fnv_hash : Ref[Int] = { val: 0 }

///|
fn out(buf : FixedArray[Byte], start : Int, len : Int) -> Unit {
  let mut h = fnv_hash.val
  for i in start..<(start + len) {
    h = (h ^ buf[i].to_int()) * 16777619
  }
  fnv_hash.val = h
}

///|
fn out_str(s : String) -> Unit {
  let b = FixedArray::make(s.length(), b'\x00')
  for i in 0..<s.length() {
    b[i] = s.code_unit_at(i).to_byte()
  }
  out(b, 0, b.length())
}
// ---- fasta generator: copy from here to "end of the fasta generator"

///|
const IM : Int = 139968

///|
const IA : Int = 3877

///|
const IC : Int = 29573

///|
const BUFLINES : Int = 100

///|
const LINELEN : Int = 60

///|
let seed : Ref[Int] = { val: 42 }

///|
let alu : String = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGG" +
  "GAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGA" +
  "CCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAAT" +
  "ACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCA" +
  "GCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGG" +
  "AGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCC" +
  "AGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"

///|
fn repeat_fasta(seq : String, n : Int) -> Unit {
  let len = seq.length()
  let buflen1 = len + LINELEN
  let buffer1 = FixedArray::make(buflen1, b'\x00')
  // LINELEN < len, as for alu
  for i in 0..<len {
    buffer1[i] = seq.code_unit_at(i).to_byte()
  }
  for i in 0..<LINELEN {
    buffer1[len + i] = seq.code_unit_at(i).to_byte()
  }
  let buflen2 = (LINELEN + 1) * len
  let buffer2 = FixedArray::make(buflen2, b'\x00')
  for i in 0..<len {
    FixedArray::blit_to(buffer1, buffer2, len=LINELEN, src_offset=i * LINELEN % len, dst_offset=i * (LINELEN + 1))
    buffer2[(i + 1) * (LINELEN + 1) - 1] = b'\n'
  }
  let whole_buffers = n / (len * LINELEN)
  for _ in 0..<whole_buffers {
    out(buffer2, 0, buflen2)
  }
  let data_remaining = n - whole_buffers * len * LINELEN
  let embedded_newlines = data_remaining / LINELEN
  out(buffer2, 0, data_remaining + embedded_newlines)
  if n % LINELEN != 0 {
    out_str("\n")
  }
}

///|
fn build_hash(symb : String, probability : Array[Float]) -> FixedArray[Byte] {
  let hash = FixedArray::make(IM, b'\x00')
  let len = symb.length()
  let mut sum : Float = probability[0]
  let mut j = 0
  let mut i = 0
  while i < IM && j < len {
    let r = Float::from_double(1.0 * i.to_double() / IM.to_double())
    if r >= sum {
      j += 1
      sum = sum + (if j < len { probability[j] } else { 0.0 })
    }
    hash[i] = if j < len { symb.code_unit_at(j).to_byte() } else { b'\x00' }
    i += 1
  }
  hash
}

///|
fn random_fasta(symb : String, probability : Array[Float], n : Int) -> Unit {
  let hash = build_hash(symb, probability)
  let buffer = FixedArray::make((LINELEN + 1) * BUFLINES, b'\x00')
  for i in 0..<BUFLINES {
    buffer[i * (LINELEN + 1) + LINELEN] = b'\n'
  }
  let mut s = seed.val
  let buffers = n / LINELEN / BUFLINES
  for _ in 0..<buffers {
    for j in 0..<BUFLINES {
      for k in 0..<LINELEN {
        s = (s * IA + IC) % IM
        buffer[j * (LINELEN + 1) + k] = hash[s]
      }
    }
    out(buffer, 0, (LINELEN + 1) * BUFLINES)
  }
  let lines = n / LINELEN - buffers * BUFLINES
  for j in 0..<lines {
    for k in 0..<LINELEN {
      s = (s * IA + IC) % IM
      buffer[j * (LINELEN + 1) + k] = hash[s]
    }
  }
  let partials = n - LINELEN * lines - buffers * BUFLINES * LINELEN
  for k in 0..<partials {
    s = (s * IA + IC) % IM
    buffer[lines * (LINELEN + 1) + k] = hash[s]
  }
  seed.val = s
  out(buffer, 0, lines * (LINELEN + 1) + partials)
  if n % LINELEN != 0 {
    out_str("\n")
  }
}

///|
fn fasta(n : Int) -> Unit {
  seed.val = 42
  let iub_p : Array[Float] = [
    0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02,
    0.02, 0.02,
  ]
  let homosapiens_p : Array[Float] = [
    0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008,
  ]
  out_str(">ONE Homo sapiens alu\n")
  repeat_fasta(alu, n * 2)
  out_str(">TWO IUB ambiguity codes\n")
  random_fasta("acgtBDHKMNRSVWY", iub_p, n * 3)
  out_str(">THREE Homo sapiens frequency\n")
  random_fasta("acgt", homosapiens_p, n * 5)
}
// ---- end of the fasta generator

///|
pub fn bench(n : Int) -> Int {
  fnv_hash.val = -2128831035
  fasta(n)
  fnv_hash.val
}
