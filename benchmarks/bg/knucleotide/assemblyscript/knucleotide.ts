// Not on BG: AssemblyScript translated from BG k-nucleotide gcc #1 (Jeremy
// Zerfas), the fastest source, which fits AssemblyScript (raw bytes, u64 keys):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-gcc-1.html
// khash is a C header library, so its table is written here the same way:
// open addressing in power-of-two buckets, quadratic probing (step 1, 2, 3...),
// C's custom hash key ^ key >> 7, grown at khash's 0.77 load; the sort is
// value descending then key ascending (qsort's comparator, on an array);
// "%.3f" of the f32 percentage formatted by hand. Single-threaded (gcc #1's
// OpenMP sections in order). stdin -> the fasta text setup(n) makes, read
// line by line as fgets would; printf -> FNV-1a 32 of the bytes.

// khash(uint64_t -> uint32_t), insert-only.
class Table {
  keys: StaticArray<u64> = new StaticArray<u64>(4);
  vals: StaticArray<u32> = new StaticArray<u32>(4);
  used: StaticArray<u8> = new StaticArray<u8>(4);
  size: i32 = 0;
  mask: u32 = 3;
  upper: i32 = 3;

  // kh_put + (value = 1 | value++)
  increment(key: u64): void {
    if (this.size >= this.upper) this.resize((this.mask + 1) << 1);
    const mask = this.mask;
    let i = <u32>(key ^ (key >> 7)) & mask;
    let step: u32 = 0;
    while (unchecked(this.used[i])) {
      if (unchecked(this.keys[i]) == key) {
        unchecked(this.vals[i]++);
        return;
      }
      i = (i + ++step) & mask;
    }
    unchecked(this.used[i] = 1);
    unchecked(this.keys[i] = key);
    unchecked(this.vals[i] = 1);
    this.size++;
  }

  get(key: u64): u32 {
    const mask = this.mask;
    let i = <u32>(key ^ (key >> 7)) & mask;
    let step: u32 = 0;
    while (unchecked(this.used[i])) {
      if (unchecked(this.keys[i]) == key) return unchecked(this.vals[i]);
      i = (i + ++step) & mask;
    }
    return 0;
  }

  resize(buckets: u32): void {
    const keys = this.keys, vals = this.vals, used = this.used;
    this.keys = new StaticArray<u64>(buckets);
    this.vals = new StaticArray<u32>(buckets);
    this.used = new StaticArray<u8>(buckets);
    this.mask = buckets - 1;
    this.upper = <i32>(<f64>buckets * 0.77 + 0.5);
    for (let j = 0; j < used.length; j++) {
      if (!unchecked(used[j])) continue;
      const key = unchecked(keys[j]);
      let i = <u32>(key ^ (key >> 7)) & this.mask;
      let step: u32 = 0;
      while (unchecked(this.used[i])) i = (i + ++step) & this.mask;
      unchecked(this.used[i] = 1);
      unchecked(this.keys[i] = key);
      unchecked(this.vals[i] = unchecked(vals[j]));
    }
  }
}

class Element {
  constructor(public key: u64, public value: u32) {}
}

// code_For_Nucleotide: " \0 \1\3  \2"[nucleotide & 0x7]
function codeForNucleotide(c: u32): u8 {
  const k = c & 7;
  return k == 1 ? 0 : k == 3 ? 1 : k == 4 ? 3 : k == 7 ? 2 : 32;
}

const NUCLEOTIDE_FOR_CODE = "ACGT";

let out = "";

function hashTable(poly: Uint8Array, length: i32): Table {
  const table = new Table();
  let key: u64 = 0;
  const mask: u64 = ((<u64>1) << (2 * length)) - 1;
  for (let i = 0; i < length - 1; i++) key = (key << 2 & mask) | <u64>unchecked(poly[i]);
  for (let i = length - 1; i < poly.length; i++) {
    key = (key << 2 & mask) | <u64>unchecked(poly[i]);
    table.increment(key);
  }
  return table;
}

// "%.3f"
function format3(x: f64): string {
  const r = <i64>Math.floor(x * 1000 + 0.5);
  const f = <i32>(r % 1000);
  return (r / 1000).toString() + "." + (f < 100 ? (f < 10 ? "00" : "0") : "") + f.toString();
}

