// BG regex-redux Dart #5 (Isaac Gouy, RegExp from Jos Hirth's program), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-dartexe-5.html
// Changes: dart compile wasm (WasmGC) in place of dart compile exe; single-
// threaded (the isolate's job runs after the counts); /dev/stdin -> the fasta
// text setup(n) makes; print -> FNV-1a 32 over the bytes it would print,
// returned by bench(n). dart2wasm's RegExp is the host's (JavaScript RegExp
// through JS interop), not Dart VM's engine.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Isaac Gouy, RegExp from Jos Hirth's program
*/

import 'dart:js_interop';

String run(String s) {
  final out = StringBuffer();
  final z = (s.replaceAll(RegExp('>.*\n|\n', multiLine: true), ''));

  printPatternMatches(z, out);
  final initial = s.length;
  final cleaned = z.length;
  final magicLength = magicLengthOf(z);
  out.write('\n$initial\n$cleaned\n$magicLength\n');
  return out.toString();
}

void printPatternMatches(String s, StringBuffer out) {
  const simple = [
    'agggtaaa|tttaccct',
    '[cgt]gggtaaa|tttaccc[acg]',
    'a[act]ggtaaa|tttacc[agt]t',
    'ag[act]gtaaa|tttac[agt]ct',
    'agg[act]taaa|ttta[agt]cct',
    'aggg[acg]aaa|ttt[cgt]ccct',
    'agggt[cgt]aa|tt[acg]accct',
    'agggta[cgt]a|t[acg]taccct',
    'agggtaa[cgt]|[acg]ttaccct'
  ];

  for (var each in simple) {
    final regex = RegExp(each, multiLine: true);
    out.write('$each ${regex.allMatches(s).length}\n');
  }
}

int magicLengthOf(String s) {
  const magic = [
    ['tHa[Nt]', '<4>'],
    ['aND|caN|Ha[DS]|WaS', '<3>'],
    ['a[NSt]|BY', '<2>'],
    ['<[^>]*>', '|'],
    ['\\|[^|][^|]*\\|', '-'],
  ];

  for (var each in magic) {
    final regex = RegExp(each.first, multiLine: true);
    s = s.replaceAll(regex, each.last);
  }
  return s.length;
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
String input = '';

String fasta(int n) {
  const alu = 'GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA';
  final out = <int>[];
  out.addAll('>ONE Homo sapiens alu\n'.codeUnits);
  var k = 0;
  for (var left = 2 * n; left > 0; left -= 60) {
    final m = left < 60 ? left : 60;
    for (var i = 0; i < m; i++) {
      out.add(alu.codeUnitAt(k));
      if (++k == alu.length) k = 0;
    }
    out.add(10);
  }
  var seed = 42;
  void random(String chars, List<double> probs, int count) {
    final cum = <double>[];
    var c = 0.0;
    for (final p in probs) {
      c += p;
      cum.add(c);
    }
    for (var left = count; left > 0; left -= 60) {
      final m = left < 60 ? left : 60;
      for (var i = 0; i < m; i++) {
        seed = (seed * 3877 + 29573) % 139968;
        final r = seed / 139968;
        var j = 0;
        while (j < cum.length - 1 && r >= cum[j]) j++;
        out.add(chars.codeUnitAt(j));
      }
      out.add(10);
    }
  }

  out.addAll('>TWO IUB ambiguity codes\n'.codeUnits);
  random('acgtBDHKMNRSVWY', [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
  out.addAll('>THREE Homo sapiens frequency\n'.codeUnits);
  random('acgt', [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
  return String.fromCharCodes(out);
}

void setup(int n) {
  input = fasta(n);
}

int bench(int n) {
  final s = run(input);
  var h = 2166136261;
  for (final c in s.codeUnits) {
    h = ((h ^ c) * 16777619) & 0xffffffff;
  }
  return h;
}

@JS('bench')
external set _bench(JSFunction f);
@JS('setup')
external set _setup(JSFunction f);

void main() {
  _bench = bench.toJS;
  _setup = setup.toJS;
}
