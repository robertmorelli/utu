// BG revcomp Swift #1 (Ralph Ganszky), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-swift-1.html
// Changes: single-threaded: the three sequences are read, reverse-complemented
// and written in turn (no Dispatch queues; the deferred-write bookkeeping is then
// moot). BlockReader's fread from stdin -> a copy from the fasta output setup(n)
// generated (fasta Swift #3's generator, below, with out() appending to it);
// fwrite to stdout -> write(), FNV-1a over the bytes. No Foundation (WASILibc for
// memchr/exit). Top-level code -> the export bench(n), which returns the hash.

#if canImport(WASILibc)
import WASILibc
#else
import Foundation
#endif

// ---- input: the fasta output setup(n) generates
nonisolated(unsafe) var input = [UInt8]()
func out(_ p: UnsafePointer<UInt8>, _ count: Int) {
    input.append(contentsOf: UnsafeBufferPointer(start: p, count: count))
}
func out(_ bytes: [UInt8]) { input.append(contentsOf: bytes) }
func out(_ s: String) { input.append(contentsOf: Array(s.utf8)) }

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

@_expose(wasm, "setup")
@_cdecl("setup")
public func setup(_ n: Int32) {
    input.removeAll(keepingCapacity: true)
    fasta(Int(n))
}

// ---- output: FNV-1a over what the program writes
nonisolated(unsafe) var outHash: UInt32 = 0
func write(_ a: [Int8]) {
    var h = outHash
    for b in a {
        h ^= UInt32(UInt8(bitPattern: b))
        h = h &* 16777619
    }
    outHash = h
}

// The Computer Language Benchmark Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// implementation inspired by gcc #6
// contributed by Ralph Ganszky

// BlockReader class does a bit more than necessary, but this
// should not be that expensive.

final class BlockReader {
    
    // Constants
    private let blockSize = 64*1024
    private let lineSize = 60
    private let descMarker = ">".utf16.map{Int8($0)}[0]
    
    // Attributes
    private var block: UnsafeMutablePointer<Int8>
    private var bytesRead: Int
    private var eof: Bool
    private var readPos: Int
    private var inputPos: Int
    
    init() {
        block = UnsafeMutablePointer<Int8>.allocate(capacity: blockSize+1)
        block[blockSize] = 0
        bytesRead = 0
        eof = false
        readPos = 0
        inputPos = 0
    }
    
    deinit {
        block.deallocate()
    }
    
    // fread(block, 1, blockSize, stdin), from the input.
    private func readBlock() {
        bytesRead = min(blockSize, input.count - inputPos)
        input.withUnsafeBufferPointer { p in
            UnsafeMutableRawPointer(block).copyMemory(from: p.baseAddress! + inputPos, byteCount: bytesRead)
        }
        inputPos += bytesRead
        block[bytesRead] = 0
        if bytesRead < blockSize {
            eof = true
        }
        readPos = 0
    }
    
    func read() -> ([Int8], [Int8]) {
        
        // Allocate byte array
        var description = [Int8]()
        var seq = [Int8]()
        
        // Read a block if we don't have one
        if bytesRead == 0 {
            readBlock()
        }
        
        // Read description
        if block[readPos] == descMarker {
            // search for '\n'
            var descStart = readPos
            while block[readPos] != 10 {
                readPos += 1
                if readPos > bytesRead {
                    description.append(
			contentsOf: Array(
			    UnsafeBufferPointer(
				start: block.advanced(by: descStart),
				count: readPos-descStart)))
                    readBlock()
                    descStart = 0
                    if eof {
                        print("Error: EOF reached")
                        exit(1)
                    }
                }
            }
            readPos += 1
            description.append(
		contentsOf: Array(
		    UnsafeBufferPointer(
			start: block.advanced(by: descStart),
			count: readPos-descStart)))
        } else {
            print("Error: Could no find description!")
            exit(1)
        }
        
        // Read fasta lines
        var seqStart = readPos
        var endReached = false
        repeat {
            if let ppos = memchr(block.advanced(by: seqStart),
				 Int32(descMarker), bytesRead-seqStart) {
                // Append til pos and return
                let pos = block.distance(
			to: ppos.assumingMemoryBound(to: Int8.self))
                seq.append(
		    contentsOf: Array(
			UnsafeBufferPointer(
			    start: block.advanced(by: seqStart),
			    count: pos-seqStart)))
                readPos = pos
                endReached = true
            } else {
                // Append block and read next block
                seq.append(
		    contentsOf: Array(
			UnsafeBufferPointer(
			    start: block.advanced(by: seqStart),
			    count: bytesRead-seqStart)))
                readBlock()
                if eof {
                    if bytesRead > 0 {
                        seq.append(
			    contentsOf: Array(
				UnsafeBufferPointer(
				    start: block,
				    count: bytesRead)))
                    }
                    break
                }
                seqStart = 0
            }
        } while !endReached
        
        return (description, seq)
    }
}

// code  meaning   complement
// A    A                   T
// C    C                   G
// G    G                   C
// T/U  T                   A
// M    A or C              K
// R    A or G              Y
// W    A or T              W
// S    C or G              S
// Y    C or T              R
// K    G or T              M
// V    A or C or G         B
// H    A or C or T         D
// D    A or G or T         H
// B    C or G or T         V
// N    G or A or T or C    N

// Translation table
//               ABCDEFGHIJKLMNOPQRSTUVWXYZ      abcdefghijklmnopqrstuvwxyz
let translate = ("                                                                " +
                 " TVGH  CD  M KN   YSAABW R       TVGH  CD  M KN   YSAABW R ").utf16.map{Int8($0)}
func reverseComplement(seq: inout [Int8]) {
    var front = 0
    var back = seq.count - 1
    // Ignore '\n' at front and back
    while seq[front] == 10 && front <= back {
        front += 1
    }
    while seq[back] == 10 && front <= back {
        back -= 1
    }
    while front <= back {
        let temp = translate[Int(seq[front])]
        seq[front] = translate[Int(seq[back])]
        seq[back] = temp
        repeat { front += 1 } while seq[front] == 10
        repeat { back -= 1 } while seq[back] == 10
}
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    outHash = 2166136261
    let reader = BlockReader()

    // Read, build reverse complement and write every of the three blocks
    for _ in 0..<3 {
        var (desc, seq) = reader.read()
        reverseComplement(seq: &seq)
        write(desc)
        write(seq)
    }
    return outHash
}
