// Would a sentinel (null / 0) at the end of every WasmGC array make iteration
// faster? Hand-written kernels isolate the loop shape from utu's codegen.
//
//   counted   : i < len, then array.get        (what utu emits today)
//   sentinel  : array.get, then exit on null/0 (one extra slot per array)
//
// Both still pay the engine's array.get bounds check: WasmGC has no
// unchecked array access, so a sentinel can only replace the loop's own
// `i < len` compare, never the hidden one.
import binaryen from 'binaryen';
import { gzipSync } from 'node:zlib';

const FEATURES = binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.BulkMemory | binaryen.Features.SignExt | binaryen.Features.NontrappingFPToInt | binaryen.Features.MutableGlobals | binaryen.Features.Multivalue;
const N = 1 << 20;            // elements per array
const ROUNDS = Number(process.env.ROUNDS ?? 40);

const wat = `(module
  (type $box (struct (field i32)))
  (type $ints (array (mut i32)))
  (type $boxes (array (mut (ref null $box))))

  (func $make_ints (export "make_ints") (param $n i32) (param $extra i32) (result (ref $ints))
    (local $a (ref $ints)) (local $i i32)
    (local.set $a (array.new_default $ints (i32.add (local.get $n) (local.get $extra))))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (array.set $ints (local.get $a) (local.get $i) (i32.add (i32.and (local.get $i) (i32.const 255)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $a))

  (func $make_boxes (export "make_boxes") (param $n i32) (param $extra i32) (result (ref $boxes))
    (local $a (ref $boxes)) (local $i i32)
    (local.set $a (array.new_default $boxes (i32.add (local.get $n) (local.get $extra))))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (array.set $boxes (local.get $a) (local.get $i) (struct.new $box (i32.and (local.get $i) (i32.const 255))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $a))

  ;; counted: today's shape
  (func (export "counted_ints") (param $a (ref $ints)) (result i32)
    (local $i i32) (local $n i32) (local $s i32)
    (local.set $n (array.len (local.get $a)))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $s (i32.add (local.get $s) (array.get $ints (local.get $a) (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))

  ;; sentinel: stop at the first 0
  (func (export "sentinel_ints") (param $a (ref $ints)) (result i32)
    (local $i i32) (local $v i32) (local $s i32)
    (block $done (loop $l
      (local.set $v (array.get $ints (local.get $a) (local.get $i)))
      (br_if $done (i32.eqz (local.get $v)))
      (local.set $s (i32.add (local.get $s) (local.get $v)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))

  (func (export "counted_boxes") (param $a (ref $boxes)) (result i32)
    (local $i i32) (local $n i32) (local $s i32)
    (local.set $n (array.len (local.get $a)))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $s (i32.add (local.get $s)
        (struct.get $box 0 (ref.as_non_null (array.get $boxes (local.get $a) (local.get $i))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))

  ;; sentinel: br_on_null exits; the non-null value flows on without a cast
  (func (export "sentinel_boxes") (param $a (ref $boxes)) (result i32)
    (local $i i32) (local $s i32)
    (block $done (loop $l
      (local.set $s (i32.add (local.get $s)
        (struct.get $box 0 (br_on_null $done (array.get $boxes (local.get $a) (local.get $i))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (local.get $s))
)`;

const mod = binaryen.parseText(wat);
mod.setFeatures(FEATURES);
if (!mod.validate()) throw new Error('invalid kernel module');
binaryen.setOptimizeLevel(3);
mod.optimize();
const bytes = mod.emitBinary();

// Size of each loop body alone: compile a module with just that function.
function functionSize(name) {
  const single = binaryen.parseText(wat.replace(/\(func \(export "(\w+)"\)[\s\S]*?(?=\n  \(func |\n\)$)/g,
    (text, exported) => (exported === name || /make_/.test(exported) ? text : '')));
  single.setFeatures(FEATURES);
  binaryen.setOptimizeLevel(3);
  single.optimize();
  const size = single.emitBinary().length;
  single.dispose();
  return size;
}

const { instance } = await WebAssembly.instantiate(bytes);
const e = instance.exports;
const ints = e.make_ints(N, 0), intsSentinel = e.make_ints(N, 1);
const boxes = e.make_boxes(N, 0), boxesSentinel = e.make_boxes(N, 1);

function time(run) {
  for (let i = 0; i < 5; i++) run();
  const samples = [];
  for (let r = 0; r < ROUNDS; r++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1] * 1e6 / N; // median ns per element
}

const rows = [
  ['i32 counted', () => e.counted_ints(ints), 'counted_ints'],
  ['i32 sentinel', () => e.sentinel_ints(intsSentinel), 'sentinel_ints'],
  ['ref counted', () => e.counted_boxes(boxes), 'counted_boxes'],
  ['ref sentinel', () => e.sentinel_boxes(boxesSentinel), 'sentinel_boxes'],
];
if (e.counted_ints(ints) !== e.sentinel_ints(intsSentinel) || e.counted_boxes(boxes) !== e.sentinel_boxes(boxesSentinel)) {
  throw new Error('kernels disagree');
}
const engine = typeof Bun !== 'undefined' ? `JSC (Bun ${Bun.version})` : `V8 (Node ${process.versions.node})`;
console.log(`${engine}: ${N.toLocaleString()} elements, median of ${ROUNDS}`);
for (const [label, run, name] of rows) {
  console.log(`  ${label.padEnd(13)} ${time(run).toFixed(3)} ns/element   module with this loop: ${functionSize(name)} B`);
}
console.log(`  whole module: ${bytes.length} B raw, ${gzipSync(bytes).length} B gzip`);
