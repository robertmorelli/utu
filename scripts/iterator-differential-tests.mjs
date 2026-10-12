// Iterator pipelines against a JavaScript reference, across lengths and
// parameters chosen to hit every lowering path: leading skip/take folded into
// loop bounds, first-stage zip bounds, bounded and growing buffers, stop-flag
// and counted loops, direct and materialized batching, and merge sort runs.
import { compileAndInstantiate } from './test-harness.mjs';

const SOURCE = `
struct Row:
    | key: I32
    | seq: I32

export lib {
    fn make(n: I32, seed: I32) Array[I32] {
        let xs = Array[I32].new(n, 0);
        let s = seed;
        for (0..<n) |i| {
            s = s * 1103515245 + 12345;
            xs[i] = ((s >> 8) & 1023) % 200 - 100;
        };
        xs;
    }
    fn at(xs: Array[I32], i: I32) I32 { xs[i]; }
    fn length(xs: Array[I32]) I32 { xs.len(); }
    fn nested_length(xs: Array[Array[I32]]) I32 { xs.len(); }
    fn nested_at(xs: Array[Array[I32]], i: I32) Array[I32] { xs[i]; }

    fn skip_take_sum(xs: Array[I32], a: I32, b: I32) I32 { xs skip(a) take(b) sum; }
    fn take_skip_sum(xs: Array[I32], a: I32, b: I32) I32 { xs take(a) skip(b) sum; }
    fn filter_take_count(xs: Array[I32], b: I32) I32 { xs filter |x| { x > 0; } take(b) count; }
    fn zip_first(xs: Array[I32], ys: Array[I32]) I32 { xs zip(ys) |a, b, i| { a * b + i.to_i32(); } sum; }
    fn zip_later(xs: Array[I32], ys: Array[I32]) I32 { xs filter |x| { x % 2 == 0; } zip(ys) |a, b, i| { a - b + i.to_i32(); } sum; }
    fn skip_zip(xs: Array[I32], ys: Array[I32], a: I32) I32 { xs skip(a) zip(ys) |p, q| { p * 3 + q; } sum; }
    fn collect_map(xs: Array[I32]) Array[I32] { xs map |x| { x * 2 + 1; } collect(I32); }
    fn collect_filter(xs: Array[I32]) Array[I32] { xs filter |x| { x % 3 == 0; } collect(I32); }
    fn collect_flat(xs: Array[I32]) Array[I32] { xs flat_map |x| { [x, -x]; } collect(I32); }
    fn collect_repeat(xs: Array[I32], k: I32) Array[I32] { xs repeat(k) collect(I32); }
    fn collect_chain(xs: Array[I32], ys: Array[I32]) Array[I32] { xs chain(ys) collect(I32); }
    fn chain_take(xs: Array[I32], ys: Array[I32], b: I32) Array[I32] { xs chain(ys) take(b) collect(I32); }
    fn take_chain(xs: Array[I32], ys: Array[I32], b: I32) Array[I32] { xs take(b) chain(ys) collect(I32); }
    fn scan_collect(xs: Array[I32]) Array[I32] { xs scan(0) |a, x| { a + x; } collect(I32); }
    fn take_while_collect(xs: Array[I32]) Array[I32] { xs take_while |x| { x > -90; } collect(I32); }
    fn skip_while_collect(xs: Array[I32]) Array[I32] { xs skip_while |x| { x < 50; } collect(I32); }
    fn sort_ints(xs: Array[I32]) Array[I32] { xs sort(I32) |a, b| { a < b; }; }
    fn sort_desc(xs: Array[I32]) Array[I32] { xs sort(I32) |a, b| { a > b; }; }
    fn sort_stable(xs: Array[I32]) Array[I32] {
        let rows = xs map |x, i| { Row { key: x % 7, seq: i.to_i32() }; } sort(Row) |a, b| { a.key < b.key; };
        rows map |r| { r.key * 100000 + r.seq; } collect(I32);
    }
    fn sort_filtered(xs: Array[I32]) Array[I32] { xs filter |x| { x > 0; } sort(I32) |a, b| { a < b; }; }
    fn partition_sizes(xs: Array[I32]) I32 { let p = xs partition(I32) |x| { x > 10; }; p[0].len() * 10000 + p[1].len(); }
    fn distinct_keys(xs: Array[I32]) Array[I32] { xs distinct_by(I32, I32) |x| { x % 9; }; }
    fn group_sizes(xs: Array[I32]) Array[I32] { (xs group_by(I32, I32) |x| { x & 7; }) map |g| { g.key * 1000 + g.values.len(); } collect(I32); }
    fn batched_direct(xs: Array[I32], w: I32) Array[Array[I32]] { xs batched(I32, w); }
    fn windows_direct(xs: Array[I32], w: I32) Array[Array[I32]] { xs windows(I32, w); }
    fn batched_prefix(xs: Array[I32], a: I32, b: I32, w: I32) Array[Array[I32]] { xs skip(a) take(b) batched(I32, w); }
    fn windows_filtered(xs: Array[I32], w: I32) Array[Array[I32]] { xs filter |x| { x != 0; } windows(I32, w); }
    fn any_big(xs: Array[I32]) Bool { xs any |x| { x > 95; }; }
    fn all_small(xs: Array[I32]) Bool { xs all |x| { x < 99; }; }
    fn first_neg(xs: Array[I32]) I32 { xs first_index |x| { x < -95; }; }
    fn last_neg(xs: Array[I32]) I32 { xs last_index |x| { x < -95; }; }
    fn min_or(xs: Array[I32]) I32 { promote xs min_by(I32) |a, b| { a < b; } { |f| => f.value, ~> 999, }; }
    fn max_or(xs: Array[I32]) I32 { promote xs max_by(I32) |a, b| { a < b; } { |f| => f.value, ~> -999, }; }
    fn reduce_or(xs: Array[I32]) I32 { promote xs reduce(I32) |a, x| { a * 3 + x; } { |f| => f.value, ~> 7777, }; }
    fn first_where_or(xs: Array[I32], a: I32) I32 { promote xs skip(a) first_where(I32) |x| { x > 90; } { |f| => f.value, ~> 5555, }; }
    fn fold_index(xs: Array[I32]) I32 { xs skip(3) fold(0) |acc, x, i| { acc + x * i.to_i32(); }; }
    fn product_small(xs: Array[I32]) I32 { xs map |x| { x % 3 + 2; } take(12) product; }
    fn bisect_sorted(xs: Array[I32], target: I32) I32 { let s = xs sort(I32) |a, b| { a < b; }; s bisect |v| { v < target; }; }
}`;

