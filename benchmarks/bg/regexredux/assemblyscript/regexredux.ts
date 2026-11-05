// Not on BG: the steps of BG regex-redux gcc #5 (Jeremy Zerfas, Zoltan
// Herczeg): https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-gcc-5.html
//
// NOT a regex library: AssemblyScript has no RegExp, and assemblyscript-regex
// (the npm package) copies the rest of the subject at every start position
// (str.substr), quadratic on a multi-megabyte input. So this carries the same
// small backtracking matcher as regexredux.utu, for the subset the patterns
// use: literal bytes, `\c` escapes (`\n` = newline), `.` (any byte but a
// newline), `[...]`, `[^...]`, a greedy `*` after one of those, and `|` at the
// top level; leftmost match, first alternative, as PCRE. Single-threaded;
// setup(n) makes the fasta text; bench(n) returns FNV-1a 32 of the bytes gcc
// #5 prints.

class Regex {
  sets: StaticArray<u32>;   // atom k's bytes: bit c of sets[k * 8 + c / 32]
  star: StaticArray<u8>;    // 1 if atom k repeats
  alts: Array<i32> = [];    // alternative a is atoms alts[a] ..< alts[a + 1]
  first: StaticArray<u8> = new StaticArray<u8>(256);
  fromAny: bool = false;

  constructor(p: string) {
    const len = p.length;
    this.sets = new StaticArray<u32>(len * 8 + 8);
    this.star = new StaticArray<u8>(len + 1);
    const sets = this.sets;
    let atoms = 0;
    this.alts.push(0);
    let i = 0;
    while (i < len) {
      const c = p.charCodeAt(i);
      if (c == 124) {                 // `|`
        this.alts.push(atoms);
        i++;
      } else if (c == 42) {           // `*`
        this.star[atoms - 1] = 1;
        i++;
      } else {
        const k = atoms++;
        if (c == 91) {                // `[...]` or `[^...]`
          i++;
          const negate = p.charCodeAt(i) == 94;
          if (negate) i++;
          const start = i;
          while (p.charCodeAt(i) != 93 || i == start) {
            let b = p.charCodeAt(i);
            if (b == 92) { i++; b = unescape(p.charCodeAt(i)); }
            setBit(sets, k, b);
            i++;
          }
          i++;
          if (negate) for (let w = 0; w < 8; w++) sets[k * 8 + w] = ~sets[k * 8 + w];
        } else if (c == 46) {         // `.`
          for (let b = 0; b < 256; b++) if (b != 10) setBit(sets, k, b);
          i++;
        } else if (c == 92) {         // `\c`
          setBit(sets, k, unescape(p.charCodeAt(i + 1)));
          i += 2;
        } else {
          setBit(sets, k, c);
          i++;
        }
      }
    }
    this.alts.push(atoms);
    for (let a = 0; a < this.alts.length - 1; a++) {
      const k = this.alts[a];
      if (k == this.alts[a + 1] || this.star[k] == 1) this.fromAny = true;
      else for (let b = 0; b < 256; b++) if (hasBit(sets, k, b)) this.first[b] = 1;
    }
  }
}

// @ts-ignore: decorator
@inline function setBit(sets: StaticArray<u32>, k: i32, c: i32): void {
  sets[k * 8 + (c >>> 5)] |= 1 << (c & 31);
}

// @ts-ignore: decorator
@inline function hasBit(sets: StaticArray<u32>, k: i32, c: i32): bool {
  return ((unchecked(sets[k * 8 + (c >>> 5)]) >>> (c & 31)) & 1) != 0;
}

function unescape(c: i32): i32 { return c == 110 ? 10 : c; }

// Atoms k ..< stop matched from text[p], text ending at end: the match's end, or -1.
function matchSeq(re: Regex, text: usize, k: i32, stop: i32, p: i32, end: i32): i32 {
  const sets = re.sets;
  while (true) {
    if (k == stop) return p;
    if (re.star[k] == 1) {
      let q = p;
      while (q < end && hasBit(sets, k, load<u8>(text + q))) q++;
      while (q >= p) {
        const r = matchSeq(re, text, k + 1, stop, q, end);
        if (r >= 0) return r;
        q--;
      }
      return -1;
    }
    if (p < end && hasBit(sets, k, load<u8>(text + p))) { k++; p++; } else return -1;
  }
}

let matchEnd = 0;

// The first match in text[from ..< end]: its start (end in matchEnd), or -1.
function find(re: Regex, text: usize, from: i32, end: i32): i32 {
  const alts = re.alts;
  const nalts = alts.length - 1;
  for (let p = from; p < end; p++) {
    if (re.fromAny || re.first[load<u8>(text + p)] == 1) {
      for (let a = 0; a < nalts; a++) {
        const r = matchSeq(re, text, alts[a], alts[a + 1], p, end);
        if (r >= 0) { matchEnd = r; return p; }
      }
    }
  }
  return -1;
}

