// fannkuch-redux from the Computer Language Benchmarks Game, after its
// single-threaded C program, as idiomatic Kotlin over IntArrays: permutations
// generated in place with a count array, each one flipped (prefix reversal)
// until its first element is 0. Compiled to WasmGC by Kotlin/Wasm; bench is
// exported to JavaScript.

@file:OptIn(ExperimentalJsExport::class)

// checksum * 1000 + maxFlips for all permutations of 0..n-1.
fun fannkuch(n: Int): Long {
    val perm = IntArray(n)
    val perm1 = IntArray(n)
    val count = IntArray(n)
    for (i in 0 until n) perm1[i] = i
    var maxFlips = 0
    var checksum = 0
    var permCount = 0
    var r = n
    while (true) {
        while (r != 1) {
            count[r - 1] = r
            r--
        }
        for (i in 0 until n) perm[i] = perm1[i]
        var flips = 0
        var k = perm[0]
        while (k != 0) {
            val k2 = (k + 1) shr 1
            for (i in 0 until k2) {
                val t = perm[i]
                perm[i] = perm[k - i]
                perm[k - i] = t
            }
            flips++
            k = perm[0]
        }
        if (flips > maxFlips) maxFlips = flips
        if (permCount % 2 == 0) checksum += flips else checksum -= flips
        // The next permutation: rotate the first r + 1 elements left until a count stays positive.
        while (true) {
            if (r == n) return checksum * 1000L + maxFlips
            val perm0 = perm1[0]
            for (i in 0 until r) perm1[i] = perm1[i + 1]
            perm1[r] = perm0
            count[r]--
            if (count[r] > 0) break
            r++
        }
        permCount++
    }
}

@JsExport
fun bench(iterations: Int): Long {
    var sink = 0L
    for (i in 0 until iterations) sink += fannkuch(9)
    return sink
}
