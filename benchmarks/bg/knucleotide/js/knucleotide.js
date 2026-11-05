// BG k-nucleotide Node #3 (Dani Biro, after Node #2), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-node-3.html
// Changes: single-threaded (the four workers' jobs run in order, the sequence
// in a plain Uint8Array instead of a SharedArrayBuffer); readline over stdin ->
// the lines of the fasta text setup(n) makes; stdout -> FNV-1a 32 over the
// bytes it would print, returned by bench(n). One fix: BG's frequency() stops
// `length` windows early (`i < n`), which BG's own check output shows at
// fasta 1000 ("T 31.500", not 31.520); it now counts every window.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   Based on Node js #2 implementation of Jesse Millikan, Matt Baker and Roman Pletnev
   Contributed by Dani Biro
*/

'use strict';

function RefNum (num) { this.num = num; }
RefNum.prototype.toString = function () { return this.num.toString(); };

function sliceToInt (seq, start, end) {
  let val = 0;
  for (let i = start; i < end; ++i) {
    val = (val * 4) + seq[i];
  }
  return val;
}

function bitwiseTrimLeft (value, length) {
  return (
    value - (Math.floor(value / Math.pow(2, length)) * Math.pow(2, length))
  );
}

const keyMap = ['a', 't', 'c', 'g'];

function keyToString (value, length) {
  const str = new Array(length);
  for (let i = 0; i < length; ++i) {
    const key = bitwiseTrimLeft(value, 2);
    str[length - i - 1] = keyMap[key];
    value = Math.floor(value / 4);
  }
  return str.join('').toUpperCase();
}

function frequency (seq, length) {
  const freq = new Map();
  const n = seq.length - length + 1;
  const maskLength = length * 2 - 2;
  let key = sliceToInt(seq, 0, length);

  for (let i = length; i <= seq.length; ++i) { // BG: i < n
    const cur = freq.get(key);
    if (cur === undefined) {
      freq.set(key, new RefNum(1));
    } else {
      cur.num++;
    }
    key = bitwiseTrimLeft(key, maskLength) * 4 + seq[i];
  }
  return freq;
}

function sort (seq, length) {
  const f = frequency(seq, length);
  const keys = Array.from(f.keys());
  const n = seq.length - length + 1;
  const res = [];
  keys.sort((a, b) => f.get(b) - f.get(a));
  const len = keys.length;

  for (let i = 0; i < len; ++i) {
    const key = keys[i];
    res.push(`${keyToString(key, length)} ${(f.get(key) * 100 / n).toFixed(3)}\n`);
  }

  res.push('\n');
  return res.join('');
}

function toTransformedBuffer (str) {
  const sharedArray = new Uint8Array(str.length);
  for (let i = 0; i < sharedArray.length; ++i) {
    switch (str.charAt(i)) {
      case 't':
        sharedArray[i] = 1;
        break;
      case 'c':
        sharedArray[i] = 2;
        break;
      case 'g':
        sharedArray[i] = 3;
        break;
    }
  }
  return sharedArray;
}

function find (seq, str) {
  const f = frequency(seq, str.length);
  const buffer = toTransformedBuffer(str);
  return `${f.get(sliceToInt(buffer, 0, str.length)) || 0}\t${str.toUpperCase()}\n`;
}

function transformArray (arr) {
  for (let i = 0; i < arr.length; ++i) {
    const x = arr[i];
    if (x === 97) {
      arr[i] = 0;
    } else if (x === 116) {
      arr[i] = 1;
    } else if (x === 99) {
      arr[i] = 2;
    } else {
      arr[i] = 3;
    }
  }
}

// The master's reading: the lines after ">THREE", joined; then the workers' jobs.
function run (input) {
  const lines = [];
  let reading = false;
  for (let start = 0; start < input.length;) {
    let end = input.indexOf('\n', start);
    if (end < 0) end = input.length;
    const line = input.slice(start, end);
    start = end + 1;
    if (reading) {
      lines.push(line);
    } else if (line[0] === '>') {
      reading = line.slice(0, 6) === '>THREE';
    }
  }
  const str = lines.join('');
  const seq = new Uint8Array(str.length);
  for (let i = 0; i < str.length; ++i) seq[i] = str.charCodeAt(i);
  transformArray(seq);
  const res = [];
  res.push(sort(seq, 1));
  res.push(sort(seq, 2));
  res.push(find(seq, 'ggt'));
  res.push(find(seq, 'ggta'));
  res.push(find(seq, 'ggtatt'));
  res.push(find(seq, 'ggtattttaatt'));
  res.push(find(seq, 'ggtattttaatttatagt'));
  return res.join('');
}

// ---- setup(n): BG fasta's output for n, as the string stdin would give
// (ALU repeated for 2n, IUB random for 3n, Homo sapiens random for 5n, lines
// of 60; LCG seed 42, cumulative probabilities in double). Untimed.
let INPUT = '';
function fasta (n) {
  const ALU = 'GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA';
  const out = [];
  let line = '';
  const put = c => { line += c; };
  out.push('>ONE Homo sapiens alu\n');
  let k = 0;
  for (let left = 2 * n; left > 0; left -= 60) {
    line = '';
    for (let i = 0, m = Math.min(60, left); i < m; i++) { put(ALU[k]); if (++k === ALU.length) k = 0; }
    out.push(line + '\n');
  }
  let seed = 42;
  const random = (chars, probs, count) => {
    const cum = [];
    let c = 0;
    for (const p of probs) cum.push(c += p);
    for (let left = count; left > 0; left -= 60) {
      line = '';
      for (let i = 0, m = Math.min(60, left); i < m; i++) {
        seed = (seed * 3877 + 29573) % 139968;
        const r = seed / 139968;
        let j = 0;
        while (j < cum.length - 1 && r >= cum[j]) j++;
        put(chars[j]);
      }
      out.push(line + '\n');
    }
  };
  out.push('>TWO IUB ambiguity codes\n');
  random('acgtBDHKMNRSVWY', [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
  out.push('>THREE Homo sapiens frequency\n');
  random('acgt', [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
  return out.join('');
}

function setup (n) { INPUT = fasta(n); }

function bench (n) {
  const s = run(INPUT);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
