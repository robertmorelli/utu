// BG revcomp Dart #5 (dart exe; Isaac Gouy after Jeremy Zerfas's C #6), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-dartexe-5.html
// Changes: dart compile wasm (WasmGC); single-threaded: each sequence is
// reverse-complemented and written in turn (other() in place of Isolate.spawn;
// the ports that ordered the writes are then not needed). `await for (block in
// stdin)` -> the fasta output setup(n) generated (fasta Dart #5's generator,
// below, with out() appending to it), in 65,536-byte blocks (copies, as stdin's
// reads are); stdout.add -> write(), FNV-1a over the bytes. Like BG's, it expects
// at most one '>' per block (true for n >= 33,000). main -> bench(n), published on
// globalThis with setup.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Isaac Gouy based on Jeremy Zerfas's #6 C program 
*/

import 'dart:js_interop';
import 'dart:typed_data';

// ---- input: the fasta output setup(n) generates
final input = BytesBuilder(copy: true);
Uint8List inputBytes = Uint8List(0);
void out(List<int> bytes) {
  input.add(bytes);
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

void setup(int n) {
  input.clear();
  fasta(n);
  inputBytes = input.takeBytes();
}

// ---- output: FNV-1a over what the program writes
int outHash = 0;
void write(Uint8List bytes) {
  var h = outHash;
  for (var i = 0; i < bytes.length; i++) {
    h = ((h ^ bytes[i]) * 16777619) & 0xffffffff;
  }
  outHash = h;
}

// nl: the fasta generator's (same value).
final def = '>'.codeUnitAt(0); // Definition-line.
final lut = codeComplementLookupTable();

// READ_SIZE probably 64x1024 ?
const readSize = 64 * 1024;

int bench(int n) {
  outHash = 2166136261;
  var sequence = BytesBuilder(copy: false);
  for (var pos = 0; pos < inputBytes.length; pos += readSize) {
    var block = inputBytes.sublist(pos, pos + readSize < inputBytes.length ? pos + readSize : inputBytes.length);
    var sequenceStart = block.indexOf(def);
    if (sequenceStart >= 0) {
      if (sequence.length > 0) {
        sequence.add(block.sublist(0, sequenceStart));
        other(sequence.takeBytes());
        sequence.add(block.sublist(sequenceStart, block.length));
        continue;
      }
    }
    sequence.add(block);
  }
  other(sequence.takeBytes());
  return outHash;
}

void other(Uint8List bytes) {
  var frontPos = bytes.indexOf(nl) + 1;
  var backPos = bytes.length - 1;
  while (frontPos <= backPos && bytes[frontPos] == nl) frontPos++;
  while (frontPos <= backPos && bytes[backPos] == nl) backPos--;

  while (frontPos <= backPos) {
    var tmp = lut[bytes[frontPos]];
    bytes[frontPos] = lut[bytes[backPos]];
    bytes[backPos] = tmp;
    while (bytes[++frontPos] == nl);
    while (bytes[--backPos] == nl);
  }
  write(bytes);
}

Uint8List codeComplementLookupTable() {
  final code =       'ABCDGHKMNRSTUVWY'.codeUnits;
  final complement = 'TVGHCDMKNYSAABWR'.codeUnits;
  final lowercaseOffset = 'a'.codeUnitAt(0) - 'A'.codeUnitAt(0);
  final t = Uint8List.fromList(List.generate(128, (int i) => i));
  for (var i = 0; i < code.length; i++) {
    t[code[i]] = complement[i];
    t[code[i] + lowercaseOffset] = complement[i];
  }
  return t;
}

@JS('bench')
external set _bench(JSFunction f);
@JS('setup')
external set _setup(JSFunction f);

void main() {
  _bench = bench.toJS;
  _setup = setup.toJS;
}
