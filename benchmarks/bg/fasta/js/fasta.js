// BG fasta Node #5 (Roman Pletnev, Andrey Filatkin), adapted for d8:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-node-5.html
// Changes: single-threaded: the main thread fills the random buffer, then runs the
// worker's generateDna on it itself (same buffers, same chunking; no workers,
// no SharedArrayBuffer messages). Node's Buffer -> Uint8Array (copy -> set,
// write(str, 'binary') -> char codes). Out.flush writes to sink(), the output sink
// (here: FNV-1a over the bytes). main -> fasta(n) (seed reset) and bench(n).
// Programs that read fasta's output copy the block between the "fasta generator" markers
// and replace sink (scratchpad fasta-input.md).

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Roman Pletnev
   based on C/Dart programs by Petr Prokhorenkov/Jos Hirth et al.
   multi thread by Andrey Filatkin
 */

// ---- output sink: what BG writes to stdout goes here (bytes buf[start..end))
let fnvHash = 0;
function sink(buf, start, end) {
    let h = fnvHash;
    for (let i = start; i < end; i++) h = Math.imul(h ^ buf[i], 16777619);
    fnvHash = h;
}

// ---- fasta generator: copy from here to "end of the fasta generator"
const LINE_LEN = 60;
const RANDOM_BUF_SIZE = LINE_LEN * 1000;
const OUT_BUF_SIZE = (LINE_LEN + 1) * 1000;
const OUT_SIZE = 128 * 1024;
const NEW_LINE = 10;

const alu =
    'GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTG' +
    'GGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGA' +
    'GACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAA' +
    'AATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAAT' +
    'CCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAAC' +
    'CCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTG' +
    'CACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA';

const ac = [
    {s: 'a', p: 0.27}, {s: 'c', p: 0.12}, {s: 'g', p: 0.12},
    {s: 't', p: 0.27}, {s: 'B', p: 0.02}, {s: 'D', p: 0.02},
    {s: 'H', p: 0.02}, {s: 'K', p: 0.02}, {s: 'M', p: 0.02},
    {s: 'N', p: 0.02}, {s: 'R', p: 0.02}, {s: 'S', p: 0.02},
    {s: 'V', p: 0.02}, {s: 'W', p: 0.02}, {s: 'Y', p: 0.02}
];

const hs = [
    {s: 'a', p: 0.3029549426680}, {s: 'c', p: 0.1979883004921},
    {s: 'g', p: 0.1975473066391}, {s: 't', p: 0.3015094502008}
];

function Out() {
    this.bufferSize = OUT_SIZE;
    this.buf = new Uint8Array(this.bufferSize);
    this.ct = 0;
}

Out.prototype.writeString = function(str) {
    for (let i = 0; i < str.length; i++) this.buf[this.ct + i] = str.charCodeAt(i);
    this.ct += str.length;
};

Out.prototype.writeBuffer = function(buffer, pos, len) {
    if (this.ct + len >= this.bufferSize) {
        this.flush();
    }
    this.buf.set(buffer.subarray(pos, pos + len), this.ct);
    this.ct += len;
};

Out.prototype.flush = function() {
    sink(this.buf, 0, this.ct);
    this.ct = 0;
};

function fasta(n) {
    last = 42;
    const out = new Out();

    out.writeString('>ONE Homo sapiens alu\n');
    repeatFasta(alu, n * 2, out);

    out.writeString('>TWO IUB ambiguity codes\n');
    randomFasta(ac, n * 3, out);

    out.writeString('>THREE Homo sapiens frequency\n');
    randomFasta(hs, n * 5, out);

    out.flush();
}

// The main thread's chunk loop with the worker's work done in place.
function randomFasta(genes, count, out) {
    const geneList = makeCumulative(genes);
    const input = new Float64Array(RANDOM_BUF_SIZE);
    const output = new Uint8Array(OUT_BUF_SIZE);
    while (count > 0) {
        const chunk = Math.min(count, RANDOM_BUF_SIZE);
        generateRandom(input, chunk);
        const len = generateDna(geneList, input, output, chunk);
        out.writeBuffer(output, 0, len);
        count -= chunk;
    }
}

function repeatFasta(alu, count, out) {
    const text = alu + alu.substr(0, LINE_LEN);
    const buffer = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) buffer[i] = text.charCodeAt(i);
    const len = alu.length;
    let pos = 0;
    while (count > 0) {
        const line = Math.min(count, LINE_LEN);

        out.writeBuffer(buffer, pos, line);
        out.buf[out.ct++] = NEW_LINE;

        pos += line;
        if (pos > len) {
            pos -= len;
        }
        count -= line;
    }
}

function makeCumulative(ac) {
    const result = [];
    let p = 0;
    for (let i = 0; i < ac.length; ++i) {
        p += ac[i].p;
        result.push({
            c: p,
            sc: ac[i].s.charCodeAt(0)
        });
    }
    return result;
}

let last = 42;

function generateRandom(buf, count) {
    let l = last;
    for (let i = 0; i < count; i++) {
        l = (l * 3877 + 29573) % 139968;
        buf[i] = l / 139968;
    }
    last = l;
}

function generateDna(geneList, input, output, count) {
    let i = 0;
    let o = 0;
    while (count > 0) {
        const line = Math.min(count, LINE_LEN);

        for (let j = 0; j < line; j++) {
            output[o++] = randomCode(input[i++]);
        }
        output[o++] = NEW_LINE;

        count -= line;
    }
    return o;

    function randomCode(rand) {
        for (let j = 0; j < geneList.length; j++) {
            if (rand < geneList[j].c) {
                return geneList[j].sc;
            }
        }
        return geneList[geneList.length - 1].sc;
    }
}
// ---- end of the fasta generator

function bench(n) {
    fnvHash = 2166136261 | 0;
    fasta(n);
    return fnvHash >>> 0;
}
