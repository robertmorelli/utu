// Which wasm shape gives computed-goto behaviour? The same register-machine
// interpreter in three dispatch shapes, hand-written so only the shape varies:
//
//   central     one br_table at the loop head; every transition shares it
//   structured  a br_table per site; backward edges re-enter the loop head
//               (the best structured control flow allows: irreducible
//               all-to-all edges cannot be expressed with blocks and loops)
//   tail-call   every op is a function; each site has its own
//               return_call_indirect, so every transition is predicted from
//               its own branch — true threaded code
//
// Program: acc += i; i++; if i < n goto 0 — opcodes 1, 2, 3, then 0 = halt.
import { gzipSync } from 'node:zlib';

// This measurement compiles hand-written wasm text with Binaryen's optimizer,
// which the compiler does not depend on.
const { default: binaryen } = await import('binaryen').catch(() => {
  throw new Error('dispatch-shapes.mjs needs Binaryen: npm install --no-save binaryen');
});

const N = Number(process.env.N ?? 10_000_000);
const ROUNDS = Number(process.env.ROUNDS ?? 15);
const FEATURES = binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.TailCall
  | binaryen.Features.BulkMemory | binaryen.Features.SignExt | binaryen.Features.MutableGlobals | binaryen.Features.Multivalue;

const prelude = `
  (type $code (array (mut i32)))
  (func (export "make") (result (ref $code))
    (array.new_fixed $code 5 (i32.const 1) (i32.const 2) (i32.const 3) (i32.const 0) (i32.const 0)))`;

const central = `(module ${prelude}
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (local $pc i32) (local $acc i32) (local $i i32)
    (block $exit (loop $top
      (block $halt (block $op3 (block $op2 (block $op1
        (br_table $halt $op1 $op2 $op3 $halt (array.get $code (local.get $code) (local.get $pc))))
        ;; op1: acc += i
        (local.set $acc (i32.add (local.get $acc) (local.get $i)))
        (local.set $pc (i32.add (local.get $pc) (i32.const 1)))
        (br $top))
        ;; op2: i++
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $pc (i32.add (local.get $pc) (i32.const 1)))
        (br $top))
        ;; op3: if i < n goto target else skip
        (local.set $pc (select
          (array.get $code (local.get $code) (i32.add (local.get $pc) (i32.const 1)))
          (i32.add (local.get $pc) (i32.const 2))
          (i32.lt_s (local.get $i) (local.get $n))))
        (br $top))
      (br $exit)))
    (local.get $acc)))`;

// Each site: its own br_table. Forward targets jump straight to the arm;
// earlier arms go back through the loop head's table.
const site = (pcExpr, from) => {
  const targets = ['$halt_t', '$op1', '$op2', '$op3'].map((label, op) => (op > from || op === 0 ? label : '$top'));
  return `(local.set $pc ${pcExpr})
        (br_table ${targets.join(' ')} $halt_t (array.get $code (local.get $code) (local.get $pc)))`;
};
const structured = `(module ${prelude}
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (local $pc i32) (local $acc i32) (local $i i32)
    (block $exit (loop $top
      (block $halt_t (block $op3 (block $op2 (block $op1
        (br_table $halt_t $op1 $op2 $op3 $halt_t (array.get $code (local.get $code) (local.get $pc))))
        (local.set $acc (i32.add (local.get $acc) (local.get $i)))
        ${site('(i32.add (local.get $pc) (i32.const 1))', 1)})
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        ${site('(i32.add (local.get $pc) (i32.const 1))', 2)})
        ${site(`(select
          (array.get $code (local.get $code) (i32.add (local.get $pc) (i32.const 1)))
          (i32.add (local.get $pc) (i32.const 2))
          (i32.lt_s (local.get $i) (local.get $n)))`, 3)})
      (br $exit)))
    (local.get $acc)))`;

const next = (pcExpr, acc, i) => `(return_call_indirect $ops (type $op)
      (local.get $code) ${pcExpr} ${acc} ${i} (local.get $n)
      (array.get $code (local.get $code) ${pcExpr}))`;
const tail = `(module ${prelude}
  (type $op (func (param (ref $code) i32 i32 i32 i32) (result i32)))
  (table $ops 4 4 funcref)
  (elem (table $ops) (i32.const 0) func $halt $op1 $op2 $op3)
  (func $halt (type $op) (param $code (ref $code)) (param $pc i32) (param $acc i32) (param $i i32) (param $n i32) (result i32)
    (local.get $acc))
  (func $op1 (type $op) (param $code (ref $code)) (param $pc i32) (param $acc i32) (param $i i32) (param $n i32) (result i32)
    ${next('(i32.add (local.get $pc) (i32.const 1))', '(i32.add (local.get $acc) (local.get $i))', '(local.get $i)')})
  (func $op2 (type $op) (param $code (ref $code)) (param $pc i32) (param $acc i32) (param $i i32) (param $n i32) (result i32)
    ${next('(i32.add (local.get $pc) (i32.const 1))', '(local.get $acc)', '(i32.add (local.get $i) (i32.const 1))')})
  (func $op3 (type $op) (param $code (ref $code)) (param $pc i32) (param $acc i32) (param $i i32) (param $n i32) (result i32)
    (local $to i32)
    (local.set $to (select
      (array.get $code (local.get $code) (i32.add (local.get $pc) (i32.const 1)))
      (i32.add (local.get $pc) (i32.const 2))
      (i32.lt_s (local.get $i) (local.get $n))))
    ${next('(local.get $to)', '(local.get $acc)', '(local.get $i)')})
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (call_indirect $ops (type $op) (local.get $code) (i32.const 0) (i32.const 0) (i32.const 0) (local.get $n)
      (array.get $code (local.get $code) (i32.const 0)))))`;

