// BG k-nucleotide Swift #2 (Ralph Ganszky), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-swift-2.html
// Changes: single-threaded (ntasks 1, BG 8: DispatchQueue.concurrentPerform and
// the merge queue become a loop and a direct merge); Foundation is 50 MB in
// Wasm (ICU), so String(format: "%.3f") -> libc vsnprintf and fgets(stdin) ->
// the same over the fasta text setup(n) makes; the top-level code -> the
// export bench(n), which returns the FNV-1a hash of the bytes it printed.
// Hash keys Int -> Int64 (Int is 32 bits on wasm32; 18-mers need 36).

#if canImport(WASILibc)
import WASILibc
#else
import Foundation
#endif

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Ralph Ganszky
*/

let i2c = [ 0: "A", 1: "C", 2: "T", 3: "G" ]

let c2i: [Character:Int] = [ "A": 0, "C": 1, "T": 2, "G": 3 ]

// Keys are Int on BG (64-bit); Int is 32-bit on wasm32, too narrow for the
// 18-mers (36 bits), so they are Int64 here.
typealias Key = Int64

let ntasks = 1 // BG: 8
let linewidth = 60

func compress(_ n: Int, seq: ArraySlice<Int8>) -> Key {
    var res: Key = 0
    for i in seq.indices {
        res = (res << 2) | Key(seq[i])
    }
    return res
}

func decode(_ n: Key, _ len: Int) -> String {
    var val = n
    var s = ""
    for _ in 0..<len {
        s = i2c[Int(val & 0x3)]! + s
        val >>= 2
    }
    return s
}

func encode(_ seq: String) ->  Key {
    let cSeq = seq.utf8.map{(Int8($0) & 0x6) >> 1}
    var res: Key = 0
    for c in cSeq {
        res = res << 2 | Key(c)
    }
    return res
}

func getSequenceHash(_ n: Int, seq: [Int8]) -> [Key:Int] {
    var hash = [Key:Int]()
    let slice = (seq.count-(n-1)) / ntasks
    let remainder = (seq.count-(n-1)) % ntasks
    let mask: Key = ~(-1 << (2*n))
    for i in 0..<ntasks { // BG: DispatchQueue.concurrentPerform(iterations: ntasks)
        var lHash = [Key:Int]()
        var idx = compress(n, seq: seq[i*slice..<(i*slice+n)])
        lHash[idx] = 1
        for l in i*slice+1..<(i+1)*slice {
            idx = ((idx << 2) & mask) | Key(seq[l+n-1])
            if let value = lHash[idx] {
                lHash[idx] = value + 1
            } else {
                lHash[idx] = 1
            }
        }
        for (key, count) in lHash { // BG: in mQueue.sync
            if let value = hash[key] {
                hash[key] = value + count
            } else {
                hash[key] = count
            }
        }
    }
    let startIdx = seq.count - remainder - (n - 1)
    let endIdx = seq.count - (n - 1)
    for i in startIdx..<endIdx {
        let idx = compress(n, seq: seq[i..<(i+n)])
        if let value = hash[idx] {
            hash[idx] = value + 1
        } else {
            hash[idx] = 1
        }
    }
    return hash
}

// fgets over the fasta text.
nonisolated(unsafe) var input: [Int8] = []
nonisolated(unsafe) var inputPosition = 0
func nextLine(_ buf: UnsafeMutablePointer<Int8>, _ size: Int) -> UnsafeMutablePointer<Int8>? {
    if inputPosition >= input.count { return nil }
    var i = 0
    while i < size - 1 && inputPosition < input.count {
        let c = input[inputPosition]
        inputPosition += 1
        buf[i] = c
        i += 1
        if c == 10 { break }
    }
    buf[i] = 0
    return buf
}