// ── JavaScript reference ─────────────────────────────────────────────────────
const i32 = v => v | 0;
const mul = (a, b) => Math.imul(a, b);
const sum = xs => xs.reduce((a, x) => i32(a + x), 0);
const make = (n, seed) => {
  const xs = []; let s = seed;
  for (let i = 0; i < n; i++) { s = i32(mul(s, 1103515245) + 12345); xs.push(((s >> 8) & 1023) % 200 - 100); }
  return xs;
};
const clampSkip = (xs, a) => xs.slice(Math.max(0, a));
const clampTake = (xs, b) => xs.slice(0, Math.max(0, b));
const zipWith = (xs, ys, f) => xs.slice(0, Math.min(xs.length, ys.length)).map((x, i) => f(x, ys[i], i));
const chunks = (xs, w) => { const out = []; for (let i = 0; i < xs.length; i += w) out.push(xs.slice(i, i + w)); return out; };
const windows = (xs, w) => { const out = []; for (let i = 0; i + w <= xs.length; i++) out.push(xs.slice(i, i + w)); return out; };
const firstBy = (xs, better) => xs.reduce((best, x) => (best === undefined || better(x, best) ? x : best), undefined);
const stableSort = (xs, less) => xs.map((x, i) => [x, i]).sort((p, q) => (less(p[0], q[0]) ? -1 : less(q[0], p[0]) ? 1 : p[1] - q[1])).map(p => p[0]);
const mod = (a, b) => a % b; // JS % truncates like i32.rem_s

