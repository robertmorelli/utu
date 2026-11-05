// BG regex-redux Swift #4 (Francois Green, Daniel Sell), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-swift-4.html
// Changes: single-threaded (the DispatchQueue tasks run in order); stdin ->
// the fasta text setup(n) makes (as Data); print -> FNV-1a 32 over the bytes
// it would print, returned by bench(n). Foundation's NSRegularExpression and
// replacingOccurrences(options: .regularExpression) as BG (ICU regex on
// WASI: Foundation and ICU ship in the module).

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Francois Green
// variant concurrency added by Daniel Sell

import Foundation

nonisolated(unsafe) let regex: (String) -> NSRegularExpression = { pattern in
    return try! NSRegularExpression(pattern: pattern, options: [])
}

func run(_ input: Data) -> String {
    var out = ""

    var sequence = String(data: input, encoding: .ascii)!

    let inputLength = input.count

    sequence = sequence.replacingOccurrences(of: ">[^\n]*\n|\n", with: "",
                   options: .regularExpression)

    let codeLength = sequence.utf8.count

    var resultLength = 0

    resultLength = [
        (regex: "tHa[Nt]",            replacement: "<4>"),
        (regex: "aND|caN|Ha[DS]|WaS", replacement: "<3>"),
        (regex: "a[NSt]|BY",          replacement: "<2>"),
        (regex: "<[^>]*>",            replacement: "|"),
        (regex: "\\|[^|][^|]*\\|",    replacement: "-")
        ].reduce(sequence) { buffer, iub in
            return buffer.replacingOccurrences(of: iub.regex,
                with: iub.replacement, options: .regularExpression)
    }.utf8.count

    let variants = [
        "agggtaaa|tttaccct",
        "[cgt]gggtaaa|tttaccc[acg]",
        "a[act]ggtaaa|tttacc[agt]t",
        "ag[act]gtaaa|tttac[agt]ct",
        "agg[act]taaa|ttta[agt]cct",
        "aggg[acg]aaa|ttt[cgt]ccct",
        "agggt[cgt]aa|tt[acg]accct",
        "agggta[cgt]a|t[acg]taccct",
        "agggtaa[cgt]|[acg]ttaccct",
    ]

    var variantMatches = Array(repeating: 0, count: variants.count)

    for (i, variant) in variants.enumerated() {
        variantMatches[i] = regex(variant).numberOfMatches(in: sequence,
            options: [], range: NSRange(location: 0, length: codeLength))
    }

    for (i, variant) in variants.enumerated() {
        print(variant, variantMatches[i], to: &out)
    }

    print("", inputLength, codeLength, resultLength, separator: "\n", to: &out)
    return out
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
nonisolated(unsafe) var input = Data()

func fasta(_ n: Int) -> [UInt8] {
    let alu = Array("GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA".utf8)
    var out = [UInt8]()
    out.append(contentsOf: ">ONE Homo sapiens alu\n".utf8)
    var k = 0
    var left = 2 * n
    while left > 0 {
        let m = min(left, 60)
        for _ in 0..<m {
            out.append(alu[k])
            k += 1
            if k == alu.count { k = 0 }
        }
        out.append(10)
        left -= m
    }
    var seed: UInt32 = 42
    func random(_ chars: String, _ probs: [Double], _ count: Int) {
        let cs = Array(chars.utf8)
        var cum = [Double]()
        var c = 0.0
        for p in probs { c += p; cum.append(c) }
        var left = count
        while left > 0 {
            let m = min(left, 60)
            for _ in 0..<m {
                seed = (seed &* 3877 &+ 29573) % 139968
                let r = Double(seed) / 139968.0
                var j = 0
                while j < cum.count - 1 && r >= cum[j] { j += 1 }
                out.append(cs[j])
            }
            out.append(10)
            left -= m
        }
    }
    out.append(contentsOf: ">TWO IUB ambiguity codes\n".utf8)
    random("acgtBDHKMNRSVWY", [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n)
    out.append(contentsOf: ">THREE Homo sapiens frequency\n".utf8)
    random("acgt", [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n)
    return out
}

@_expose(wasm, "setup")
@_cdecl("setup")
public func setup(_ n: Int32) {
    input = Data(fasta(Int(n)))
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    let s = run(input)
    var h: UInt32 = 2166136261
    for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}
