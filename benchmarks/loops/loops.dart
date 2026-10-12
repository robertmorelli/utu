// Dart mirror of loops.utu / loops.rs, compiled with `dart compile wasm`
// (WasmGC, like utu). Idiomatic List<int> and Iterable code. Dart ints are
// 64-bit, so results that can overflow are wrapped to 32 bits once at the end,
// which matches i32 arithmetic. Dart's List.sort is not stable.
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS()
external set loopKernels(JSObject kernels);

List<int> ints = [];
List<double> floats = [];
List<int> sorted = [];

int i32(int v) => v.toSigned(32);

void setup(int n) {
  var seed = 12345;
  ints = List<int>.filled(n, 0);
  for (var i = 0; i < n; i++) {
    seed = i32(seed * 1103515245 + 12345);
    ints[i] = ((seed >> 8) & 1023) % 1000 - 500;
  }
  if (n > 0) ints[n - 1] = 1000;
  floats = List<double>.generate(n, (i) => i * 0.5);
  sorted = List<int>.generate(n, (i) => i * 3);
}

int whileSum() {
  final xs = ints;
  var s = 0, i = 0;
  while (i < xs.length) { s += xs[i]; i++; }
  return i32(s);
}

int forRangeSum() {
  final xs = ints;
  var s = 0;
  for (var i = 0; i < xs.length; i++) s += xs[i];
  return i32(s);
}

int forEachSum() {
  var s = 0;
  for (final x in ints) s += x;
  return i32(s);
}

int eachSum() {
  var s = 0;
  ints.forEach((x) => s += x);
  return i32(s);
}

int sum() => i32(ints.fold(0, (a, x) => a + x));

int mapFilterFold() => i32(ints.map((x) => x * 3).where((x) => x % 2 == 0).fold(0, (a, x) => a + x));

int countWhere() => ints.where((x) => x > 0).length;

int anyMiss() => ints.any((x) => x > 100000) ? 1 : 0;

int collectMap() {
  final ys = ints.map((x) => x + 1).toList();
  return ys.length + ys.last;
}

int scanLast() {
  var a = 0;
  final ys = [for (final x in ints) a = i32(a + x)];
  return ys.last;
}

int zipDot() {
  final xs = ints;
  var s = 0;
  for (var i = 0; i < xs.length; i++) s += xs[i] * xs[i];
  return i32(s);
}

int flatMapSum() => i32(ints.expand((x) => [x, x + 1]).fold(0, (a, x) => a + x));

int skipTake() => i32(ints.skip(10).take(ints.length ~/ 2).fold(0, (a, x) => a + x));

int takeWhileCount() => ints.takeWhile((x) => x > -1000).length;

int chainSum() => i32(ints.followedBy(ints).fold(0, (a, x) => a + x));

int sortInts() {
  final s = List<int>.of(ints)..sort();
  return s.first + s[s.length ~/ 2] + s.last;
}

int groupBy16() {
  final keys = <int>[];
  final groups = <List<int>>[];
  for (final x in ints) {
    final key = x & 15;
    var j = keys.indexOf(key);
    if (j < 0) { keys.add(key); groups.add(<int>[]); j = keys.length - 1; }
    groups[j].add(x);
  }
  return groups.length * 1000 + groups[0].length;
}

int distinct64() {
  final keys = <int>[];
  final out = <int>[];
  for (final x in ints) {
    final key = x & 63;
    if (!keys.contains(key)) { keys.add(key); out.add(x); }
  }
  return out.length;
}

int groupBy4096() {
  final groups = <int, List<int>>{};
  for (var i = 0; i < ints.length; i++) {
    final x = ints[i];
    groups.putIfAbsent((x * 31 + i) & 4095, () => <int>[]).add(x);
  }
  return groups.length;
}

int distinct4096() {
  final seen = <int>{};
  final firsts = <int>[];
  for (var i = 0; i < ints.length; i++) {
    if (seen.add((ints[i] * 31 + i) & 4095)) firsts.add(ints[i]);
  }
  return firsts.length;
}

int collectThenFilter() => i32(ints.map((x) => x + 1).toList().where((x) => x > 0).fold(0, (a, x) => a + x));

int partitionPositive() {
  final yes = <int>[], no = <int>[];
  for (final x in ints) { if (x > 0) yes.add(x); else no.add(x); }
  return yes.length;
}

int batched64() {
  final batches = [for (var i = 0; i < ints.length; i += 64) ints.sublist(i, i + 64 > ints.length ? ints.length : i + 64)];
  return batches.length + batches[0][0];
}

int windows4() {
  final windows = [for (var i = 0; i + 4 <= ints.length; i++) ints.sublist(i, i + 4)];
  return windows.length + windows[1][3];
}

int minValue() => ints.reduce((a, x) => x < a ? x : a);

int firstLate() => ints.firstWhere((x) => x == 1000);

int reduceSum() => i32(ints.reduce((a, x) => a + x));

int bisectMany() {
  final s = sorted;
  final n = s.length;
  var hits = 0;
  for (var q = 0; q < n; q++) {
    final target = (q * 7) % (n * 3);
    var lo = 0, hi = n;
    while (lo < hi) { final mid = (lo + hi) >> 1; if (s[mid] < target) lo = mid + 1; else hi = mid; }
    hits += lo;
  }
  return i32(hits);
}

double dotF64() {
  var s = 0.0;
  for (final x in floats) s += x * x;
  return s;
}

void main() {
  final kernels = <String, int Function()>{
    'while_sum': whileSum, 'for_range_sum': forRangeSum, 'for_each_sum': forEachSum,
    'each_sum': eachSum, 'sum': sum, 'map_filter_fold': mapFilterFold, 'count_where': countWhere,
    'any_miss': anyMiss, 'collect_map': collectMap, 'scan_last': scanLast, 'zip_dot': zipDot,
    'flat_map_sum': flatMapSum, 'skip_take': skipTake, 'take_while_count': takeWhileCount,
    'chain_sum': chainSum, 'sort_ints': sortInts, 'group_by_16': groupBy16, 'distinct_64': distinct64,
    'group_by_4096': groupBy4096, 'distinct_4096': distinct4096, 'collect_then_filter': collectThenFilter,
    'partition_positive': partitionPositive, 'batched_64': batched64, 'windows_4': windows4,
    'min_value': minValue, 'first_late': firstLate, 'reduce_sum': reduceSum, 'bisect_many': bisectMany,
  };
  final exported = JSObject();
  exported.setProperty('setup'.toJS, ((JSNumber n) => setup(n.toDartInt)).toJS);
  kernels.forEach((name, run) => exported.setProperty(name.toJS, (() => run().toJS).toJS));
  exported.setProperty('dot_f64'.toJS, (() => dotF64().toJS).toJS);
  loopKernels = exported;
}
