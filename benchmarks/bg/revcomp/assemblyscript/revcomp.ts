// Not on BG: AssemblyScript translated from BG revcomp Rust #1 (Ryohei Machida),
// the fastest source, which fits AssemblyScript (raw memory, simd128):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-rust-1.html
// Same SequenceReader (64 KiB reads into a growing buffer, '>' search) and the
// same in-place left/right reverse complement with its SSSE3 reverse_chunks:
// _mm_shuffle_epi8 as Emscripten emulates it (i8x16.swizzle of the index &
// 0x8F), the constant byte reversal as i8x16.shuffle (what LLVM makes of it).
// Slices are (pointer, length). Single-threaded (rayon's spawns run in order).
// stdin -> the fasta output setup(n) generated (fasta gcc #3's generator as
// AssemblyScript, below, with out() appending to it); stdout -> FNV-1a.

// ---- input: the fasta output setup(n) generates
let input: usize = 0;
let inputLen: i32 = 0;
let inputCap: i32 = 0;
function out(buf: usize, len: i32): void {
  if (inputLen + len > inputCap) {
    let size = inputCap ? inputCap * 2 : 1 << 20;
    while (inputLen + len > size) size *= 2;
    input = input ? heap.realloc(input, size) : heap.alloc(size);
    inputCap = size;
  }
  memory.copy(input + <usize>inputLen, buf, len);
  inputLen += len;
}
function outStr(s: string): void {
  const b = heap.alloc(s.length);
  for (let i = 0; i < s.length; i++) store<u8>(b + <usize>i, <u8>s.charCodeAt(i));
  out(b, s.length);
  heap.free(b);
}

// ---- fasta generator: copy from here to "end of the fasta generator"

const IM: u32 = 139968;
const IA: u32 = 3877;
const IC: u32 = 29573;
const SEED: u32 = 42;
let seed: u32 = SEED;
// @ts-ignore: decorator
@inline function uint32_rand(): u32 { return (seed = (seed * IA + IC) % IM); }

const BUFLINES = 100;
const LINELEN = 60;

const alu =
  "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGG" +
  "GAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGA" +
  "CCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAAT" +
  "ACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCA" +
  "GCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGG" +
  "AGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCC" +
  "AGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";

const iub = "acgtBDHKMNRSVWY";
const iub_p: StaticArray<f32> = [
  0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02];

const homosapiens = "acgt";
const homosapiens_p: StaticArray<f32> = [
  0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008];

function repeat_fasta(seq: string, n: i32): void {
  const len = seq.length;
  const buflen1 = len + LINELEN;
  const buffer1 = heap.alloc(buflen1);
  // LINELEN < len, as for alu: seq, then its first LINELEN again
  for (let i = 0; i < buflen1; i++) store<u8>(buffer1 + <usize>i, <u8>seq.charCodeAt(i % len));

  const buflen2 = (LINELEN + 1) * len;
  const buffer2 = heap.alloc(buflen2);
  for (let i = 0; i < len; i++) {
    memory.copy(buffer2 + <usize>(i * (LINELEN + 1)), buffer1 + <usize>((i * LINELEN) % len), LINELEN);
    store<u8>(buffer2 + <usize>((i + 1) * (LINELEN + 1) - 1), 10);
  }

  const whole_buffers = n / (len * LINELEN);
  for (let i = 0; i < whole_buffers; i++) out(buffer2, buflen2);

  const data_remaining = n - whole_buffers * len * LINELEN;
  const embedded_newlines = data_remaining / LINELEN;
  out(buffer2, data_remaining + embedded_newlines);

  heap.free(buffer1);
  heap.free(buffer2);
  if (n % LINELEN != 0) outStr("\n");
}

function build_hash(symb: string, probability: StaticArray<f32>): usize {
  const hash = heap.alloc(IM);
  const len = symb.length;
  let sum: f32 = probability[0];
  let i: i32 = 0, j: i32 = 0;
  for (; i < <i32>IM && j < len; i++) {
    const r = <f32>(1.0 * <f64>i / <f64>IM);
    if (r >= sum) {
      j++;
      if (j < len) sum += probability[j];
    }
    store<u8>(hash + <usize>i, j < len ? <u8>symb.charCodeAt(j) : 0);
  }
  return hash;
}

function buffer_with_linebreaks(lines: i32): usize {
  const buffer = heap.alloc((LINELEN + 1) * lines);
  for (let i = 0; i < lines; i++) store<u8>(buffer + <usize>(i * (LINELEN + 1) + LINELEN), 10);
  return buffer;
}

