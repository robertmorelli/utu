// Not on BG: MoonBit translated from BG revcomp Rust #1 (Ryohei Machida), the
// fastest source; MoonBit has no SIMD, so its scalar `fallback` reverse_chunks
// (BG's own, for targets without SSSE3):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-rust-1.html
// Same SequenceReader (64 KiB reads into a growing buffer, '>' search) and the
// same in-place left/right reverse complement; slices are (start, length) pairs
// of one FixedArray[Byte]. Single-threaded (Rust's rayon spawns run in order).
// stdin -> the fasta output setup(n) generated (fasta gcc #3's generator as
// MoonBit, below, with out() appending to it); stdout -> FNV-1a over the bytes.

// ---- input: the fasta output setup(n) generates
///|
let input : Ref[FixedArray[Byte]] = { val: FixedArray::make(1 << 20, b'\x00') }

///|
let input_len : Ref[Int] = { val: 0 }

///|
fn out(buf : FixedArray[Byte], start : Int, len : Int) -> Unit {
  if input_len.val + len > input.val.length() {
    let mut size = input.val.length() * 2
    while input_len.val + len > size {
      size = size * 2
    }
    let grown = FixedArray::make(size, b'\x00')
    FixedArray::blit_to(input.val, grown, len=input_len.val)
    input.val = grown
  }
  FixedArray::blit_to(buf, input.val, len~, src_offset=start, dst_offset=input_len.val)
  input_len.val = input_len.val + len
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
pub fn setup(n : Int) -> Unit {
  input_len.val = 0
  fasta(n)
}

// ---- output: FNV-1a over what the program writes
///|
let out_hash : Ref[Int] = { val: 0 }

///|
fn write(buf : FixedArray[Byte], start : Int, len : Int) -> Unit {
  let mut h = out_hash.val
  for i in start..<(start + len) {
    h = (h ^ buf[i].to_int()) * 16777619
  }
  out_hash.val = h
}

///|
const READ_SIZE : Int = 65536

///| Length of a normal line, without its newline.
const LINE_LEN : Int = 60

///| Maximum number of rows to process in serial.
const BLOCK_ROWS : Int = 4096

///|
let mapping : FixedArray[Byte] = {
  let m = FixedArray::make(256, b'\x00')
  for i in 0..<256 {
    m[i] = i.to_byte()
  }
  let from = "ABCDGHKMNRSTUVWYabcdghkmnrstuvwy"
  let to = "TVGHCDMKNYSAABWRTVGHCDMKNYSAABWR"
  for i in 0..<from.length() {
    m[from.code_unit_at(i).to_int()] = to.code_unit_at(i).to_byte()
  }
  m
}

///| Reverse and complement: left[i] <-> right[len-1-i], both complemented.
fn reverse_chunks(buf : FixedArray[Byte], left : Int, right : Int, len : Int) -> Unit {
  let mut pl = left
  let mut pr = right + len
  for _ in 0..<len {
    pr = pr - 1
    let l = buf[pl]
    let r = buf[pr]
    buf[pr] = mapping[l.to_int()]
    buf[pl] = mapping[r.to_int()]
    pl = pl + 1
  }
}

///|
fn reverse_complement_left_right(
  buf : FixedArray[Byte],
  left_start : Int,
  left_len : Int,
  right_start : Int,
  right_len : Int,
  trailing_len : Int,
) -> Unit {
  let mut ls = left_start
  let mut ll = left_len
  let rs = right_start
  let mut rl = right_len
  while ll >= trailing_len {
    let n = trailing_len
    let m = rl - trailing_len
    let a = ls
    ls = ls + n
    ll = ll - n
    let b = rs + m
    rl = m - 1
    reverse_chunks(buf, a, b, n)
    let n = LINE_LEN - trailing_len
    if rl <= n {
      break
    }
    let m = rl - n
    let a = ls
    ls = ls + n + 1
    ll = ll - n - 1
    let b = rs + m
    rl = m
    reverse_chunks(buf, a, b, n)
  }
  let n = if ll < rl { ll } else { rl }
  let m = rl - n
  reverse_chunks(buf, ls, rs + m, n)

  // character at the middle of sequence
  let mid = if ll > rl {
    ls + ll - 1
  } else if rl > ll {
    rs
  } else {
    return
  }
  buf[mid] = mapping[buf[mid].to_int()]
}

///| Reverse and complement the sequence buf[0 ..< len] (its header first).
fn reverse_complement(buf : FixedArray[Byte], len : Int) -> Unit {
  let mut content_offset = 0
  while buf[content_offset] != b'\n' {
    content_offset += 1
  }
  content_offset += 1
  // remove header and last character (\n)
  let mut cs = content_offset
  let mut cl = len - 1 - content_offset
  let block_bytes = BLOCK_ROWS * (LINE_LEN + 1)
  let trailing_len = cl % (LINE_LEN + 1)
  while cl >= block_bytes * 2 {
    let left = cs
    let right = cs + cl - block_bytes
    cs = cs + block_bytes
    cl = cl - 2 * block_bytes
    reverse_complement_left_right(buf, left, block_bytes, right, block_bytes, trailing_len)
  }
  let n = cl / 2
  reverse_complement_left_right(buf, cs, n, cs + n, cl - n, trailing_len)
}

///| Scan stdin directly into the growing buffer.
priv struct SequenceReader {
  mut pos : Int // read position in the input
  mut buf : FixedArray[Byte]
  mut len : Int
  mut next_pos : Int
  mut eof_reached : Bool
}

///|
fn SequenceReader::reserve(self : SequenceReader, more : Int) -> Unit {
  if self.len + more > self.buf.length() {
    let mut size = if self.buf.length() == 0 { more } else { self.buf.length() * 2 }
    while self.len + more > size {
      size = size * 2
    }
    let grown = FixedArray::make(size, b'\x00')
    FixedArray::blit_to(self.buf, grown, len=self.len)
    self.buf = grown
  }
}

///|
fn find_header(buf : FixedArray[Byte], from : Int, to : Int) -> Int {
  for i in from..<to {
    if buf[i] == b'>' {
      return i
    }
  }
  -1
}

///| The next sequence: buf[0 ..< next_pos], or -1 at the end.
fn SequenceReader::next(self : SequenceReader) -> Int {
  // scan in buffer first
  if self.len > 0 {
    if self.next_pos >= self.len {
      return -1
    }
    // remove current sequence (first `next_pos` bytes)
    FixedArray::blit_to(self.buf, self.buf, len=self.len - self.next_pos, src_offset=self.next_pos)
    self.len = self.len - self.next_pos
    // find next header in buffer
    let p = find_header(self.buf, 1, self.len)
    let next_header_pos = if p >= 0 {
      p
    } else if self.eof_reached {
      self.len
    } else {
      -1
    }
    if next_header_pos >= 0 {
      self.next_pos = next_header_pos
      return next_header_pos
    }
  }
  self.reserve(READ_SIZE)
  while true {
    let old_len = self.len
    // read at most READ_SIZE bytes
    let read_len = if input_len.val - self.pos < READ_SIZE {
      input_len.val - self.pos
    } else {
      READ_SIZE
    }
    self.reserve(read_len)
    FixedArray::blit_to(input.val, self.buf, len=read_len, src_offset=self.pos, dst_offset=self.len)
    self.pos = self.pos + read_len
    self.len = self.len + read_len
    self.eof_reached = read_len != READ_SIZE
    // find next header
    let offset = if old_len > 1 { old_len } else { 1 }
    let offset = if offset < self.len { offset } else { self.len }
    let p = find_header(self.buf, offset, self.len)
    if p < 0 && !self.eof_reached {
      continue
    }
    self.next_pos = if p >= 0 { p } else { self.len }
    return self.next_pos
  }
  -1
}

///|
pub fn bench(n : Int) -> Int {
  ignore(n)
  out_hash.val = -2128831035
  let reader : SequenceReader = {
    pos: 0,
    buf: FixedArray::make(0, b'\x00'),
    len: 0,
    next_pos: 0,
    eof_reached: false,
  }
  while true {
    let end = reader.next()
    if end < 0 {
      break
    }
    reverse_complement(reader.buf, end)
    write(reader.buf, 0, end)
  }
  out_hash.val
}
