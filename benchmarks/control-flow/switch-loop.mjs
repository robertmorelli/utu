// `loop match` (Zig-style switch loop) against the state machine you can
// write without it: a while loop around a match. Workloads: a register-machine
// interpreter (3 dispatches per iteration) and a three-state lexer.

import { compileUtu, engine, row, time } from './bench-lib.mjs';

const N = Number(process.env.N ?? 10_000_000);

const loopMatch = `export lib {
    fn run(n: I32) I32 {
        let code = [1, 2, 3, 0, 0];
        let pc = 0;
        let acc = 0;
        let i = 0;
        loop match code[pc] {
            1 => { acc += i; pc += 1; continue code[pc]; },
            2 => { i += 1; pc += 1; continue code[pc]; },
            3 => { if i < n { pc = code[pc + 1]; } else { pc += 2; }; continue code[pc]; },
            ~> { break; },
        };
        acc;
    }
}`;

const whileMatch = `export lib {
    fn run(n: I32) I32 {
        let code = [1, 2, 3, 0, 0];
        let pc = 0;
        let acc = 0;
        let i = 0;
        let running = true;
        while (running) {
            match code[pc] {
                1 => { acc += i; pc += 1; },
                2 => { i += 1; pc += 1; },
                3 => { if i < n { pc = code[pc + 1]; } else { pc += 2; }; },
                ~> { running = false; },
            };
        };
        acc;
    }
}`;

function js(n) {
  const code = new Int32Array([1, 2, 3, 0, 0]);
  let pc = 0, acc = 0, i = 0;
  for (;;) {
    switch (code[pc]) {
      case 1: acc = (acc + i) | 0; pc++; continue;
      case 2: i++; pc++; continue;
      case 3: pc = i < n ? code[pc + 1] : pc + 2; continue;
      default: return acc;
    }
  }
}

console.log(`${engine}: interpreter, ${N.toLocaleString()} iterations (${(3 * N).toLocaleString()} dispatches)`);
const expected = js(N);
for (const optimize of ['size', 'speed']) {
  for (const [label, source] of [['loop match', loopMatch], ['while + match', whileMatch]]) {
    const { exports, bytes, gzip } = await compileUtu(`switch-${label.replace(/\W/g, '')}-${optimize}`, source, optimize);
    if (exports.run(N) !== expected) throw new Error(`${label} computed ${exports.run(N)}, expected ${expected}`);
    row(`${label} (${optimize === 'size' ? '-Oz' : '-O3'})`, time(() => exports.run(N)), `${bytes} B wasm, ${gzip} B gzip`);
  }
}
row('JavaScript switch', time(() => js(N)));


// Lexer: data-dependent transitions with constant targets (`continue 2`),
// the case threaded dispatch is meant for. Counts words and numbers in
// deterministic pseudo-random text built inside wasm (same LCG as below).
const BYTES = Number(process.env.BYTES ?? 4_000_000);
const makeText = `
    fn make(n: I32) Array[I32] {
        let text = Array[I32].new(n, 32);
        let seed = 7;
        let i = 0;
        while (i < n) {
            seed = (seed * 1103515245 + 12345) & 2147483647;
            let kind = seed % 10;
            seed = (seed * 1103515245 + 12345) & 2147483647;
            let length = 1 + seed % 8;
            let k = 0;
            while (k < length and i < n) {
                seed = (seed * 1103515245 + 12345) & 2147483647;
                text[i] = if kind < 5 { 97 + seed % 26; } else if kind < 8 { 48 + seed % 10; } else { 32; };
                i += 1;
                k += 1;
            };
        };
        text;
    }`;
const lexLoopMatch = `export lib {${makeText}
    fn lex(text: Array[I32]) I32 {
        let i = 0;
        let words = 0;
        let numbers = 0;
        let n = text.len();
        loop match 0 {
            0 => {
                if i >= n { break; };
                let c = text[i];
                i += 1;
                if c >= 97 { words += 1; continue 1; };
                if c >= 48 { numbers += 1; continue 2; };
                continue 0;
            },
            1 => {
                if i >= n { break; };
                let c = text[i];
                i += 1;
                if c >= 97 { continue 1; };
                if c >= 48 { numbers += 1; continue 2; };
                continue 0;
            },
            2 => {
                if i >= n { break; };
                let c = text[i];
                i += 1;
                if c >= 97 { words += 1; continue 1; };
                if c >= 48 { continue 2; };
                continue 0;
            },
            ~> {},
        };
        words * 1000000 + numbers;
    }
}`;
const lexWhileMatch = `export lib {${makeText}
    fn lex(text: Array[I32]) I32 {
        let i = 0;
        let words = 0;
        let numbers = 0;
        let n = text.len();
        let state = 0;
        while (i < n) {
            let c = text[i];
            i += 1;
            state = match state {
                0 => if c >= 97 { words += 1; 1; } else if c >= 48 { numbers += 1; 2; } else { 0; },
                1 => if c >= 97 { 1; } else if c >= 48 { numbers += 1; 2; } else { 0; },
                ~> if c >= 97 { words += 1; 1; } else if c >= 48 { 2; } else { 0; },
            };
        };
        words * 1000000 + numbers;
    }
}`;

console.log(`${engine}: lexer, ${BYTES.toLocaleString()} bytes`);
let lexExpected = null;
for (const optimize of ['size', 'speed']) {
  for (const [label, source] of [['loop match', lexLoopMatch], ['while + match', lexWhileMatch]]) {
    const { exports, bytes, gzip } = await compileUtu(`lex-${label.replace(/\W/g, '')}-${optimize}`, source, optimize);
    const text = exports.make(BYTES);
    const result = exports.lex(text);
    lexExpected ??= result;
    if (result !== lexExpected) throw new Error(`${label} lexed ${result}, expected ${lexExpected}`);
    row(`${label} (${optimize === 'size' ? '-Oz' : '-O3'})`, time(() => exports.lex(text)), `${bytes} B wasm, ${gzip} B gzip`);
  }
}
