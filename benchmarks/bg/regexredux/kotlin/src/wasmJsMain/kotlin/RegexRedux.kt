// Not on BG: translated from BG regex-redux Java GraalVM #4:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-graalvmaot-4.html
// Same steps: clean the input, run the five substitutions in order (the
// LinkedHashMap), count each variant's matches. Java calls PCRE2 (JIT) through
// the FFM API, which Kotlin/Wasm does not have; this uses kotlin.text.Regex
// (Kotlin/Wasm's own engine, in the module). Single-threaded (the executor's
// tasks run in order); stdin -> the fasta text setup(n) makes; println ->
// FNV-1a 32 over the bytes it would print, returned by bench(n).

import kotlin.js.JsExport

private fun run(rawInput: String): String {
    val out = StringBuilder()
    val initialLength = rawInput.length
    val sequence = Regex(">.*\\n|\\n").replace(rawInput, "")
    val sequenceLength = sequence.length

    val iub = LinkedHashMap<String, String>()
    iub.put("tHa[Nt]", "<4>")
    iub.put("aND|caN|Ha[DS]|WaS", "<3>")
    iub.put("a[NSt]|BY", "<2>")
    iub.put("<[^>]*>", "|")
    iub.put("\\|[^|][^|]*\\|", "-")
    var buf = sequence
    for ((pattern, replacement) in iub) {
        buf = Regex(pattern).replace(buf, replacement)
    }
    val magicRegExpsCount = buf.length

    val variants = listOf("agggtaaa|tttaccct",
            "[cgt]gggtaaa|tttaccc[acg]",
            "a[act]ggtaaa|tttacc[agt]t",
            "ag[act]gtaaa|tttac[agt]ct",
            "agg[act]taaa|ttta[agt]cct",
            "aggg[acg]aaa|ttt[cgt]ccct",
            "agggt[cgt]aa|tt[acg]accct",
            "agggta[cgt]a|t[acg]taccct",
            "agggtaa[cgt]|[acg]ttaccct")
    for (variant in variants) {
        val count = Regex(variant).findAll(sequence).count()
        out.append(variant).append(' ').append(count).append('\n')
    }
    out.append('\n')
    out.append(initialLength).append('\n')
    out.append(sequenceLength).append('\n')
    out.append(magicRegExpsCount).append('\n')
    return out.toString()
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
private var input = ""

private fun fasta(n: Int): String {
    val alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
    val out = StringBuilder()
    out.append(">ONE Homo sapiens alu\n")
    var k = 0
    var left = 2 * n
    while (left > 0) {
        val m = minOf(left, 60)
        for (i in 0 until m) {
            out.append(alu[k])
            if (++k == alu.length) k = 0
        }
        out.append('\n')
        left -= m
    }
    var seed = 42
    fun random(chars: String, probs: DoubleArray, count: Int) {
        val cum = DoubleArray(probs.size)
        var c = 0.0
        for (i in probs.indices) { c += probs[i]; cum[i] = c }
        var left = count
        while (left > 0) {
            val m = minOf(left, 60)
            for (i in 0 until m) {
                seed = (seed * 3877 + 29573) % 139968
                val r = seed / 139968.0
                var j = 0
                while (j < cum.size - 1 && r >= cum[j]) j++
                out.append(chars[j])
            }
            out.append('\n')
            left -= m
        }
    }
    out.append(">TWO IUB ambiguity codes\n")
    random("acgtBDHKMNRSVWY", doubleArrayOf(0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02), 3 * n)
    out.append(">THREE Homo sapiens frequency\n")
    random("acgt", doubleArrayOf(0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008), 5 * n)
    return out.toString()
}

@JsExport
fun setup(n: Int) {
    input = fasta(n)
}

@JsExport
fun bench(n: Int): Int {
    val s = run(input)
    var h = 2166136261.toInt()
    for (c in s) h = (h xor c.code) * 16777619
    return h
}