function generateFrequencies(poly: Uint8Array, length: i32): string {
  const table = hashTable(poly, length);
  const elements = new Array<Element>();
  for (let j = 0; j < table.used.length; j++) {
    if (unchecked(table.used[j])) elements.push(new Element(unchecked(table.keys[j]), unchecked(table.vals[j])));
  }
  elements.sort((l: Element, r: Element): i32 => {
    if (l.value < r.value) return 1;
    if (l.value > r.value) return -1;
    return l.key > r.key ? 1 : -1;
  });
  let s = "";
  for (let i = 0; i < elements.length; i++) {
    let key = elements[i].key;
    let name = "";
    for (let j = 0; j < length; j++) {
      name = NUCLEOTIDE_FOR_CODE.charAt(<i32>(key & 3)) + name;
      key >>= 2;
    }
    const f: f32 = <f32>100.0 * <f32>elements[i].value / <f32>(poly.length - length + 1);
    s += name + " " + format3(<f64>f) + "\n";
  }
  return s;
}

function generateCount(poly: Uint8Array, oligo: string): string {
  const length = oligo.length;
  const table = hashTable(poly, length);
  let key: u64 = 0;
  for (let i = 0; i < length; i++) key = (key << 2) | <u64>codeForNucleotide(oligo.charCodeAt(i));
  return table.get(key).toString() + "\t" + oligo;
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
let input = new Uint8Array(0);

function fasta(n: i32): Uint8Array {
  const alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";
  const buf = new Uint8Array(n * 11 + 200);
  let size = 0;
  const head1 = ">ONE Homo sapiens alu\n";
  for (let i = 0; i < head1.length; i++) buf[size++] = <u8>head1.charCodeAt(i);
  let k = 0;
  for (let left = 2 * n; left > 0; left -= 60) {
    const m = left < 60 ? left : 60;
    for (let i = 0; i < m; i++) {
      buf[size++] = <u8>alu.charCodeAt(k);
      if (++k == alu.length) k = 0;
    }
    buf[size++] = 10;
  }
  let seed: u32 = 42;
  for (let part = 0; part < 2; part++) {
    const head = part == 0 ? ">TWO IUB ambiguity codes\n" : ">THREE Homo sapiens frequency\n";
    for (let i = 0; i < head.length; i++) buf[size++] = <u8>head.charCodeAt(i);
    const chars = part == 0 ? "acgtBDHKMNRSVWY" : "acgt";
    const probs: f64[] = part == 0
      ? [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02]
      : [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008];
    const cum = new Array<f64>(probs.length);
    let c = 0.0;
    for (let i = 0; i < probs.length; i++) { c += probs[i]; cum[i] = c; }
    for (let left = (part == 0 ? 3 : 5) * n; left > 0; left -= 60) {
      const m = left < 60 ? left : 60;
      for (let i = 0; i < m; i++) {
        seed = (seed * 3877 + 29573) % 139968;
        const r = <f64>seed / 139968.0;
        let j = 0;
        while (j < cum.length - 1 && r >= cum[j]) j++;
        buf[size++] = <u8>chars.charCodeAt(j);
      }
      buf[size++] = 10;
    }
  }
  return buf.subarray(0, size);
}

export function setup(n: i32): void {
  input = fasta(n);
}

// fgets over the fasta text: [start, end) of the next line, '\n' included.
let position = 0;
let lineStart = 0;
function nextLine(): bool {
  if (position >= input.length) return false;
  lineStart = position;
  while (position < input.length && input[position++] != 10) {}
  return true;
}

function startsWith(s: string): bool {
  if (position - lineStart < s.length) return false;
  for (let i = 0; i < s.length; i++) if (<i32>input[lineStart + i] != s.charCodeAt(i)) return false;
  return true;
}

export function bench(n: i32): u32 {
  position = 0;
  while (nextLine() && !startsWith(">THREE")) {}
  let poly = new Uint8Array(1048576);
  let length = 0;
  while (nextLine() && input[lineStart] != 62) {
    for (let i = lineStart; i < position; i++) {
      const c = input[i];
      if (c != 10) poly[length++] = codeForNucleotide(c);
    }
    if (poly.length - length < 4096) {
      const grown = new Uint8Array(poly.length * 2);
      grown.set(poly);
      poly = grown;
    }
  }
  poly = poly.subarray(0, length);

  const outputs = new Array<string>(7);
  outputs[6] = generateCount(poly, "GGTATTTTAATTTATAGT");
  outputs[5] = generateCount(poly, "GGTATTTTAATT");
  outputs[4] = generateCount(poly, "GGTATT");
  outputs[3] = generateCount(poly, "GGTA");
  outputs[2] = generateCount(poly, "GGT");
  outputs[1] = generateFrequencies(poly, 2);
  outputs[0] = generateFrequencies(poly, 1);

  let h: u32 = 2166136261;
  for (let i = 0; i < 7; i++) {
    const s = outputs[i] + "\n";
    for (let j = 0; j < s.length; j++) h = (h ^ <u32>s.charCodeAt(j)) * 16777619;
  }
  return h;
}
