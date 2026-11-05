// BG mandelbrot Dart #4 (dart exe; Isaac Gouy, renderRow from Andrey Filatkin's Node #3), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-dartexe-4.html
// Changes: dart compile wasm (WasmGC); one thread: renderRows runs here for one
// segment 0..h (was four weighted segments, each on an Isolate returning its
// rows); main() publishes bench(n) on globalThis, which returns the FNV-1a hash of
// the bytes main() wrote (header, then the rows). renderRow unchanged.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   Use Isolate.exit() added in Dart 2.15 
   Contributed by Isaac Gouy. Make time on each Isolate similar.
   renderRow from Andrey Filatkin's node #3 program. 
*/

import 'dart:js_interop';
import 'dart:typed_data';

const iter = 50, limit = 4.0;

int fnv(int h, List<int> bytes) {
  for (final c in bytes) {
    h = ((h ^ c) * 16777619) & 0xffffffff;
  }
  return h;
}

int bench(int n) {
  final h = n, w = h;
  var hash = fnv(2166136261, 'P4\n$w $h\n'.codeUnits);
  for (var row in renderRows(Index(0, h, h))) {
    hash = fnv(hash, row);
  }
  return hash;
}

List<Uint8List> renderRows(Index index) {
  final int w = index.n;
  final bytesPerRow = w >> 3;

  final initialR = new Float64List(w);
  final initialI = new Float64List(w);
  final inv = 2 / w;
  for (var xy = 0; xy < w; xy++) {
    final i = inv * xy;
    initialR[xy] = i - 1.5;
    initialI[xy] = i - 1.0;
  }

  Uint8List renderRow(int y) {
    final row = Uint8List(bytesPerRow);

    for (var xByte = 0; xByte < bytesPerRow; xByte++) {
      final ci = initialI[y];
      var res = 0;
      for (var i = 0; i < 8; i += 2) {
        final x = xByte << 3;
        final cr1 = initialR[x + i];
        final cr2 = initialR[x + i + 1];

        var zr1 = cr1;
        var zi1 = ci;

        var zr2 = cr2;
        var zi2 = ci;

        var b = 0;

        for (var j = 0; j < iter; j++) {
          final tr1 = zr1 * zr1;
          final ti1 = zi1 * zi1;
          zi1 = 2 * zr1 * zi1 + ci;
          zr1 = tr1 - ti1 + cr1;

          if (tr1 + ti1 > limit) {
            b |= 2;
            if (b == 3) {
              break;
            }
          }

          final tr2 = zr2 * zr2;
          final ti2 = zi2 * zi2;
          zi2 = 2 * zr2 * zi2 + ci;
          zr2 = tr2 - ti2 + cr2;

          if (tr2 + ti2 > limit) {
            b |= 1;
            if (b == 3) {
              break;
            }
          }
        }
        res = (res << 2) | b;
      }
      row[xByte] = ~res;
    }
    return row;
  }

  final rows = <Uint8List>[];
  for (var y = index.lo; y < index.hi; y++) {
    rows.add(renderRow(y));
  }
  return rows;
}

class Index {
  var lo = 0, hi = 0, n = 0;
  Index(this.lo, this.hi, this.n);
}

@JS('bench')
external set _bench(JSFunction f);

void main() {
  _bench = bench.toJS;
}
