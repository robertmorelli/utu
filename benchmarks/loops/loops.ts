// AssemblyScript mirror of loops.utu / loops.rs. Linear memory, i32 wraps.
// AssemblyScript has no capturing closures, so kernels whose callbacks would
// capture are written as loops; the rest use the Array methods.

let INTS: Array<i32> = [];
let FLOATS: Array<f64> = [];
let SORTED: Array<i32> = [];

export function setup(n: i32): void {
  let seed: i32 = 12345;
  INTS = new Array<i32>(n);
  for (let i = 0; i < n; i++) {
    seed = seed * 1103515245 + 12345;
    INTS[i] = ((seed >> 8) & 1023) % 1000 - 500;
  }
  if (n > 0) INTS[n - 1] = 1000;
  FLOATS = new Array<f64>(n);
  for (let i = 0; i < n; i++) FLOATS[i] = <f64>i * 0.5;
  SORTED = new Array<i32>(n);
  for (let i = 0; i < n; i++) SORTED[i] = i * 3;
}

export function while_sum(): i32 {
  const xs = INTS;
  let s: i32 = 0, i = 0;
  const n = xs.length;
  while (i < n) { s += xs[i]; i++; }
  return s;
}

export function for_range_sum(): i32 {
  const xs = INTS;
  let s: i32 = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s;
}

export function for_each_sum(): i32 {
  let s: i32 = 0;
  const xs = INTS;
  for (let i = 0, n = xs.length; i < n; i++) s += xs[i];
  return s;
}

export function each_sum(): i32 { return INTS.reduce<i32>((a: i32, x: i32) => a + x, 0); }
export function sum(): i32 { return INTS.reduce<i32>((a: i32, x: i32) => a + x, 0); }

export function map_filter_fold(): i32 {
  return INTS.map<i32>((x: i32) => x * 3).filter((x: i32) => x % 2 == 0).reduce<i32>((a: i32, x: i32) => a + x, 0);
}

export function count_where(): i32 { return INTS.filter((x: i32) => x > 0).length; }
export function any_miss(): i32 { return INTS.some((x: i32) => x > 100000) ? 1 : 0; }

export function collect_map(): i32 {
  const ys = INTS.map<i32>((x: i32) => x + 1);
  return ys.length + ys[ys.length - 1];
}

export function scan_last(): i32 {
  const xs = INTS;
  const ys = new Array<i32>(xs.length);
  let a: i32 = 0;
  for (let i = 0; i < xs.length; i++) { a += xs[i]; ys[i] = a; }
  return ys[ys.length - 1];
}

export function zip_dot(): i32 {
  const xs = INTS;
  let s: i32 = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i] * xs[i];
  return s;
}

export function flat_map_sum(): i32 {
  const xs = INTS;
  const out = new Array<i32>(0);
  for (let i = 0; i < xs.length; i++) { const x = xs[i]; out.push(x); out.push(x + 1); }
  return out.reduce<i32>((a: i32, x: i32) => a + x, 0);
}

export function skip_take(): i32 {
  return INTS.slice(10, 10 + INTS.length / 2).reduce<i32>((a: i32, x: i32) => a + x, 0);
}

export function take_while_count(): i32 {
  const xs = INTS;
  let i = 0;
  while (i < xs.length && xs[i] > -1000) i++;
  return i;
}

export function chain_sum(): i32 { return INTS.concat(INTS).reduce<i32>((a: i32, x: i32) => a + x, 0); }

export function sort_ints(): i32 {
  const s = INTS.slice();
  s.sort((a: i32, b: i32) => a - b);
  return s[0] + s[s.length / 2] + s[s.length - 1];
}

export function group_by_16(): i32 {
  const keys = new Array<i32>(0);
  const groups = new Array<Array<i32>>(0);
  const xs = INTS;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], key = x & 15;
    let j = 0;
    while (j < keys.length && keys[j] != key) j++;
    if (j == keys.length) { keys.push(key); groups.push(new Array<i32>(0)); }
    groups[j].push(x);
  }
  return groups.length * 1000 + groups[0].length;
}

export function distinct_64(): i32 {
  const keys = new Array<i32>(0);
  const out = new Array<i32>(0);
  const xs = INTS;
  for (let i = 0; i < xs.length; i++) {
    const key = xs[i] & 63;
    if (!keys.includes(key)) { keys.push(key); out.push(xs[i]); }
  }
  return out.length;
}

export function group_by_4096(): i32 {
  const groups = new Map<i32, Array<i32>>();
  const xs = INTS;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], key = (x * 31 + i) & 4095;
    if (!groups.has(key)) groups.set(key, new Array<i32>(0));
    groups.get(key).push(x);
  }
  return groups.size;
}

export function distinct_4096(): i32 {
  const seen = new Set<i32>();
  const firsts = new Array<i32>(0);
  const xs = INTS;
  for (let i = 0; i < xs.length; i++) {
    const key = (xs[i] * 31 + i) & 4095;
    if (!seen.has(key)) { seen.add(key); firsts.push(xs[i]); }
  }
  return firsts.length;
}

export function collect_then_filter(): i32 {
  return INTS.map<i32>((x: i32) => x + 1).filter((x: i32) => x > 0).reduce<i32>((a: i32, x: i32) => a + x, 0);
}

export function partition_positive(): i32 {
  const yes = new Array<i32>(0), no = new Array<i32>(0);
  const xs = INTS;
  for (let i = 0; i < xs.length; i++) { const x = xs[i]; if (x > 0) yes.push(x); else no.push(x); }
  return yes.length;
}

export function batched_64(): i32 {
  const xs = INTS;
  const batches = new Array<Array<i32>>(0);
  for (let i = 0; i < xs.length; i += 64) batches.push(xs.slice(i, i + 64));
  return batches.length + batches[0][0];
}

export function windows_4(): i32 {
  const xs = INTS;
  const windows = new Array<Array<i32>>(0);
  for (let i = 0; i + 4 <= xs.length; i++) windows.push(xs.slice(i, i + 4));
  return windows.length + windows[1][3];
}

export function min_value(): i32 { return INTS.reduce<i32>((a: i32, x: i32) => (x < a ? x : a), i32.MAX_VALUE); }

export function first_late(): i32 { return INTS[INTS.findIndex((x: i32) => x == 1000)]; }

export function reduce_sum(): i32 {
  const xs = INTS;
  let a = xs[0];
  for (let i = 1; i < xs.length; i++) a += xs[i];
  return a;
}

export function bisect_many(): i32 {
  const s = SORTED;
  const n = s.length;
  let hits: i32 = 0;
  for (let q = 0; q < n; q++) {
    const target = (q * 7) % (n * 3);
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (s[mid] < target) lo = mid + 1; else hi = mid; }
    hits += lo;
  }
  return hits;
}

export function dot_f64(): f64 {
  const xs = FLOATS;
  let s: f64 = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i] * xs[i];
  return s;
}
