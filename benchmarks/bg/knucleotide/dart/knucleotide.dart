// BG k-nucleotide Dart #3 (dart exe; Philip Rogers, Dwayne Slater), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-dartexe-3.html
// Changes: dart compile wasm (WasmGC) in place of dart compile exe; single-
// threaded (the three Isolate.spawn jobs run in order); readCodes over stdin ->
// the same LineSplitter/skipWhile/takeWhile pipeline over the fasta text
// setup(n) makes, synchronously; print -> a StringBuffer whose bytes are
// hashed (FNV-1a 32) and returned by bench(n), which main() publishes on
// globalThis. find() prints 0 for an absent fragment (BG prints "null", which
// BG's own check output for fasta 1000 shows as 0).

import 'dart:convert';
import 'dart:collection';
import 'dart:js_interop';
import 'dart:typed_data';

/* The Computer Language Benchmarks Game

   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   Contributed by Philip Rogers
   Based on a javascript implementation by Jesse Millikan and Matt Baker
   Optimized and parallelized by Dwayne Slater
   + null safety    
*/

final StringBuffer out = StringBuffer();
void print(Object s) { out.write(s); out.write('\n'); }

class CodeList {
  Uint64List buffer;
  int length;
  int codeBuffer = 0;
  int codeBufferLen = 32;
  int codeLen = 0;

  CodeList(int initialCapacity)
      : buffer = Uint64List(initialCapacity),
        length = 0;

  void appendBuffer(int codes) {
    if (length == buffer.length) {
      final newBuffer = Uint64List(length * 2);
      newBuffer.setRange(0, length, buffer);
      buffer = newBuffer;
    }
    buffer[length++] = codes;
  }

  void add(int n) {
    codeBuffer = (codeBuffer << 2) | n;
    if ((--codeBufferLen) == 0) {
      appendBuffer(codeBuffer);
      codeBuffer = 0;
      codeBufferLen = 32;
    }
  }

  void flush() {
    codeLen = (length * 32) + (32 - codeBufferLen);
    while (codeBuffer != 0) add(0);
  }
}

String codeToString(int code, int len) {
  final b = Uint8List(len);
  for (int i = len - 1; i >= 0; i--) {
    const int $A = 0x41;
    const int $T = 0x54;
    const int $C = 0x43;
    const int $G = 0x47;
    b[i] = const [$A, $C, $T, $G][code & 3];
    code >>= 2;
  }
  return String.fromCharCodes(b);
}

Map<String, int> frequency(CodeList codes, int length) {
  final freq = HashMap<int, int>();
  final int shift = 64 - (length * 2);
  int window = codes.buffer[0];
  int next = codes.buffer[1];
  int count = codes.codeLen - length + 1;
  int cd = 32;
  int i = 2;
  while (count > 0) {
    freq[window >> shift] = (freq[window >> shift] ?? 0) + 1;

    window = (window << 2) | ((next >> 62) & 0x3);
    next <<= 2;
    count--;

    if ((--cd) == 0) {
      cd = 32;
      next = codes.buffer[i++];
    }
  }

  return Map.fromEntries(freq.entries.map((entry) => MapEntry(
      codeToString(entry.key.toUnsigned(length * 2), length), entry.value)));
}

void sort(CodeList codes, int length) {
  final freq = frequency(codes, length);
  final keys = freq.keys.toList();
  int n = codes.codeLen - length + 1;

  keys.sort((a, b) {
    int _a = freq[a] ?? 0;
    int _b = freq[b] ?? 0;
    return _b - _a;
  });

  for (final key in keys) {
    String count = ((freq[key] ?? 0) * 100 / n).toStringAsFixed(3);
    print('$key $count');
  }
  print('');
}

String find(CodeList codes, String string) {
  Map<String, int> freq = frequency(codes, string.length);
  return '${(freq[string] ?? 0)}\t$string'; // BG: freq[string] ("null" when absent)
}

CodeList readCodes() {
  final codeList = CodeList(1024 * 1024 * 4);
  LineSplitter.split(input)
      .skipWhile((line) => !line.startsWith(">THREE"))
      .skip(1)
      .takeWhile((line) => !line.startsWith(">"))
      .forEach((line) {
    final units = line.codeUnits;
    for (int i = 0; i < units.length; i++) {
      codeList.add((units[i] >> 1) & 3);
    }
  });
  codeList.flush();
  return codeList;
}

void run() {
  final sequence = readCodes();
  // BG: three Isolate.spawn jobs (par), awaited after the sorts.
  final a = ['GGT', 'GGTA', 'GGTATT'].map((s) => find(sequence, s)).toList();
  final b = ['GGTATTTTAATT'].map((s) => find(sequence, s)).toList();
  final c = ['GGTATTTTAATTTATAGT'].map((s) => find(sequence, s)).toList();
  sort(sequence, 1);
  sort(sequence, 2);
  a.forEach(print);
  b.forEach(print);
  c.forEach(print);
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
String input = '';

String fasta(int n) {
  const alu = 'GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA';
  final o = <int>[];
  o.addAll('>ONE Homo sapiens alu\n'.codeUnits);
  var k = 0;
  for (var left = 2 * n; left > 0; left -= 60) {
    final m = left < 60 ? left : 60;
    for (var i = 0; i < m; i++) {
      o.add(alu.codeUnitAt(k));
      k = (k + 1) % alu.length;
    }
    o.add(10);
  }
  var seed = 42;
  void random(String chars, List<double> probs, int count) {
    final cum = <double>[];
    var c = 0.0;
    for (final p in probs) cum.add(c += p);
    for (var left = count; left > 0; left -= 60) {
      final m = left < 60 ? left : 60;
      for (var i = 0; i < m; i++) {
        seed = (seed * 3877 + 29573) % 139968;
        final r = seed / 139968;
        var j = 0;
        while (j < cum.length - 1 && r >= cum[j]) j++;
        o.add(chars.codeUnitAt(j));
      }
      o.add(10);
    }
  }
  o.addAll('>TWO IUB ambiguity codes\n'.codeUnits);
  random('acgtBDHKMNRSVWY', [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n);
  o.addAll('>THREE Homo sapiens frequency\n'.codeUnits);
  random('acgt', [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n);
  return String.fromCharCodes(o);
}

void setup(int n) {
  input = fasta(n);
}

int bench(int n) {
  out.clear();
  run();
  final s = out.toString();
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