func readInputAndRewrite() -> [Int8] {
    inputPosition = 0
    // Read until sequence THREE
    let buf = UnsafeMutablePointer<Int8>.allocate(capacity: 100)
    defer {
        buf.deallocate()
    }
    let three = ">THREE".utf8.map{Int8($0)}
    while let res = nextLine(buf, 100) {
        if res[0] == three[0] && res[1] == three[1] && res[2] == three[2] {
            break
        }
    }
    // Read sequence
    var seq = [Int8]()
    while let res = nextLine(buf, 100) {
        seq.append(contentsOf: UnsafeMutableBufferPointer(start: res, count: linewidth))
    }
    // Locate newline from at the end
    var nl = seq.count - 1
    var pos = nl
    while pos > seq.count - linewidth {
        if seq[pos] == 10 { // "\n"
            nl = pos
            break
        }
        pos -= 1
    }
    // Convert to bits
    var bitSeq = [Int8](repeating: 0, count: nl)
    for i in 0..<nl {
        bitSeq[i] = (seq[i] & 0x6) >> 1
    }
    return bitSeq
}

func format3(_ x: Double) -> String {
    var buf = [CChar](repeating: 0, count: 64)
    _ = withVaList([x]) { vsnprintf(&buf, 64, "%.3f", $0) }
    return String(cString: buf)
}

func run() -> String {
    var out = ""
    func print(_ s: String = "") { out += s; out += "\n" }

    // Read sequence
    let sequence = readInputAndRewrite()

    let hash = getSequenceHash(1, seq: sequence)
    let total = hash.reduce(0) { $0 + $1.1 }
    for k in hash.keys.sorted(by: { hash[$1]! < hash[$0]! }) {
        print("\(i2c[Int(k)]!) \(format3(100.0*Double(hash[k]!)/Double(total)))")
    }
    print()

    let hash2 = getSequenceHash(2, seq: sequence)
    let total2 = hash2.reduce(0) { $0 + $1.1 }
    for k in hash2.keys.sorted(by: { hash2[$1]! < hash2[$0]! }) {
        print("\(decode(k, 2)) \(format3(100.0*Double(hash2[k]!)/Double(total2)))")
    }
    print()

    let hash3 = getSequenceHash(3, seq: sequence)
    print("\(hash3[encode("GGT")] ?? 0)\tGGT")

    let hash4 = getSequenceHash(4, seq: sequence)
    print("\(hash4[encode("GGTA")] ?? 0)\tGGTA")

    let hash6 = getSequenceHash(6, seq: sequence)
    print("\(hash6[encode("GGTATT")] ?? 0)\tGGTATT")

    let hash12 = getSequenceHash(12, seq: sequence)
    print("\(hash12[encode("GGTATTTTAATT")] ?? 0)\tGGTATTTTAATT")

    let hash18 = getSequenceHash(18, seq: sequence)
    print("\(hash18[encode("GGTATTTTAATTTATAGT")] ?? 0)\tGGTATTTTAATTTATAGT")
    return out
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
func fasta(_ n: Int) -> [Int8] {
    let alu = Array("GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA".utf8).map { Int8($0) }
    var out = [Int8]()
    func puts(_ s: String) { out.append(contentsOf: s.utf8.map { Int8($0) }) }
    puts(">ONE Homo sapiens alu\n")
    var k = 0
    var left = 2 * n
    while left > 0 {
        for _ in 0..<min(left, 60) {
            out.append(alu[k])
            k = (k + 1) % alu.count
        }
        out.append(10)
        left -= 60
    }
    var seed: UInt32 = 42
    func random(_ chars: String, _ probs: [Double], _ count: Int) {
        let cs = chars.utf8.map { Int8($0) }
        var cum = [Double]()
        var c = 0.0
        for p in probs { c += p; cum.append(c) }
        var left = count
        while left > 0 {
            for _ in 0..<min(left, 60) {
                seed = (seed * 3877 + 29573) % 139968
                let r = Double(seed) / 139968.0
                var j = 0
                while j < cum.count - 1 && r >= cum[j] { j += 1 }
                out.append(cs[j])
            }
            out.append(10)
            left -= 60
        }
    }
    puts(">TWO IUB ambiguity codes\n")
    random("acgtBDHKMNRSVWY", [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n)
    puts(">THREE Homo sapiens frequency\n")
    random("acgt", [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n)
    return out
}

@_expose(wasm, "setup")
@_cdecl("setup")
public func setup(_ n: Int32) {
    input = fasta(Int(n))
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    var h: UInt32 = 2166136261
    for b in run().utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}
