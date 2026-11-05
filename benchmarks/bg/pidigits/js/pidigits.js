/* The Computer Language Benchmarks Game, pidigits Node #4
   https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-node-4.html

   contributed by Denis Gribov
   based on C source code by Ledhug
   js BigInt replaced with gmplib by Andrey Filatkin
   un-buffered by Isaac Gouy

   Adapted for d8: mpzjs (a native Node addon over GMP) -> JS BigInt, each
   MPZ call as the BigInt expression it computes (the program before Andrey
   Filatkin's change used BigInt); top-level code -> bench(n) returning the
   FNV-1a hash of the bytes console.log printed.
*/

function fnv(h, s) {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h;
}

function bench(n) {
  let h = 2166136261 | 0;
  let i = 0, ns = 0;
  let k = 0;
  let k2 = 1;
  let acc = 0n;
  let den = 1n;
  let num = 1n;
  let tmp, d3, d4;

  while (i < n) {
    k++;
    k2 += 2;

    acc += num * 2n;
    acc *= BigInt(k2);
    den *= BigInt(k2);
    num *= BigInt(k);

    if (num > acc) {
      continue;
    }

    tmp = num * 3n;
    tmp += acc;
    d3 = tmp / den;

    tmp += num;
    d4 = tmp / den;

    if (d3 !== d4) {
      continue;
    }

    const d = Number(d3);
    ns = ns * 10 + d;
    i++;
    let last = i >= n;
    if (i % 10 == 0 || last) {
      h = fnv(h, pad(ns, last) + '\t:' + i + '\n');
      ns = 0;
    }

    if (last) break;

    acc -= den * d3;
    acc *= 10n;
    num *= 10n;
  }
  return h >>> 0;
}

function pad(i, last) {
  var res = i.toString(), count;
  count = 10 - res.length;
  while (count > 0) {
    last ? res += ' ' : res = '0' + res;
    count--;
  }
  return res;
}