function random_fasta(symb: string, probability: StaticArray<f32>, n: i32): void {
  const hash = build_hash(symb, probability);
  const buffer = buffer_with_linebreaks(BUFLINES);

  // fill whole buffers for bulk of data
  const buffers = n / LINELEN / BUFLINES;
  for (let i = 0; i < buffers; i++) {
    for (let j = 0; j < BUFLINES; j++) {
      for (let k = 0; k < LINELEN; k++) {
        const v = uint32_rand();
        store<u8>(buffer + <usize>(j * (LINELEN + 1) + k), load<u8>(hash + <usize>v));
      }
    }
    out(buffer, (LINELEN + 1) * BUFLINES);
  }

  // remaining whole and partial lines
  const lines = n / LINELEN - buffers * BUFLINES;
  for (let j = 0; j < lines; j++) {
    for (let k = 0; k < LINELEN; k++) {
      const v = uint32_rand();
      store<u8>(buffer + <usize>(j * (LINELEN + 1) + k), load<u8>(hash + <usize>v));
    }
  }
  const partials = n - LINELEN * lines - buffers * BUFLINES * LINELEN;
  for (let k = 0; k < partials; k++) {
    const v = uint32_rand();
    store<u8>(buffer + <usize>(lines * (LINELEN + 1) + k), load<u8>(hash + <usize>v));
  }
  out(buffer, lines * (LINELEN + 1) + partials);

  if (n % LINELEN != 0) outStr("\n");

  heap.free(buffer);
  heap.free(hash);
}

function fasta(n: i32): void {
  seed = SEED;

  outStr(">ONE Homo sapiens alu\n");
  repeat_fasta(alu, n * 2);

  outStr(">TWO IUB ambiguity codes\n");
  random_fasta(iub, iub_p, n * 3);

  outStr(">THREE Homo sapiens frequency\n");
  random_fasta(homosapiens, homosapiens_p, n * 5);
}
// ---- end of the fasta generator

export function setup(n: i32): void {
  inputLen = 0;
  fasta(n);
}

// ---- output: FNV-1a over what the program writes
let outHash: u32 = 0;
function write(buf: usize, len: i32): void {
  let h = outHash;
  for (let i = 0; i < len; i++) {
    h = (h ^ <u32>load<u8>(buf + <usize>i)) * 16777619;
  }
  outHash = h;
}

const READ_SIZE: i32 = 1 << 16;
/// Length of a normal line, without its newline.
const LINE_LEN: i32 = 60;
/// Maximum number of rows to process in serial.
const BLOCK_ROWS: i32 = 4096;

// KNUCLEOTIDE_MAPPING: identity but for the nucleotide codes
const MAPPING = memory.data(256);
function initMapping(): void {
  for (let i = 0; i < 256; i++) store<u8>(MAPPING + <usize>i, <u8>i);
  const from = "ABCDGHKMNRSTUVWYabcdghkmnrstuvwy";
  const to = "TVGHCDMKNYSAABWRTVGHCDMKNYSAABWR";
  for (let i = 0; i < from.length; i++) store<u8>(MAPPING + <usize>from.charCodeAt(i), <u8>to.charCodeAt(i));
}

// @ts-ignore: decorator
@inline function _mm_shuffle_epi8(a: v128, b: v128): v128 {
  return i8x16.swizzle(a, v128.and(b, i8x16.splat(<i8>0x8f)));
}

/// reverse bytes and complement each byte
// @ts-ignore: decorator
@inline function reverse_chunks_simd(v: v128): v128 {
  v = i8x16.shuffle(v, v, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0);
  v = v128.and(v, i8x16.splat(0x1f));

  const lt16_els = i8x16.add(v, i8x16.splat(0x70));
  const lt16_lut = i8x16(0, 84 /* T */, 86 /* V */, 71 /* G */, 72 /* H */, 0, 0, 67 /* C */,
                         68 /* D */, 0, 10, 77 /* M */, 0, 75 /* K */, 78 /* N */, 0);
  const lt16_vals = _mm_shuffle_epi8(lt16_lut, lt16_els);

  const g16_els = i8x16.sub(v, i8x16.splat(0x10));
  const g16_lut = i8x16(0, 0, 89 /* Y */, 83 /* S */, 65 /* A */, 65 /* A */, 66 /* B */, 87 /* W */,
                        0, 82 /* R */, 0, 0, 0, 0, 0, 0);
  const g16_vals = _mm_shuffle_epi8(g16_lut, g16_els);

  return v128.or(lt16_vals, g16_vals);
}

