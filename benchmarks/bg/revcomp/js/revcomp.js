// BG revcomp Node #2 (Joe Farro; parts from Jos Hirth, 10iii), adapted for d8:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-node-2.html
// Changes: process.stdin -> the fasta output setup(n) generated (fasta Node #5's
// generator, below, with sink appending to it): stdin.read(READ_SIZE) returns its
// next READ_SIZE bytes (a copy, as a stream read is), null at the end, and bench
// calls read() as the 'readable' events would (all data available, then end).
// Node's Buffer -> Uint8Array (Buffer slice = subarray, a view). stdout.write and
// console.log -> write(), FNV-1a over the bytes. The state is reset per bench.
// Single-threaded already.

/*  The Computer Language Benchmarks Game
    https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

    contributed by Joe Farro
    parts taken from solution contributed by
    Jos Hirth which was modified by 10iii
*/

// ---- input: the fasta output setup(n) generates
let input = new Uint8Array(1 << 20);
let inputLength = 0;
function sink(buf, start, end) {
    const len = end - start;
    if (inputLength + len > input.length) {
        let size = input.length * 2;
        while (inputLength + len > size) size *= 2;
        const grown = new Uint8Array(size);
        grown.set(input.subarray(0, inputLength));
        input = grown;
    }
    input.set(buf.subarray(start, end), inputLength);
    inputLength += len;
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

function setup(n) {
    inputLength = 0;
    fasta(n);
}

// ---- stdin and stdout
let inputPos = 0;
const stdin = {
    read(size) {
        if (inputPos >= inputLength) return null;
        const end = Math.min(inputPos + size, inputLength);
        const chunk = input.slice(inputPos, end);
        inputPos = end;
        return chunk;
    }
};

let outHash = 0;
function write(buf, start, end) {
    let h = outHash;
    for (let i = start; i < end; i++) h = Math.imul(h ^ buf[i], 16777619);
    outHash = h;
}
const stdout = { write(buf) { write(buf, 0, buf.length); } };
const NEWLINE = new Uint8Array([10]);
const console = { log(...parts) { for (const p of parts) stdout.write(p); stdout.write(NEWLINE); } };

const READ_SIZE = 16000;
const writeBuffer = new Uint8Array(READ_SIZE + READ_SIZE / 61 | 0);
let metaI;
let numLines;


function LinkedArray(prev) {
    this.prev = prev;
    this.next = undefined;
    this.pos = 0;
    this.data = [];
}


function getCompChar(code) {
    switch (code) {
        case 65:
        case 97: return 84;
        case 66:
        case 98: return 86;
        case 67:
        case 99: return 71;
        case 68:
        case 100: return 72;
        case 71:
        case 103: return 67;
        case 72:
        case 104: return 68;
        case 75:
        case 107: return 77;
        case 77:
        case 109: return 75;
        case 78:
        case 110: return 78;
        case 82:
        case 114: return 89;
        case 83:
        case 115: return 83;
        case 84:
        case 85: return 65;
        case 86:
        case 118: return 66;
        case 87:
        case 119: return 87;
        case 116:
        case 117: return 65;
        case 89:
        case 121: return 82;
    }
}


function reverseCompPrint(line) {
    let _metaI = metaI;
    let _numLines = numLines;
    let count = 0;
    const target = writeBuffer;
    const len = line.length;
    const right = line.length - 1;

    let ileft = 0;
    let iright = 0;

    let c;
    while (iright < len) {
        c = line[right - iright];
        iright++;
        if (c === 10) {
            // skip linebreaks
            if (iright === len) {
                break;
            }
            c = line[right - iright];
            iright++;
        }
        target[ileft] = getCompChar(c);
        ileft++;
        count++;
        if ((count + _metaI - _numLines) % 60 === 0) {
            // need a linebreak
            target[ileft] = 10;
            ileft++;
            count++;
            _numLines++;
        }
    }
    metaI = _metaI + count;
    numLines = _numLines;
    write(target, 0, count);
}


function reverse(la_) {
    // reset the metaI and numLines in this section
    metaI = 0;
    numLines = 0;

    var la = la_,
        lines = la.data,
        lnIdx = la.pos - 1,
        line = lines[lnIdx];

    while (true) {
        reverseCompPrint(line);
        lnIdx--;
        line = lines[lnIdx];
        if (line) {
            continue;
        }
        la = la.prev;
        if (la === undefined) {
            break;
        }
        lines = la.data;
        lnIdx = la.pos;
        lnIdx--;
        line = lines[lnIdx];
    }
    if ((metaI - numLines) % 60 !== 0) {
        stdout.write(NEWLINE);
    }
}


const LA_LEN = 30;
let headLA;
let la;
let lnIdx;
let lines;

let needHeader;
let headerPartial;
let isFirst;


function read() {
    let chunk = stdin.read(READ_SIZE);
    let isFinal = false;
    if (!chunk) {
        if (isFirst) {
            isFirst = false;
            return;
        }
        la.pos = lnIdx;
        reverse(la);
        return;
    } else if (chunk.length < READ_SIZE) {
        isFinal = true;
    }
    while (chunk) {
        while (true) {
            // if have read a partial header line, read the rest of it
            if (needHeader) {
                const headerEnds = chunk.indexOf(10);
                console.log(headerPartial, chunk.subarray(0, headerEnds));
                headerPartial = new Uint8Array(0);
                chunk = chunk.subarray(headerEnds);
                needHeader = false;
            }
            const caretIdx = chunk.indexOf(62);
            if (caretIdx > -1) {
                // there is a caret in this chunk -- process the first part of
                // the chunk and then continue the `while (true)` loop to process
                // the next part of the chunk
                lines[lnIdx] = chunk.subarray(0, caretIdx);
                // set chunk to the next section
                chunk = chunk.subarray(caretIdx);
                la.pos = lnIdx + 1;
                reverse(la);
                // reset the data holders
                la = headLA;
                lines = la.data;
                la.pos = 0;
                lnIdx = 0;
                // check to see if the entire header line is here
                const headerEnds = chunk.indexOf(10);
                if (headerEnds < 0) {
                    needHeader = true;
                    headerPartial = chunk;
                    break;
                } else {
                    // log the header
                    console.log(chunk.subarray(0, headerEnds));
                    // continue processing the rest of the chunk
                    chunk = chunk.subarray(headerEnds);
                }
            } else {
                if (lnIdx === LA_LEN) {
                    la.pos = LA_LEN;
                    la = la.next || (la.next = new LinkedArray(la));
                    lines = la.data;
                    lines[0] = chunk;
                    lnIdx = la.pos = 1;
                } else {
                    lines[lnIdx] = chunk;
                    lnIdx++;
                }
                break;
            }
        }
        chunk = stdin.read(READ_SIZE);
    }
    if (isFinal) {
        la.pos = lnIdx;
        reverse(la);
    }
    return isFinal;
}


function bench(n) {
    outHash = 2166136261 | 0;
    inputPos = 0;
    headLA = new LinkedArray();
    la = headLA;
    lnIdx = 0;
    lines = la.data;
    needHeader = true;
    headerPartial = new Uint8Array(0);
    isFirst = false;
    // 'readable' with all the data; then, unless that ended it, the end.
    if (!read()) read();
    return outHash >>> 0;
}
