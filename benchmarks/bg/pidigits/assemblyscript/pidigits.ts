// Not on BG: AssemblyScript translated from BG pidigits gcc #2 (Michael Ganss;
// Oleksii Prudkyi; Mike Pall, Wim Couwenberg; Craig Russell; Mr Ledrug):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-gcc-2.html
// AssemblyScript has no bignum, so this file has its own: just the mpz calls
// gcc #2 makes, signed magnitudes in 32-bit limbs (StaticArray<u32>, accessed
// with unchecked as AssemblyScript code does in hot loops) with 64-bit
// intermediates; tdiv_q is Knuth's algorithm D. The same design as utu's port.
// bench(n) returns the FNV-1a hash of the bytes gcc #2 prints.

class Big {
  d: StaticArray<u32>;
  n: i32;
  neg: bool;
  constructor(v: i32) {
    this.d = new StaticArray<u32>(16);
    this.d[0] = <u32>abs(v);
    this.n = v == 0 ? 0 : 1;
    this.neg = v < 0;
  }
}

function reserve(a: Big, cap: i32): void {
  if (a.d.length < cap) {
    const d = new StaticArray<u32>(cap * 2);
    const old = a.d;
    for (let i = 0; i < a.n; i++) unchecked(d[i] = old[i]);
    a.d = d;
  }
}

function norm(d: StaticArray<u32>, n: i32): i32 {
  while (n > 0 && unchecked(d[n - 1]) == 0) n--;
  return n;
}

function setZero(r: Big): void { r.n = 0; r.neg = false; }

function cmpMag(a: Big, b: Big): i32 {
  if (a.n != b.n) return a.n < b.n ? -1 : 1;
  const ad = a.d, bd = b.d;
  for (let i = a.n - 1; i >= 0; i--) {
    const x = unchecked(ad[i]), y = unchecked(bd[i]);
    if (x != y) return x < y ? -1 : 1;
  }
  return 0;
}

function cmp(a: Big, b: Big): i32 {
  if (a.neg != b.neg) return a.neg ? -1 : 1;
  const c = cmpMag(a, b);
  return a.neg ? -c : c;
}

function getSi(a: Big): i32 {
  if (a.n == 0) return 0;
  const v = <i32>a.d[0];
  return a.neg ? -v : v;
}

function addMag(r: Big, a: Big, b: Big): void {
  const an = a.n, bn = b.n;
  reserve(r, an + 1);
  const ad = a.d, bd = b.d, rd = r.d;
  let carry: u64 = 0;
  let i = 0;
  for (; i < bn; i++) {
    const s = <u64>unchecked(ad[i]) + <u64>unchecked(bd[i]) + carry;
    unchecked(rd[i] = <u32>s);
    carry = s >> 32;
  }
  for (; i < an; i++) {
    const s = <u64>unchecked(ad[i]) + carry;
    unchecked(rd[i] = <u32>s);
    carry = s >> 32;
  }
  let n = an;
  if (carry != 0) { unchecked(rd[an] = <u32>carry); n = an + 1; }
  r.n = n;
}

function subMag(r: Big, a: Big, b: Big): void {
  const an = a.n, bn = b.n;
  reserve(r, an);
  const ad = a.d, bd = b.d, rd = r.d;
  let borrow: i64 = 0;
  let i = 0;
  for (; i < bn; i++) {
    const t = <i64>unchecked(ad[i]) - <i64>unchecked(bd[i]) - borrow;
    unchecked(rd[i] = <u32>t);
    borrow = -(t >> 32);
  }
  for (; i < an; i++) {
    const t = <i64>unchecked(ad[i]) - borrow;
    unchecked(rd[i] = <u32>t);
    borrow = -(t >> 32);
  }
  r.n = norm(rd, an);
}

function add(r: Big, a: Big, b: Big): void {
  const aneg = a.neg, bneg = b.neg;
  if (aneg == bneg) {
    if (a.n >= b.n) addMag(r, a, b); else addMag(r, b, a);
    r.neg = aneg && r.n != 0;
  } else if (cmpMag(a, b) >= 0) {
    subMag(r, a, b);
    r.neg = aneg && r.n != 0;
  } else {
    subMag(r, b, a);
    r.neg = bneg && r.n != 0;
  }
}

function mulSi(r: Big, a: Big, s: i32): void {
  const an = a.n;
  if (s == 0 || an == 0) { setZero(r); return; }
  const neg = a.neg != (s < 0);
  const m = <u64><u32>abs(s);
  reserve(r, an + 1);
  const ad = a.d, rd = r.d;
  let carry: u64 = 0;
  for (let i = 0; i < an; i++) {
    const p = <u64>unchecked(ad[i]) * m + carry;
    unchecked(rd[i] = <u32>p);
    carry = p >> 32;
  }
  let n = an;
  if (carry != 0) { unchecked(rd[an] = <u32>carry); n = an + 1; }
  r.n = n;
  r.neg = neg;
}

function mul(r: Big, a: Big, b: Big): void {
  const an = a.n, bn = b.n;
  if (an == 0 || bn == 0) { setZero(r); return; }
  const neg = a.neg != b.neg;
  const ad = a.d, bd = b.d;
  const rd = new StaticArray<u32>(an + bn + 16);
  for (let j = 0; j < bn; j++) {
    const m = <u64>unchecked(bd[j]);
    let carry: u64 = 0;
    for (let i = 0; i < an; i++) {
      const p = <u64>unchecked(ad[i]) * m + <u64>unchecked(rd[i + j]) + carry;
      unchecked(rd[i + j] = <u32>p);
      carry = p >> 32;
    }
    unchecked(rd[an + j] = <u32>carry);
  }
  r.d = rd;
  r.n = norm(rd, an + bn);
  r.neg = neg;
}

