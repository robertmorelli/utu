// How should `yield` compile? Each strategy is written by hand in today's utu
// so the comparison measures code shape, not a particular implementation.
//
//   inline        consumer body substituted at each yield (no frame, no call)
//   materialize   generator fills an array; the consumer loops over it
//   callback      generator calls a closure for each value
//   state machine heap frame + next(): what a first-class generator compiles to
//
// Generator: squares of 0..n that are not multiples of 3. Consumer: sum.
import { compileUtu, engine, row, time } from './bench-lib.mjs';

const N = Number(process.env.N ?? 2_000_000);

const strategies = {
  'yield (language)': {
    shared: `
    fn squares(n: I32) yield I32 {
        for (0..<n) |i| { if i % 3 != 0 { yield i * i; }; };
    }`,
    consumer: (name) => `fn ${name}(n: I32) I32 {
        let s = 0;
        for (squares(n)) |x| { s += x; };
        s;
    }`,
  },
  inline: {
    shared: '',
    consumer: (name) => `fn ${name}(n: I32) I32 {
        let s = 0;
        for (0..<n) |i| { if i % 3 != 0 { s += i * i; }; };
        s;
    }`,
  },
  materialize: {
    shared: `
    fn produce(n: I32) Array[I32] {
        let out = Buffer[I32].new();
        for (0..<n) |i| { if i % 3 != 0 { out.push(i * i); }; };
        out.finish();
    }`,
    consumer: (name) => `fn ${name}(n: I32) I32 {
        let s = 0;
        for (produce(n)) |x| { s += x; };
        s;
    }`,
  },
  callback: {
    shared: `
    struct Sum:
        | s: I32
    fn produce(n: I32, emit: cl(I32) void) void {
        for (0..<n) |i| { if i % 3 != 0 { emit(i * i); }; };
    }`,
    consumer: (name) => `fn ${name}(n: I32) I32 {
        let total = Sum { s: 0 };
        produce(n, cl(x: I32) void { total.s += x; });
        total.s;
    }`,
  },
  'state machine': {
    shared: `
    struct Squares:
        | i: I32
        | n: I32
        | value: I32
    fn next(g: Squares) Bool {
        while (g.i < g.n) {
            let i = g.i;
            g.i += 1;
            if i % 3 != 0 { g.value = i * i; return true; };
        };
        false;
    }`,
    consumer: (name) => `fn ${name}(n: I32) I32 {
        let g = Squares { i: 0, n: n, value: 0 };
        let s = 0;
        while (next(g)) { s += g.value; };
        s;
    }`,
  },
};

function program(strategy, consumers) {
  const names = Array.from({ length: consumers }, (_, i) => `run${i}`);
  const usesBuffer = strategy === strategies.materialize ? 'using Buffer from std:Buffer;\n' : '';
  // Type declarations live at top level; functions go in the export block.
  const types = strategy.shared.match(/struct [\s\S]*?(?=\n    fn |$)|fn \w+\([^)]*\) yield [\s\S]*?\n    }/g) ?? [];
  const functions = types.reduce((rest, type) => rest.replace(type, ''), strategy.shared);
  return `${usesBuffer}${types.map(type => type.replace(/^ {4}/gm, '')).join('\n')}
export lib {${functions}
    ${names.map(name => strategy.consumer(name)).join('\n    ')}
}`;
}

console.log(`${engine}: ${N.toLocaleString()} candidates`);
let expected = null;
for (const optimize of ['size', 'speed']) {
  for (const [label, strategy] of Object.entries(strategies)) {
    const one = await compileUtu(`gen-${label.replace(/\W/g, '')}-${optimize}-1`, program(strategy, 1), optimize);
    const three = await compileUtu(`gen-${label.replace(/\W/g, '')}-${optimize}-3`, program(strategy, 3), optimize);
    const result = one.exports.run0(N);
    expected ??= result;
    if (result !== expected || three.exports.run2(N) !== expected) throw new Error(`${label} disagrees`);
    row(`${label} (${optimize === 'size' ? '-Oz' : '-O3'})`, time(() => one.exports.run0(N)),
      `1 consumer ${one.bytes} B / ${one.gzip} B gz   3 consumers ${three.bytes} B / ${three.gzip} B gz`);
  }
}