function reverse_chunks(left: usize, right: usize, len: i32): void {
  let pl = left;
  let pr = right + <usize>len;
  while (len >= 16) {
    pr -= 16;
    const l = v128.load(pl);
    const r = v128.load(pr);
    v128.store(pr, reverse_chunks_simd(l));
    v128.store(pl, reverse_chunks_simd(r));
    pl += 16;
    len -= 16;
  }
  for (let i = 0; i < len; i++) {
    pr -= 1;
    const l = load<u8>(pl);
    const r = load<u8>(pr);
    store<u8>(pr, load<u8>(MAPPING + <usize>l));
    store<u8>(pl, load<u8>(MAPPING + <usize>r));
    pl += 1;
  }
}

function reverse_complement_left_right(ls: usize, ll: i32, rs: usize, rl: i32, trailing_len: i32): void {
  while (ll >= trailing_len) {
    let n = trailing_len;
    let m = rl - trailing_len;
    const a = ls;
    ls += <usize>n; ll -= n;
    let b = rs + <usize>m;
    rl = m - 1;
    reverse_chunks(a, b, n);

    n = LINE_LEN - trailing_len;
    if (rl <= n) break;
    m = rl - n;
    const a2 = ls;
    ls += <usize>(n + 1); ll -= n + 1;
    b = rs + <usize>m;
    rl = m;
    reverse_chunks(a2, b, n);
  }
  const n = min(ll, rl);
  const m = rl - n;
  reverse_chunks(ls, rs + <usize>m, n);

  // character at the middle of sequence
  let mid: usize;
  if (ll > rl) mid = ls + <usize>(ll - 1);
  else if (rl > ll) mid = rs;
  else return;
  store<u8>(mid, load<u8>(MAPPING + <usize>load<u8>(mid)));
}

/// reverse and complement the sequence at buf (length len, header first)
function reverse_complement(buf: usize, len: i32): void {
  let content_offset = 0;
  while (load<u8>(buf + <usize>content_offset) != 10) content_offset++;
  content_offset++;
  // remove header and last character (\n)
  let cs = buf + <usize>content_offset;
  let cl = len - 1 - content_offset;
  const block_bytes = BLOCK_ROWS * (LINE_LEN + 1);
  const trailing_len = cl % (LINE_LEN + 1);
  while (cl >= block_bytes * 2) {
    const left = cs;
    const right = cs + <usize>(cl - block_bytes);
    cs += <usize>block_bytes;
    cl -= 2 * block_bytes;
    reverse_complement_left_right(left, block_bytes, right, block_bytes, trailing_len);
  }
  const n = cl / 2;
  reverse_complement_left_right(cs, n, cs + <usize>n, cl - n, trailing_len);
}

// SequenceReader: scan stdin directly into the growing buffer
let readPos: i32 = 0;
let buf: usize = 0;
let bufLen: i32 = 0;
let bufCap: i32 = 0;
let nextPos: i32 = 0;
let eofReached = false;

function reserve(more: i32): void {
  if (bufLen + more > bufCap) {
    let size = bufCap ? bufCap * 2 : more;
    while (bufLen + more > size) size *= 2;
    buf = buf ? heap.realloc(buf, size) : heap.alloc(size);
    bufCap = size;
  }
}

function findHeader(from: i32, to: i32): i32 {
  for (let i = from; i < to; i++) if (load<u8>(buf + <usize>i) == 62) return i;
  return -1;
}

/// the next sequence is buf[0 .. result), or -1 at the end
function next(): i32 {
  // scan in buffer first
  if (bufLen > 0) {
    if (nextPos >= bufLen) return -1;
    // remove current sequence (first `nextPos` bytes)
    memory.copy(buf, buf + <usize>nextPos, bufLen - nextPos);
    bufLen -= nextPos;
    // find next header in buffer
    const p = findHeader(1, bufLen);
    const nextHeaderPos = p >= 0 ? p : eofReached ? bufLen : -1;
    if (nextHeaderPos >= 0) {
      nextPos = nextHeaderPos;
      return nextPos;
    }
  }
  reserve(READ_SIZE);
  while (true) {
    const oldLen = bufLen;
    // read at most READ_SIZE bytes
    const readLen = min(READ_SIZE, inputLen - readPos);
    reserve(readLen);
    memory.copy(buf + <usize>bufLen, input + <usize>readPos, readLen);
    readPos += readLen;
    bufLen += readLen;
    eofReached = readLen != READ_SIZE;
    // find next header
    const offset = min(max(oldLen, 1), bufLen);
    const p = findHeader(offset, bufLen);
    if (p < 0 && !eofReached) continue;
    nextPos = p >= 0 ? p : bufLen;
    return nextPos;
  }
}

export function bench(n: i32): u32 {
  outHash = 2166136261;
  initMapping();
  readPos = 0;
  bufLen = 0;
  nextPos = 0;
  eofReached = false;
  while (true) {
    const end = next();
    if (end < 0) break;
    reverse_complement(buf, end);
    write(buf, end);
  }
  return outHash;
}
