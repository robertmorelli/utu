// BG fasta Swift #3 (Ralph Ganszky), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-swift-3.html
// Changes: single-threaded: randomFasta runs genRandom then consumeRandom on each
// block in turn, on the same nBufs buffers (no Dispatch queues or semaphores).
// print(...) -> out(...), the output sink (here: FNV-1a over the bytes): print's
// String(cString:) of a block becomes its bytes, and the newline print adds is
// written explicitly. The alu block is built as bytes ([UInt8]) rather than through
// String(repeating:)/withCString, same layout. No Foundation (50 MB in Wasm).
// Top-level code -> fasta(n) (seed reset) and the export bench(n). Programs that
// read fasta's output copy the block between the "fasta generator" markers and make out()
// append (scratchpad fasta-input.md).

/* The Computer Language Benchmarks Game
 https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 contributed by Ralph Ganszky

 for Swift 3.0+
 using multiple threads by splitting workload in
 random number generation and building output string.
 random number get generated as Int32 like in gcc-7
 by Jeremy Zerfas and normalized in a later step.
*/

// ---- output sink: what BG writes to stdout goes here
nonisolated(unsafe) var fnvHash: UInt32 = 0
func out(_ p: UnsafePointer<UInt8>, _ count: Int) {
    var h = fnvHash
    for i in 0..<count {
        h ^= UInt32(p[i])
        h = h &* 16777619
    }
    fnvHash = h
}
func out(_ bytes: [UInt8]) {
    bytes.withUnsafeBufferPointer { b in out(b.baseAddress!, b.count) }
}
func out(_ s: String) { out(Array(s.utf8)) }
// ---- fasta generator: copy from here to "end of the fasta generator"

let linewidth = 60
let bufferLines = 10240
let rndBufSize = (bufferLines * linewidth)
let writeBufSize = (bufferLines * (linewidth + 1))

let IM: Int32 = 139968
let IA: Int32 = 3877
let IC: Int32 = 29573
nonisolated(unsafe) var seed: Int32 = 42

typealias AminoAcid = (prob: Double, sym: String)
typealias CumAcid = (cprob: Int32, sym: UInt8)

// String to repeat
let alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTC" +
          "GAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTG" +
          "TAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCG" +
          "CCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"

// Amino acids and their probabilities
nonisolated(unsafe) var iub = [
    AminoAcid(0.27, "a"),
    AminoAcid(0.12, "c"),
    AminoAcid(0.12, "g"),
    AminoAcid(0.27, "t"),
    AminoAcid(0.02, "B"),
    AminoAcid(0.02, "D"),
    AminoAcid(0.02, "H"),
    AminoAcid(0.02, "K"),
    AminoAcid(0.02, "M"),
    AminoAcid(0.02, "N"),
    AminoAcid(0.02, "R"),
    AminoAcid(0.02, "S"),
    AminoAcid(0.02, "V"),
    AminoAcid(0.02, "W"),
    AminoAcid(0.02, "Y"),
]

nonisolated(unsafe) var homosapiens = [
    AminoAcid(0.3029549426680, "a"),
    AminoAcid(0.1979883004921, "c"),
    AminoAcid(0.1975473066391, "g"),
    AminoAcid(0.3015094502008, "t"),
]

// Allocate some resources to buffer data
let nBufs = 4   // need to be a power of two
nonisolated(unsafe) let bufs: [UnsafeMutablePointer<Int32>] = (0..<nBufs).map { _ in UnsafeMutablePointer<Int32>.allocate(capacity: rndBufSize) }
nonisolated(unsafe) let cBufs: [UnsafeMutablePointer<UInt8>] = (0..<nBufs).map { _ in UnsafeMutablePointer<UInt8>.allocate(capacity: writeBufSize) }

// Binary search on acids
func bsearch(e: Int32, acids: [CumAcid]) -> UInt8 {
    var low = 0
    var high = acids.count - 1
    while low <= high {
        let mid = low + (high - low) / 2
        if acids[mid].cprob >= e {
            high = mid - 1
        } else {
            low = mid + 1
        }
    }
    return acids[high + 1].sym
}

