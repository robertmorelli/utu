// BG regex-redux Node #3 (Jesse Millikan, ..., Andrey Filatkin), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-node-3.html
// Changes: single-threaded (the replacement worker's job runs after the
// counts); stdin -> the fasta text setup(n) makes; console.log -> FNV-1a 32
// over the bytes it would print, returned by bench(n). V8's RegExp (Irregexp).

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// regex-dna program contributed by Jesse Millikan
// Base on the Ruby version by jose fco. gonzalez
// fixed by Matthew Wilson
// ported to Node.js and sped up by Roman Pletnev
// converted from regex-dna program
// fixed by Josh Goldfoot
// multi thread by Andrey Filatkin

function run(input) {
    const regExps = [
        /agggtaaa|tttaccct/ig,
        /[cgt]gggtaaa|tttaccc[acg]/ig,
        /a[act]ggtaaa|tttacc[agt]t/ig,
        /ag[act]gtaaa|tttac[agt]ct/ig,
        /agg[act]taaa|ttta[agt]cct/ig,
        /aggg[acg]aaa|ttt[cgt]ccct/ig,
        /agggt[cgt]aa|tt[acg]accct/ig,
        /agggta[cgt]a|t[acg]taccct/ig,
        /agggtaa[cgt]|[acg]ttaccct/ig
    ];
    const out = [];

    let data = input;
    const initialLen = data.length;

    data = data.replace(/^>.*\n|\n/mg, '');
    const cleanedLen = data.length;

    for (let j = 0; j < regExps.length; j++) {
        const re = regExps[j];
        const m = data.match(re);
        out.push(re.source + ' ' + (m ? m.length : 0) + '\n');
    }

    const endLen = workerThread(data);

    out.push(`\n${initialLen}\n${cleanedLen}\n${endLen}\n`);
    return out.join('');
}

function workerThread(str) {
    return str
        .replace(/tHa[Nt]/g, '<4>')
        .replace(/aND|caN|Ha[DS]|WaS/g, '<3>')
        .replace(/a[NSt]|BY/g, '<2>')
        .replace(/<[^>]*>/g, '|')
        .replace(/\|[^|][^|]*\|/g, '-')
        .length;
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
