// BG mandelbrot Node #3 (Andrey Filatkin, after Go #4), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-node-3.html
// Changes: one thread: renderRows takes the rows in order here (was one worker per
// CPU claiming rows with Atomics on a SharedArrayBuffer); an ArrayBuffer in place
// of the SharedArrayBuffer; mainThread -> bench(n), which returns the FNV-1a hash
// of the bytes the program wrote (header and rows). renderRow unchanged.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Andrey Filatkin
   based on mandelbrot.go-4.go contributed by Martin Koistinen and others
*/

const limit = 4;
const maxIter = 50;
const bytesPerFloat = Float64Array.BYTES_PER_ELEMENT;

function bench(size) {
    const bytesPerRow = size >> 3;

    const nextYSize = bytesPerFloat;
    const initialSize = size * bytesPerFloat;
    const rowsStart = nextYSize + 2 * initialSize;
    const rowsSize = size * bytesPerRow;

    const sab = new ArrayBuffer(nextYSize + 2 * initialSize + rowsSize);
    const initialR = new Float64Array(sab, nextYSize, size);
    const initialI = new Float64Array(sab, nextYSize + initialSize, size);
    const inv = 2 / size;
    for (let xy = 0; xy < size; xy++) {
        const i = inv * xy;
        initialR[xy] = i - 1.5;
        initialI[xy] = i - 1.0;
    }

    renderRows();

    let h = 2166136261;
    const header = `P4\n${size} ${size}\n`;
    for (let i = 0; i < header.length; i++) h = Math.imul(h ^ header.charCodeAt(i), 16777619);
    const rows = new Uint8Array(sab, rowsStart, rowsSize);
    for (let i = 0; i < rowsSize; i++) h = Math.imul(h ^ rows[i], 16777619);
    return h >>> 0;

    function renderRows() {
        for (let y = 0; y < size; y++) {
            const row = new Uint8Array(sab, rowsStart + y * bytesPerRow, bytesPerRow);
            renderRow(row, y);
        }
    }

    function renderRow(row, y0) {
        for (let xByte = 0; xByte < bytesPerRow; xByte++) {
            const ci = initialI[y0];
            let res = 0;
            for (let i = 0; i < 8; i += 2) {
                const x = xByte << 3;
                const cr1 = initialR[x + i];
                const cr2 = initialR[x + i + 1];

                let zr1 = cr1;
                let zi1 = ci;

                let zr2 = cr2;
                let zi2 = ci;

                let b = 0;

                for (let j = 0; j < maxIter; j++) {
                    const tr1 = zr1 * zr1;
                    const ti1 = zi1 * zi1;
                    zi1 = 2 * zr1 * zi1 + ci;
                    zr1 = tr1 - ti1 + cr1;

                    if (tr1 + ti1 > limit) {
                        b |= 2;
                        if (b === 3) {
                            break;
                        }
                    }

                    const tr2 = zr2 * zr2;
                    const ti2 = zi2 * zi2;
                    zi2 = 2 * zr2 * zi2 + ci;
                    zr2 = tr2 - ti2 + cr2;

                    if (tr2 + ti2 > limit) {
                        b |= 1;
                        if (b === 3) {
                            break;
                        }
                    }
                }
                res = (res << 2) | b;
            }
            row[xByte] = ~res;
        }
    }
}
