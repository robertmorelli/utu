// BG spectralnorm Dart #6 (dart exe; Isaac Gouy, Span from Andrey Filatkin's Node #6), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-dartexe-6.html
// Changes: dart compile wasm (WasmGC); one thread: mapToIsolates (spans sent to
// isolates, each returning auFromTo/atuFromTo of its rows, copied into the w out
// reference) -> one span 0..n computed here and copied into w, as the main isolate
// did; no async. main() publishes bench(n) on globalThis, which returns the FNV-1a
// hash of the bytes main() printed.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Isaac Gouy
   (Span.initialize from Andrey Filatkin's JavaScript #6 program)
*/

import 'dart:js_interop';
import 'dart:math';
import 'dart:typed_data';

double a(int i, int j) {
  return 1.0 / (((i + j) * (i + j + 1) >> 1) + i + 1);
}

Float64List auFromTo(int start, int end, Float64List u) {
  final n = u.length;
  final w = new Float64List(n);
  for (int i = start; i < end; ++i) {
    double t = 0.0;
    for (int j = 0; j < n; ++j) {
      t += u[j] * a(i, j);
    }
    w[i] = t;
  }
  return w;
}

Float64List atuFromTo(int start, int end, Float64List u) {
  final n = u.length;
  final w = new Float64List(n);
  for (int i = start; i < end; ++i) {
    double t = 0.0;
    for (int j = 0; j < n; ++j) {
      t += u[j] * a(j, i);
    }
    w[i] = t;
  }
  return w;
}

// same w out reference style as sequential program
void au(Float64List u, Float64List w) {
  final n = u.length;
  List.copyRange(w, 0, auFromTo(0, n, u), 0, n);
}

// same w out reference style as sequential program
void atu(Float64List u, Float64List w) {
  final n = u.length;
  List.copyRange(w, 0, atuFromTo(0, n, u), 0, n);
}

// same w out reference style as sequential program
void atAu(Float64List u, Float64List v, Float64List w) {
  au(u, w);
  atu(w, v);
}

double spectralNorm(int n) {
  var u = new Float64List(n)..fillRange(0, n, 1.0),
      v = new Float64List(n),
      w = new Float64List(n),
      vBv = 0.0,
      vv = 0.0;
  // same w out reference style as sequential program
  for (int i = 0; i < 10; ++i) {
    atAu(u, v, w);
    atAu(v, u, w);
  }
  for (int i = 0; i < n; ++i) {
    vBv += u[i] * v[i];
    vv += v[i] * v[i];
  }
  return sqrt(vBv / vv);
}

int bench(int n) {
  final s = spectralNorm(n).toStringAsFixed(9) + '\n';
  var h = 2166136261;
  for (final c in s.codeUnits) {
    h = ((h ^ c) * 16777619) & 0xffffffff;
  }
  return h;
}

@JS('bench')
external set _bench(JSFunction f);

void main() {
  _bench = bench.toJS;
}
