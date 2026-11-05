// Not on BG: AssemblyScript translated from BG fasta gcc #3 (Drake Diedrich), the
// fastest C source, which fits AssemblyScript (raw memory, f32):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-gcc-3.html
// Same lookup table of IM symbols built in f32 as C does, same BUFLINES-line
// buffer with fixed newlines, malloc/free -> heap.alloc/heap.free, loads and
// stores as C's. write(1, ...) -> out(), the output sink (here: FNV-1a over the
// bytes); main -> fasta(n) and bench(n). Programs that read fasta's output copy the block between the "fasta generator" markers and make out() append (scratchpad
// fasta-input.md).

// ---- output sink: what BG writes to stdout goes here
let fnvHash: u32 = 0;
function out(buf: usize, len: i32): void {
  let h = fnvHash;
  for (let i = 0; i < len; i++) {
    h = (h ^ <u32>load<u8>(buf + <usize>i)) * 16777619;
  }
  fnvHash = h;
}
function outStr(s: string): void {
  for (let i = 0; i < s.length; i++) fnvHash = (fnvHash ^ <u32>s.charCodeAt(i)) * 16777619;
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

export function bench(n: i32): u32 {
  fnvHash = 2166136261;
  fasta(n);
  return fnvHash;
}