// q = a / b truncated; Knuth's algorithm D, un/vn hold the normalized copies.
function tdivQ(q: Big, a: Big, b: Big, un: Big, vn: Big): void {
  const n = b.n, an = a.n, m = an - n;
  const neg = a.neg != b.neg;
  if (m < 0) { setZero(q); return; }
  if (n == 1) {
    const v = <u64>b.d[0];
    reserve(q, an);
    const ad = a.d, qd = q.d;
    let rem: u64 = 0;
    for (let i = an - 1; i >= 0; i--) {
      const cur = (rem << 32) | <u64>unchecked(ad[i]);
      const qi = cur / v;
      unchecked(qd[i] = <u32>qi);
      rem = cur - qi * v;
    }
    q.n = norm(qd, an);
    q.neg = neg && q.n != 0;
    return;
  }
  const s = <u64>clz(b.d[n - 1]);
  reserve(vn, n);
  reserve(un, an + 1);
  reserve(q, m + 1);
  const ad = a.d, bd = b.d, vd = vn.d, ud = un.d, qd = q.d;
  for (let i = n - 1; i > 0; i--)
    unchecked(vd[i] = <u32>((((<u64>unchecked(bd[i]) << 32) | <u64>unchecked(bd[i - 1])) << s) >> 32));
  unchecked(vd[0] = <u32>(<u64>unchecked(bd[0]) << s));
  unchecked(ud[an] = <u32>((<u64>unchecked(ad[an - 1]) << s) >> 32));
  for (let i = an - 1; i > 0; i--)
    unchecked(ud[i] = <u32>((((<u64>unchecked(ad[i]) << 32) | <u64>unchecked(ad[i - 1])) << s) >> 32));
  unchecked(ud[0] = <u32>(<u64>unchecked(ad[0]) << s));

  const base: u64 = 0x100000000;
  const vtop = <u64>unchecked(vd[n - 1]), vnext = <u64>unchecked(vd[n - 2]);
  for (let j = m; j >= 0; j--) {
    const num = (<u64>unchecked(ud[j + n]) << 32) | <u64>unchecked(ud[j + n - 1]);
    let qhat = num / vtop;
    let rhat = num - qhat * vtop;
    while (qhat >= base || qhat * vnext > ((rhat << 32) | <u64>unchecked(ud[j + n - 2]))) {
      qhat--;
      rhat += vtop;
      if (rhat >= base) break;
    }
    let borrow: i64 = 0;
    let carry: u64 = 0;
    for (let k = 0; k < n; k++) {
      const p = qhat * <u64>unchecked(vd[k]) + carry;
      carry = p >> 32;
      const t = <i64>unchecked(ud[k + j]) - borrow - <i64>(p & 0xffffffff);
      unchecked(ud[k + j] = <u32>t);
      borrow = -(t >> 32);
    }
    const t = <i64>unchecked(ud[j + n]) - borrow - <i64>carry;
    unchecked(ud[j + n] = <u32>t);
    if (t < 0) {
      qhat--;
      let c: u64 = 0;
      for (let k = 0; k < n; k++) {
        const sum = <u64>unchecked(ud[k + j]) + <u64>unchecked(vd[k]) + c;
        unchecked(ud[k + j] = <u32>sum);
        c = sum >> 32;
      }
      unchecked(ud[j + n] = <u32>(<u64>unchecked(ud[j + n]) + c));
    }
    unchecked(qd[j] = <u32>qhat);
  }
  q.n = norm(qd, m + 1);
  q.neg = neg && q.n != 0;
}

function fnv(h: u32, byte: u32): u32 { return (h ^ byte) * 16777619; }

// "\t:<i>\n"
function fnvCount(h: u32, i: i32): u32 {
  h = fnv(fnv(h, 9), 58);
  let p = 1;
  while (p * 10 <= i) p *= 10;
  for (; p > 0; p /= 10) h = fnv(h, 48 + <u32>(i / p % 10));
  return fnv(h, 10);
}

export function bench(n: i32): u32 {
  const n1 = new Big(4), n2 = new Big(3), d = new Big(1);
  const u = new Big(0), v = new Big(0), w = new Big(0);
  const un = new Big(0), vn = new Big(0);
  let k = 1, k2 = 0, i = 0;
  let h: u32 = 2166136261;

  for (;;) {
    tdivQ(u, n1, d, un, vn);
    tdivQ(v, n2, d, un, vn);

    if (cmp(u, v) == 0) {
      h = fnv(h, 48 + <u32>getSi(u));
      i++;
      if (i % 10 == 0) h = fnvCount(h, i);
      if (i == n) break;

      // extract
      mulSi(u, u, -10);
      mul(u, d, u);
      mulSi(n1, n1, 10);
      add(n1, n1, u);
      mulSi(n2, n2, 10);
      add(n2, n2, u);
    } else {
      // produce
      k2 = k * 2;
      mulSi(u, n1, k2 - 1);
      add(v, n2, n2);
      mulSi(w, n1, k - 1);
      add(n1, u, v);
      mulSi(u, n2, k + 2);
      add(n2, w, u);
      mulSi(d, d, k2 + 1);
      k++;
    }
  }

  if (i % 10 != 0) {
    for (let j = 0; j < 10 - n % 10; j++) h = fnv(h, 32);
    h = fnvCount(h, n);
  }
  return h;
}