export function registerIteratorDifferentialTests({ test, assertEq, assertNoErrors, makeCompiler }) {
  test('iterators: every operator matches a reference across lengths and parameters', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'iterator_differential.utu', source: SOURCE });
    const e = instance.exports;
    const read = arr => Array.from({ length: e.length(arr) }, (_, i) => e.at(arr, i));
    const readNested = arr => Array.from({ length: e.nested_length(arr) }, (_, i) => read(e.nested_at(arr, i)));
    const same = (got, want, label) => assertEq(JSON.stringify(got), JSON.stringify(want), label);
    for (const n of [0, 1, 2, 3, 7, 23, 24, 25, 48, 49, 64, 100, 257, 1000]) {
      const xsJs = make(n, 17 + n), ysJs = make(Math.max(0, n - 3), 99 + n);
      const xs = e.make(n, 17 + n), ys = e.make(Math.max(0, n - 3), 99 + n);
      same(read(xs), xsJs, 'generator agrees');
      const where = name => `${name} n=${n}`;
      for (const [a, b] of [[0, 0], [0, 5], [3, 4], [-2, 3], [5, -1], [n, 2], [n + 5, 1], [1, n + 9]]) {
        assertEq(e.skip_take_sum(xs, a, b), sum(clampTake(clampSkip(xsJs, a), b)), where(`skip(${a}) take(${b})`));
        assertEq(e.take_skip_sum(xs, a, b), sum(clampSkip(clampTake(xsJs, a), b)), where(`take(${a}) skip(${b})`));
        assertEq(e.filter_take_count(xs, b), clampTake(xsJs.filter(x => x > 0), b).length, where(`filter take(${b})`));
        same(read(e.chain_take(xs, ys, b)), clampTake(xsJs.concat(ysJs), b), where(`chain take(${b})`));
        same(read(e.take_chain(xs, ys, b)), clampTake(xsJs, b).concat(ysJs), where(`take(${b}) chain`));
        assertEq(e.skip_zip(xs, ys, a), sum(zipWith(clampSkip(xsJs, a), ysJs, (p, q) => i32(mul(p, 3) + q))), where(`skip(${a}) zip`));
        assertEq(e.first_where_or(xs, a), clampSkip(xsJs, a).find(x => x > 90) ?? 5555, where(`skip(${a}) first_where`));
        for (const w of [1, 2, 3, 24, 64]) {
          same(readNested(e.batched_prefix(xs, a, b + 10, w)), chunks(clampTake(clampSkip(xsJs, a), b + 10), w), where(`skip take batched(${w})`));
        }
      }
      assertEq(e.zip_first(xs, ys), sum(zipWith(xsJs, ysJs, (p, q, i) => i32(mul(p, q) + i))), where('zip first'));
      assertEq(e.zip_later(xs, ys), sum(zipWith(xsJs.filter(x => x % 2 === 0), ysJs, (p, q, i) => i32(p - q + i))), where('zip later'));
      same(read(e.collect_map(xs)), xsJs.map(x => x * 2 + 1), where('collect map'));
      same(read(e.collect_filter(xs)), xsJs.filter(x => x % 3 === 0), where('collect filter'));
      same(read(e.collect_flat(xs)), xsJs.flatMap(x => [x, -x]), where('collect flat_map'));
      for (const k of [-1, 0, 1, 3]) same(read(e.collect_repeat(xs, k)), xsJs.flatMap(x => Array(Math.max(0, k)).fill(x)), where(`repeat(${k})`));
      same(read(e.collect_chain(xs, ys)), xsJs.concat(ysJs), where('chain'));
      let acc = 0;
      same(read(e.scan_collect(xs)), xsJs.map(x => (acc = i32(acc + x))), where('scan'));
      const stopAt = xsJs.findIndex(x => !(x > -90));
      same(read(e.take_while_collect(xs)), stopAt < 0 ? xsJs : xsJs.slice(0, stopAt), where('take_while'));
      const startAt = xsJs.findIndex(x => !(x < 50));
      same(read(e.skip_while_collect(xs)), startAt < 0 ? [] : xsJs.slice(startAt), where('skip_while'));
      same(read(e.sort_ints(xs)), [...xsJs].sort((p, q) => p - q), where('sort'));
      same(read(e.sort_desc(xs)), [...xsJs].sort((p, q) => q - p), where('sort desc'));
      same(read(e.sort_stable(xs)), stableSort(xsJs.map((x, i) => ({ key: mod(x, 7), seq: i })), (p, q) => p.key < q.key).map(r => r.key * 100000 + r.seq), where('sort is stable'));
      same(read(e.sort_filtered(xs)), xsJs.filter(x => x > 0).sort((p, q) => p - q), where('filter sort'));
      assertEq(e.partition_sizes(xs), xsJs.filter(x => x > 10).length * 10000 + xsJs.filter(x => !(x > 10)).length, where('partition'));
      const seen = new Set();
      same(read(e.distinct_keys(xs)), xsJs.filter(x => (seen.has(mod(x, 9)) ? false : seen.add(mod(x, 9)))), where('distinct_by'));
      const groups = new Map();
      for (const x of xsJs) groups.set(x & 7, (groups.get(x & 7) ?? 0) + 1);
      same(read(e.group_sizes(xs)), [...groups].map(([k, c]) => k * 1000 + c), where('group_by'));
      for (const w of [1, 2, 5, 24, 64, 1001]) {
        same(readNested(e.batched_direct(xs, w)), chunks(xsJs, w), where(`batched(${w})`));
        same(readNested(e.windows_direct(xs, w)), windows(xsJs, w), where(`windows(${w})`));
        same(readNested(e.windows_filtered(xs, w)), windows(xsJs.filter(x => x !== 0), w), where(`filter windows(${w})`));
      }
      assertEq(e.any_big(xs), xsJs.some(x => x > 95) ? 1 : 0, where('any'));
      assertEq(e.all_small(xs), xsJs.every(x => x < 99) ? 1 : 0, where('all'));
      assertEq(e.first_neg(xs), xsJs.findIndex(x => x < -95), where('first_index'));
      assertEq(e.last_neg(xs), xsJs.findLastIndex(x => x < -95), where('last_index'));
      assertEq(e.min_or(xs), firstBy(xsJs, (x, best) => x < best) ?? 999, where('min_by'));
      assertEq(e.max_or(xs), firstBy(xsJs, (x, best) => best < x) ?? -999, where('max_by'));
      assertEq(e.reduce_or(xs), xsJs.length ? xsJs.slice(1).reduce((p, x) => i32(mul(p, 3) + x), xsJs[0]) : 7777, where('reduce'));
      assertEq(e.fold_index(xs), clampSkip(xsJs, 3).reduce((p, x, i) => i32(p + mul(x, i)), 0), where('fold with index'));
      assertEq(e.product_small(xs), clampTake(xsJs.map(x => mod(x, 3) + 2), 12).reduce((p, x) => mul(p, x), 1), where('product'));
      const sorted = [...xsJs].sort((p, q) => p - q);
      for (const target of [-101, -50, 0, 37, 101]) {
        const expected = sorted.findIndex(v => !(v < target));
        assertEq(e.bisect_sorted(xs, target), expected < 0 ? sorted.length : expected, where(`bisect ${target}`));
      }
    }
  });
}
