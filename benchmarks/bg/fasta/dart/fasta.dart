// BG fasta Dart #5 (dart exe; Isaac Gouy after Jeremy Zerfas's C #5), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-dartexe-5.html
// Changes: dart compile wasm (WasmGC); single-threaded: the three sequences are
// built in order on one isolate (no Isolate.spawn/ports; forwardLcgSeed, which
// only let the third start before the second finished, is then not needed: the
// seed just continues). stdout.writeln/add -> out(), the output sink (here:
// FNV-1a over the bytes); main -> fasta(n) (seed reset) and bench(n), published
// on globalThis. Programs that read fasta's output copy the block between
// the "fasta generator" markers and make out() append (scratchpad fasta-input.md).

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Isaac Gouy based on Jeremy Zerfas's #5 C program 
   Write buffered, naive parallel.
*/

import 'dart:js_interop';
import 'dart:typed_data';

// ---- output sink: what BG writes to stdout goes here
int fnvHash = 0;
void out(List<int> bytes) {
  var h = fnvHash;
  for (var i = 0; i < bytes.length; i++) {
    h = ((h ^ bytes[i]) * 16777619) & 0xffffffff;
  }
  fnvHash = h;
}

void outln(String s) {
  out(s.codeUnits);
  out(const [10]);
}
// ---- fasta generator: copy from here to "end of the fasta generator"

const width = 60;
final nl = '\n'.codeUnitAt(0);

Uint8List repeatedSequence(String sequence, int size) {
  final codes = sequence.codeUnits;
  final codesLength = codes.length;
  final lines = BytesBuilder();

  final codesExtended = Uint8List(codesLength + width);
  for (var column = 0; column < codesLength + width; column++) {
    codesExtended[column] = codes[column % codesLength];
  }
  var offset = 0;
  var line = Uint8List(width + 1);
  line[width] = nl;
  for (var currentSize = size; currentSize > 0;) {
    var lineLength = width;
    if (currentSize < width) {
      lineLength = currentSize;
      line = Uint8List(lineLength + 1); // Shorten fixed-size last line.
      line[lineLength] = nl;
    }
    line.setRange(0, lineLength, codesExtended, offset);
    offset += lineLength;
    if (offset > codesLength) offset -= codesLength;
    lines.add(line);
    currentSize -= lineLength;
  }
  return lines.takeBytes();
}

const iM = 139968;
const iA = 3877;
const iC = 29573;
var seed = 42;

double nextLcgNumber(int max) {
  seed = (seed * iA + iC) % iM;
  return max / iM * seed;
}

Uint8List weightedLcgSequence(
    String codeString, List<double> probabilities, int size) {
  final codes = codeString.codeUnits;
  final lines = BytesBuilder();
  var sum = 0.0;
  for (var i = 0; i < probabilities.length; i++) {
    sum += probabilities[i];
    probabilities[i] = sum * iM;
  }
  var line = Uint8List(width + 1);
  line[width] = nl;
  for (var currentSize = size; currentSize > 0;) {
    var lineLength = width;
    if (currentSize < width) {
      lineLength = currentSize;
      line = Uint8List(lineLength + 1); // Shorten fixed-size last line.
      line[lineLength] = nl;
    }
    final last = probabilities.length - 1;
    for (var column = 0; column < lineLength; column++) {
      final r = nextLcgNumber(iM);
      var i = 0;
      for (; i < last; i++) {
        if (probabilities[i] > r) break;
      }
      line[column] = codes[i];
    }
    lines.add(line);
    currentSize -= lineLength;
  }
  return lines.takeBytes();
}

void fasta(int n) {
  seed = 42;

  outln('>ONE Homo sapiens alu');
  out(repeatedSequence(
      'GGCCGGGCGCGGTGGCTCACGCCT'
          'GTAATCCCAGCACTTTGGGAGGCC'
          'GAGGCGGGCGGATCACCTGAGGTC'
          'AGGAGTTCGAGACCAGCCTGGCCA'
          'ACATGGTGAAACCCCGTCTCTACT'
          'AAAAATACAAAAATTAGCCGGGCG'
          'TGGTGGCGCGCGCCTGTAATCCCA'
          'GCTACTCGGGAGGCTGAGGCAGGA'
          'GAATCGCTTGAACCCGGGAGGCGG'
          'AGGTTGCAGTGAGCCGAGATCGCG'
          'CCACTGCACTCCAGCCTGGGCGAC'
          'AGAGCGAGACTCCGTCTCAAAAA',
      n * 2));

  outln('>TWO IUB ambiguity codes');
  out(weightedLcgSequence(
      'acgtBDHKMNRSVWY',
      [0.27, 0.12, 0.12, 0.27, 0.02] +
          [0.02, 0.02, 0.02, 0.02, 0.02] +
          [0.02, 0.02, 0.02, 0.02, 0.02],
      n * 3));

  outln('>THREE Homo sapiens frequency');
  out(weightedLcgSequence(
      'acgt',
      [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008],
      n * 5));
}
// ---- end of the fasta generator

int bench(int n) {
  fnvHash = 2166136261;
  fasta(n);
  return fnvHash;
}

@JS('bench')
external set _bench(JSFunction f);

void main() {
  _bench = bench.toJS;
}
