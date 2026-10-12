// Where should a lexer's bytes and tables live?
//
//   mem          input and DFA table are each a `mem` (their own linear memory)
//   GC table     input is a mem, the table a WasmGC Array[I32] (bounds-checked)
//   Str input    the table is a mem, input is a JS string read code unit by unit
//   JavaScript   the same loop over Uint8Arrays
//
// The DFA is 128 random states over bytes; state 0 counts as an accept, so
// every step is one dependent table load (`s = table[s * 256 + byte]`).
import { compileUtu, engine, row, time } from './bench-lib.mjs';

const N = Number(process.env.N ?? 16 << 20);
const STATES = 128;

const source = `
export mem input: U8;
export mem table: U8;
export lib {
    fn dfa_mem(n: I32) I32 {
        let s = 0; let c = 0;
        for (0 ..< n) |i| { s = table[(s << 8) + input[i]]; if s == 0 { c += 1; }; };
        c;
    }
    fn dfa_array(t: Array[I32], n: I32) I32 {
        let s = 0; let c = 0;
        for (0 ..< n) |i| { s = t[(s << 8) + input[i]]; if s == 0 { c += 1; }; };
        c;
    }
    fn dfa_str(text: Str, n: I32) I32 {
        let s = 0; let c = 0;
        for (0 ..< n) |i| { s = table[(s << 8) + text[i]]; if s == 0 { c += 1; }; };
        c;
    }
    fn make_table(n: I32) Array[I32] { Array[I32].new(n, 0); }
    fn set_table(t: Array[I32], i: I32, v: I32) void { t[i] = v; }
    fn size_input(n: I32) void { input.resize(n); }
    fn size_table(n: I32) void { table.resize(n); }
}`;

let seed = 1;
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16;
const tableBytes = new Uint8Array(STATES * 256);
for (let i = 0; i < tableBytes.length; i++) tableBytes[i] = rnd() % 9 === 0 ? 0 : rnd() % STATES;
const inputBytes = new Uint8Array(N);
for (let i = 0; i < N; i++) inputBytes[i] = 32 + rnd() % 90;
const text = new TextDecoder().decode(inputBytes);

function js(table, input, n) {
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) { s = table[(s << 8) + input[i]]; if (s === 0) c++; }
  return c;
}

console.log(`${engine}, ${(N / (1 << 20)).toFixed(0)} MiB input, ${STATES}-state table`);
const want = js(tableBytes, inputBytes, N);
for (const optimize of ['size', 'speed']) {
  const { exports, bytes } = await compileUtu(`memories_${optimize}`, source, optimize);
  exports.size_input(N);
  exports.size_table(tableBytes.length);
  new Uint8Array(exports.input.buffer).set(inputBytes);
  new Uint8Array(exports.table.buffer).set(tableBytes);
  const gc = exports.make_table(tableBytes.length);
  for (let i = 0; i < tableBytes.length; i++) exports.set_table(gc, i, tableBytes[i]);
  const runs = {
    mem: () => exports.dfa_mem(N),
    'GC table': () => exports.dfa_array(gc, N),
    'Str input': () => exports.dfa_str(text, N),
  };
  console.log(`\n${optimize === 'size' ? '-Oz' : '-O3'} (${bytes} B module)`);
  for (const [name, run] of Object.entries(runs)) {
    if (run() !== want) throw new Error(`${name}: ${run()} != ${want}`);
    const ms = time(run);
    row(name, ms, `${(ms * 1e6 / N).toFixed(2)} ns/byte`);
  }
}
const ms = time(() => js(tableBytes, inputBytes, N));
console.log('');
row('JavaScript Uint8Array', ms, `${(ms * 1e6 / N).toFixed(2)} ns/byte`);