// Build a block in fasta format
func buildFastaBlockFromString(s: String) -> [UInt8] {
    // Build block of linewidth characters wide string
    let su = Array(s.utf8)
    var block = [UInt8]()
    for _ in 0..<linewidth { block += su }
    var blockNl = [UInt8]()
    blockNl.reserveCapacity(block.count + su.count - 1)
    for i in 0..<su.count {
        blockNl += block[(i*linewidth)..<(i*linewidth + linewidth)]
        if i < su.count - 1 {
            blockNl.append(10)
        }
    }
    return blockNl
}

// random
@inline(__always)
func random() -> Int32 {
    seed = (seed * IA + IC) % IM
    return seed
}

// Producer task
func genRandom(n: Int, block: Int) {
    let buf = bufs[block]
    for i in 0..<min(n, rndBufSize) {
        buf[i] = random()
    }
}

// Consumer task
func consumeRandom(n: Int, block: Int, acids: [CumAcid]) {
    let buf = bufs[block]
    let cBuf = cBufs[block]
    var bufPos = 0
    var lineCounter = 0
    for i in 0..<min(n, rndBufSize) {
        let c = bsearch(e: buf[i], acids: acids)
        cBuf[bufPos] = c
        lineCounter += 1
        bufPos += 1
        if lineCounter == linewidth {
            cBuf[bufPos] = 10
            bufPos += 1
            lineCounter = 0
        }
    }
}

// Print random amino acid sequences
func randomFasta(n: Int, acids: [AminoAcid]) {

    // Adjust probability to cumulative
    var cumulative = 0.0
    var cumAcid = [CumAcid](repeating: (0, 0), count: acids.count)
    for (i, acid) in acids.enumerated() {
        cumulative += acid.prob
        cumAcid[i].cprob = Int32(cumulative*Double(IM))
        cumAcid[i].sym = acid.sym.utf8.first!
    }

    let junks = (n + rndBufSize - 1) / rndBufSize
    let remainder = n % rndBufSize
    for i in 0..<junks-1 {
        let block = i % bufs.count
        genRandom(n: rndBufSize, block: block)
        consumeRandom(n: rndBufSize, block: block, acids: cumAcid)
        out(cBufs[block], writeBufSize)
    }
    genRandom(n: remainder, block: 0)
    consumeRandom(n: remainder, block: 0, acids: cumAcid)

    var stringRemainder = remainder+(remainder/linewidth)
    if stringRemainder % (linewidth+1) == 0 {
        stringRemainder -= 1
    }
    out(cBufs[0], stringRemainder)
    out([10])
}

// Print alu string in fasta format
func repeatFasta(n: Int, alu: [UInt8]) {
    var aluLen = n + n / linewidth
    let aluSize = alu.count + 1
    if aluLen > aluSize {
        for _ in 0..<aluLen/aluSize {
            out(alu)
            out([10])
        }
        aluLen -= (aluLen / aluSize) * aluSize
    }
    // Remove newline at the end because print adds it anyhow
    if n % linewidth == 0 {
        aluLen -= 1
    }
    if aluLen > 0 {
        out(Array(alu[0..<aluLen]))
        out([10])
    }
}

func fasta(_ n: Int) {
    seed = 42

    // Build block of linewidth characters wide string
    let aluBlock = buildFastaBlockFromString(s: alu)

    out(">ONE Homo sapiens alu\n")
    repeatFasta(n: 2*n, alu: aluBlock)

    out(">TWO IUB ambiguity codes\n")
    randomFasta(n: 3*n, acids: iub)

    out(">THREE Homo sapiens frequency\n")
    randomFasta(n: 5*n, acids: homosapiens)
}
// ---- end of the fasta generator

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    fnvHash = 2166136261
    fasta(Int(n))
    return fnvHash
}
