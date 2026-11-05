/* The Computer Language Benchmarks Game, pidigits Dart #2 (dart exe)
   https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-dartexe-2.html

   contributed by Isaac Gouy, updated Alexander Fyodorov's Dart #2

   Adapted for Wasm: calculatePi(arg) -> bench(n) returning the FNV-1a hash
   of the bytes it printed (print adds "\n"); main sets globalThis.bench.
   BigInt is Dart's own (dart2wasm implements it in Dart, not on JS BigInt).
*/

import 'dart:js_interop';

@JS('bench')
external set _bench(JSFunction f);

void main() {
  _bench = bench.toJS;
}

int fnv(int h, String s) {
  for (final c in s.codeUnits) {
    h = ((h ^ c) * 16777619) & 0xffffffff;
  }
  return h;
}

String pad(i, last) {
  var res = i.toString(), count;
  count = 10 - res.length;
  while (count > 0) {
    last ? res += ' ' : res = '0' + res;
    count--;
  }
  return res;
}

int bench(int arg) {
  var h = 2166136261;
  var i = 0, ns = 0;

  final bigint_three = new BigInt.from(3);
  final bigint_ten = new BigInt.from(10);

  var k = BigInt.zero;
  var k1 = BigInt.one;
  var a = BigInt.zero;
  var d = BigInt.one;
  var m = BigInt.zero;
  var n = BigInt.one;
  var t = BigInt.zero;
  var u = BigInt.one;

  while (true) {
    k += BigInt.one;
    k1 += BigInt.two;
    t = n << 1;
    n *= k;
    a += t;
    a *= k1;
    d *= k1;

    if (a.compareTo(n) >= 0) {
      m = n * bigint_three + a;
      t = m ~/ d;
      u = m % d + n;

      if (d.compareTo(u) > 0) {
        ns = ns * 10 + t.toInt();
        i += 1;

        var last = i >= arg;
        if (i % 10 == 0 || last) {
          h = fnv(h, pad(ns, last) + '\t:$i\n');
          ns = 0;
        }

        if (last) break;

        a = (a - d * t) * bigint_ten;
        n = n * bigint_ten;
      }
    }
  }
  return h;
}
