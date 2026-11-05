// BG spectralnorm Node #6 (Ian Osgood, Roy Williams, Isaac Gouy; threads by Andrey Filatkin), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-node-6.html
// Changes: one thread: the worker's au/atu (top-level here) run over all rows
// (start = 0, end = N) on the same Float64Arrays; mainThread -> bench(n), which
// returns the FNV-1a hash of the bytes the program printed.

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Ian Osgood
// Optimized by Roy Williams
// modified for Node.js by Isaac Gouy
// multi thread by Andrey Filatkin

const bytesPerFloat = Float64Array.BYTES_PER_ELEMENT;

// The worker's state and functions, made once as in workerThread (making them
// in each bench call let V8 drop to code 2.8x slower after a few calls).
let N, start, end; // (N: the driver has a global n)

function bench(n) {
    N = n;
    const sab = new ArrayBuffer(3 * bytesPerFloat * N);
    const u = new Float64Array(sab, 0, N).fill(1);
    const v = new Float64Array(sab, bytesPerFloat * N, N);
    const w = new Float64Array(sab, 2 * bytesPerFloat * N, N);
    start = 0;
    end = N;

    for (let i = 0; i < 10; i++) {
        atAu(u, v, w);
        atAu(v, u, w);
    }

    let vBv = 0;
    let vv = 0;
    for (let i = 0; i < N; i++) {
        vBv += u[i] * v[i];
        vv += v[i] * v[i];
    }

    const result = Math.sqrt(vBv / vv);

    const s = result.toFixed(9) + '\n';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function atAu(u, v, w) {
    au(u, w);
    atu(w, v);
}

function au(u, v) {
    for (let i = start; i < end; i++) {
        let t = 0;
        for (let j = 0; j < N; j++) {
            t += u[j] / a(i, j);
        }
        v[i] = t;
    }
}

function atu(u, v) {
    for (let i = start; i < end; i++) {
        let t = 0;
        for (let j = 0; j < N; j++) {
            t += u[j] / a(j, i);
        }
        v[i] = t;
    }
}

function a(i, j) {
    return ((i + j) * (i + j + 1) >>> 1) + i + 1;
}