function build(wat) {
  const mod = binaryen.parseText(wat);
  mod.setFeatures(FEATURES);
  if (!mod.validate()) throw new Error('invalid module');
  binaryen.setOptimizeLevel(3);
  binaryen.setShrinkLevel(0);
  mod.optimize();
  const bytes = mod.emitBinary();
  mod.dispose();
  return bytes;
}

function time(run) {
  for (let i = 0; i < 3; i++) run();
  const samples = [];
  for (let r = 0; r < ROUNDS; r++) { const t = performance.now(); run(); samples.push(performance.now() - t); }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1];
}

const engine = typeof Bun !== 'undefined' ? `JSC (Bun ${Bun.version})` : `V8 (Node ${process.versions.node})`;
console.log(`${engine}: ${N.toLocaleString()} iterations, ${(3 * N).toLocaleString()} dispatches`);
let expected = null;
for (const [label, wat] of [['central', central], ['structured', structured], ['tail-call', tail]]) {
  let bytes;
  try { bytes = build(wat); } catch (error) { console.log(`  ${label}: ${error.message}`); continue; }
  let instance;
  try { ({ instance } = await WebAssembly.instantiate(bytes)); } catch (error) { console.log(`  ${label.padEnd(11)} not supported here: ${error.message}`); continue; }
  const code = instance.exports.make();
  const result = instance.exports.run(code, N);
  expected ??= result;
  if (result !== expected) throw new Error(`${label}: ${result} != ${expected}`);
  console.log(`  ${label.padEnd(11)} ${time(() => instance.exports.run(code, N)).toFixed(2).padStart(8)} ms   ${bytes.length} B wasm, ${gzipSync(bytes).length} B gzip`);
}

// ── Correlated program ───────────────────────────────────────────────────────
// 8 opcodes; a 4,096-op program from a Markov chain where each op is followed
// by its favourite successor 80% of the time — like real bytecode, where some
// pairs dominate. This is where per-site prediction is supposed to pay off.
const OPS = 8;          // 0 = halt, 1..6 arithmetic, 7 = loop back
const LENGTH = 4096;
const PASSES = Number(process.env.PASSES ?? 4000);
let seed = 11;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const favourite = [0, 3, 5, 2, 6, 1, 4];
const program = [1 + Math.floor(random() * 6)];
while (program.length < LENGTH - 1) {
  const last = program.at(-1);
  program.push(random() < 0.8 ? favourite[last] : 1 + Math.floor(random() * 6));
}
program.push(7, 0);
const programInit = `(array.new_fixed $code ${program.length} ${program.map(op => `(i32.const ${op})`).join(' ')})`;
const arith = (k, acc) => [
  null,
  `(i32.add ${acc} (i32.const 7))`,
  `(i32.sub ${acc} (i32.const 3))`,
  `(i32.xor ${acc} (i32.const 0x5bd1))`,
  `(i32.mul ${acc} (i32.const 3))`,
  `(i32.rotl ${acc} (i32.const 5))`,
  `(i32.add ${acc} (i32.shr_u ${acc} (i32.const 3)))`,
][k];

const prelude2 = `
  (type $code (array (mut i32)))
  (func (export "make") (result (ref $code)) ${programInit})`;
const labels = Array.from({ length: OPS }, (_, k) => `$k${k}`);
const nest = (head, bodies) => {
  // (block $k7 (block $k6 … (block $k0 head) body0) body1 …)
  let chain = head;
  for (let k = 0; k < OPS; k++) chain = `(block ${labels[k]} ${chain})\n ${bodies[k]}`;
  return chain;
};
const dispatchAt = (from, structuredSite) => {
  const targets = labels.map((label, k) => (structuredSite && k <= from ? '$top' : label));
  const fallback = structuredSite ? '$top' : '$k0';
  return `(br_table ${targets.join(' ')} ${fallback} (array.get $code (local.get $code) (local.get $pc)))`;
};
const bodyOf = (k, site) => {
  if (k === 0) return '(br $exit)';
  if (k === 7) return `(if (i32.lt_s (local.get $i) (local.get $n))
      (then (local.set $i (i32.add (local.get $i) (i32.const 1))) (local.set $pc (i32.const 0)))
      (else (local.set $pc (i32.add (local.get $pc) (i32.const 1)))))
    ${site(k)}`;
  return `(local.set $acc ${arith(k, '(local.get $acc)')})
    (local.set $pc (i32.add (local.get $pc) (i32.const 1)))
    ${site(k)}`;
};
const loopModule = (site) => `(module ${prelude2}
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (local $pc i32) (local $acc i32) (local $i i32)
    (block $exit (loop $top
      ${nest(dispatchAt(-1, false), labels.map((_, k) => bodyOf(k, site)))}))
    (local.get $acc)))`;