// gcc #5's replace(): src[0 ..< len) with every match replaced, into dst; its length.
function replace(pattern: string, replacement: string, src: usize, len: i32, dst: usize): i32 {
  const re = new Regex(pattern);
  let size = 0, pos = 0;
  while (true) {
    const start = find(re, src, pos, len);
    if (start < 0) break;
    memory.copy(dst + size, src + pos, start - pos);
    size += start - pos;
    for (let i = 0; i < replacement.length; i++) store<u8>(dst + size + i, replacement.charCodeAt(i));
    size += replacement.length;
    pos = matchEnd;
  }
  memory.copy(dst + size, src + pos, len - pos);
  return size + len - pos;
}

function count(pattern: string, text: usize, len: i32): i32 {
  const re = new Regex(pattern);
  let n = 0, pos = 0;
  while (true) {
    const start = find(re, text, pos, len);
    if (start < 0) break;
    n++;
    pos = matchEnd;
  }
  return n;
}

function fnvStr(h: u32, s: string): u32 {
  for (let i = 0; i < s.length; i++) h = (h ^ <u32>s.charCodeAt(i)) * 16777619;
  return h;
}

function run(): u32 {
  const variants = [
    "agggtaaa|tttaccct",
    "[cgt]gggtaaa|tttaccc[acg]",
    "a[act]ggtaaa|tttacc[agt]t",
    "ag[act]gtaaa|tttac[agt]ct",
    "agg[act]taaa|ttta[agt]cct",
    "aggg[acg]aaa|ttt[cgt]ccct",
    "agggt[cgt]aa|tt[acg]accct",
    "agggta[cgt]a|t[acg]taccct",
    "agggtaa[cgt]|[acg]ttaccct",
  ];
  const patterns = ["tHa[Nt]", "aND|caN|Ha[DS]|WaS", "a[NSt]|BY", "<[^>]*>", "\\|[^|][^|]*\\|"];
  const replacements = ["<4>", "<3>", "<2>", "|", "-"];

  const ilen = inputLen;
  const seq = new StaticArray<u8>(ilen);
  const seqPtr = changetype<usize>(seq);
  const slen = replace(">.*\n|\n", "", inputPtr, ilen, seqPtr);

  // The replacements, alternating two buffers (the text grows by at most half).
  let pre = changetype<usize>(new StaticArray<u8>(slen * 2));
  let post = changetype<usize>(new StaticArray<u8>(slen * 2));
  const keepPre = changetype<StaticArray<u8>>(pre), keepPost = changetype<StaticArray<u8>>(post);
  memory.copy(pre, seqPtr, slen);
  let size = slen;
  for (let i = 0; i < patterns.length; i++) {
    size = replace(patterns[i], replacements[i], pre, size, post);
    const t = pre; pre = post; post = t;
  }

  let h: u32 = 2166136261;
  for (let i = 0; i < variants.length; i++) {
    h = fnvStr(h, variants[i] + " " + count(variants[i], seqPtr, slen).toString() + "\n");
  }
  h = fnvStr(h, "\n" + ilen.toString() + "\n" + slen.toString() + "\n" + size.toString() + "\n");
  // keep the buffers alive until here
  if (keepPre.length < 0 || keepPost.length < 0) h = 0;
  return h;
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
let input: StaticArray<u8> = new StaticArray<u8>(0);
let inputPtr: usize = 0;
let inputLen = 0;
let fastaPos = 0;

function put(c: i32): void { store<u8>(inputPtr + fastaPos++, c); }
function puts(s: string): void { for (let i = 0; i < s.length; i++) put(s.charCodeAt(i)); }

let seed: u32 = 42;
function randomFasta(chars: string, probs: f64[], count: i32): void {
  const cum = new Array<f64>(probs.length);
  let c = 0.0;
  for (let i = 0; i < probs.length; i++) { c += probs[i]; cum[i] = c; }
  for (let left = count; left > 0; left -= 60) {
    const m = left < 60 ? left : 60;
    for (let i = 0; i < m; i++) {
      seed = (seed * 3877 + 29573) % 139968;
      const r = <f64>seed / 139968.0;
      let j = 0;
      while (j < cum.length - 1 && r >= cum[j]) j++;
      put(chars.charCodeAt(j));
    }
    put(10);
  }
}

function fasta(n: i32): void {
  const alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";
  fastaPos = 0;
  seed = 42;
  puts(">ONE Homo sapiens alu\n");
  let k = 0;
  for (let left = 2 * n; left > 0; left -= 60) {
    const m = left < 60 ? left : 60;
    for (let i = 0; i < m; i++) { put(alu.charCodeAt(k)); if (++k == alu.length) k = 0; }
    put(10);
  }
  puts(">TWO IUB ambiguity codes\n");
  randomFasta("acgtBDHKMNRSVWY", [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
  puts(">THREE Homo sapiens frequency\n");
  randomFasta("acgt", [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
}

export function setup(n: i32): void {
  // 10 bases + 1 newline per 60, plus headers: 10n + 10n/60 + 3 + 76 at most
  input = new StaticArray<u8>(10 * n + (10 * n) / 60 + 100);
  inputPtr = changetype<usize>(input);
  fasta(n);
  inputLen = fastaPos;
}

export function bench(n: i32): u32 {
  return run();
}