const central2 = loopModule(() => '(br $top)');
const structured2 = loopModule(k => dispatchAt(k, true));
const tailOp = (k) => {
  const params = '(param $code (ref $code)) (param $pc i32) (param $acc i32) (param $i i32) (param $n i32) (result i32)';
  const go = (pc, acc, i) => `(return_call_indirect $ops (type $op) (local.get $code) ${pc} ${acc} ${i} (local.get $n)
      (array.get $code (local.get $code) ${pc}))`;
  if (k === 0) return `(func $t0 (type $op) ${params} (local.get $acc))`;
  if (k === 7) return `(func $t7 (type $op) ${params}
    (if (result i32) (i32.lt_s (local.get $i) (local.get $n))
      (then ${go('(i32.const 0)', '(local.get $acc)', '(i32.add (local.get $i) (i32.const 1))')})
      (else ${go('(i32.add (local.get $pc) (i32.const 1))', '(local.get $acc)', '(local.get $i)')})))`;
  return `(func $t${k} (type $op) ${params}
    ${go('(i32.add (local.get $pc) (i32.const 1))', arith(k, '(local.get $acc)'), '(local.get $i)')})`;
};
const tail2 = `(module ${prelude2}
  (type $op (func (param (ref $code) i32 i32 i32 i32) (result i32)))
  (table $ops ${OPS} ${OPS} funcref)
  (elem (table $ops) (i32.const 0) func ${labels.map((_, k) => `$t${k}`).join(' ')})
  ${labels.map((_, k) => tailOp(k)).join('\n  ')}
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (call_indirect $ops (type $op) (local.get $code) (i32.const 0) (i32.const 0) (i32.const 0) (local.get $n)
      (array.get $code (local.get $code) (i32.const 0)))))`;

console.log(`${engine}: correlated ${LENGTH}-op program × ${PASSES} passes (${(LENGTH * PASSES).toLocaleString()} dispatches)`);
let expected2 = null;
for (const [label, wat] of [['central', central2], ['structured', structured2], ['tail-call', tail2]]) {
  const bytes = build(wat);
  const { instance } = await WebAssembly.instantiate(bytes);
  const code = instance.exports.make();
  const result = instance.exports.run(code, PASSES);
  expected2 ??= result;
  if (result !== expected2) throw new Error(`${label}: ${result} != ${expected2}`);
  console.log(`  ${label.padEnd(11)} ${time(() => instance.exports.run(code, PASSES)).toFixed(2).padStart(8)} ms   ${bytes.length} B wasm (program data included)`);
}

// ── Duplicated arms ─────────────────────────────────────────────────────────
// Lay the arms out twice: A then B. From copy A every target is a forward
// edge (later arms in A, earlier ones in B); only copy B's backward edges use
// the loop head's shared table. Twice the arm code, half the shared dispatch.
const aLabels = labels.map((_, k) => `$a${k}`), bLabels = labels.map((_, k) => `$b${k}`);
const read = '(array.get $code (local.get $code) (local.get $pc))';
const siteA = (from) => `(br_table ${labels.map((_, j) => (j > from ? aLabels[j] : bLabels[j])).join(' ')} ${from >= 0 ? bLabels[0] : aLabels[0]} ${read})`;
const siteB = (from) => `(br_table ${labels.map((_, j) => (j > from ? bLabels[j] : '$top')).join(' ')} $top ${read})`;
const bodyWith = (k, site) => (k === 0 ? '(br $exit)' : bodyOf(k, () => site(k)));
let chain2 = `(br_table ${aLabels.join(' ')} ${aLabels[0]} ${read})`;
for (let k = 0; k < OPS; k++) chain2 = `(block ${aLabels[k]} ${chain2})\n ${bodyWith(k, siteA)}`;
for (let k = 0; k < OPS; k++) chain2 = `(block ${bLabels[k]} ${chain2})\n ${bodyWith(k, siteB)}`;
const duplicated = `(module ${prelude2}
  (func (export "run") (param $code (ref $code)) (param $n i32) (result i32)
    (local $pc i32) (local $acc i32) (local $i i32)
    (block $exit (loop $top ${chain2}))
    (local.get $acc)))`;
{
  const bytes = build(duplicated);
  const { instance } = await WebAssembly.instantiate(bytes);
  const code = instance.exports.make();
  if (instance.exports.run(code, PASSES) !== expected2) throw new Error('duplicated disagrees');
  console.log(`  ${'duplicated'.padEnd(11)} ${time(() => instance.exports.run(code, PASSES)).toFixed(2).padStart(8)} ms   ${bytes.length} B wasm (program data included)`);
}
