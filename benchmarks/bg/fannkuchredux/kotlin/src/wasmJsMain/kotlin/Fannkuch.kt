// Not on BG: Kotlin/Wasm translated from BG fannkuch-redux Java GraalVM #1 (Oleg Mazurov):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-graalvmaot-1.html
// Single-threaded: one worker runs the 150 tasks in order (the AtomicInteger task
// counter becomes a loop). Class, arrays and loops as the Java. bench(n) returns
// the FNV-1a hash of the bytes printResult printed.

import kotlin.math.max
import kotlin.math.min

private const val NCHUNKS = 150
private var CHUNKSZ = 0
private var NTASKS = 0
private var n = 0
private var Fact = IntArray(0)
private var maxFlips = IntArray(0)
private var chkSums = IntArray(0)

class Fannkuchredux {
    val p = IntArray(n)
    val pp = IntArray(n)
    val count = IntArray(n)

    fun firstPermutation(idx0: Int) {
        var idx = idx0
        for (i in p.indices) {
            p[i] = i
        }

        for (i in count.size - 1 downTo 1) {
            val d = idx / Fact[i]
            count[i] = d
            idx = idx % Fact[i]

            p.copyInto(pp, 0, 0, i + 1)
            for (j in 0..i) {
                p[j] = if (j + d <= i) pp[j + d] else pp[j + d - i - 1]
            }
        }
    }

    fun nextPermutation(): Boolean {
        var first = p[1]
        p[1] = p[0]
        p[0] = first

        var i = 1
        while (++count[i] > i) {
            count[i++] = 0
            p[0] = p[1]
            val next = p[0]
            for (j in 1 until i) {
                p[j] = p[j + 1]
            }
            p[i] = first
            first = next
        }
        return true
    }

    fun countFlips(): Int {
        var flips = 1
        var first = p[0]
        if (p[first] != 0) {
            p.copyInto(pp, 0, 0, pp.size)
            do {
                ++flips
                var lo = 1
                var hi = first - 1
                while (lo < hi) {
                    val t = pp[lo]
                    pp[lo] = pp[hi]
                    pp[hi] = t
                    ++lo
                    --hi
                }
                val t = pp[first]
                pp[first] = first
                first = t
            } while (pp[first] != 0)
        }
        return flips
    }

    fun runTask(task: Int) {
        val idxMin = task * CHUNKSZ
        val idxMax = min(Fact[n], idxMin + CHUNKSZ)

        firstPermutation(idxMin)

        var maxflips = 1
        var chksum = 0
        var i = idxMin
        while (true) {
            if (p[0] != 0) {
                val flips = countFlips()
                maxflips = max(maxflips, flips)
                chksum += if (i % 2 == 0) flips else -flips
            }

            if (++i == idxMax) {
                break
            }

            nextPermutation()
        }
        maxFlips[task] = maxflips
        chkSums[task] = chksum
    }

    fun run() {
        for (task in 0 until NTASKS) {
            runTask(task)
        }
    }
}

private fun fnv(h0: Int, s: String): Int {
    var h = h0
    for (c in s) h = (h xor c.code) * 16777619
    return h
}

private fun printResult(n: Int, res: Int, chk: Int): Int =
    fnv(2166136261.toInt(), "" + chk + "\nPfannkuchen(" + n + ") = " + res + "\n")

@JsExport
fun bench(nArg: Int): Int {
    n = nArg
    if (n < 0 || n > 12) {         // 13! won't fit into int
        return printResult(n, -1, -1)
    }
    if (n <= 1) {
        return printResult(n, 0, 0)
    }

    Fact = IntArray(n + 1)
    Fact[0] = 1
    for (i in 1 until Fact.size) {
        Fact[i] = Fact[i - 1] * i
    }

    CHUNKSZ = (Fact[n] + NCHUNKS - 1) / NCHUNKS
    NTASKS = (Fact[n] + CHUNKSZ - 1) / CHUNKSZ
    maxFlips = IntArray(NTASKS)
    chkSums = IntArray(NTASKS)

    Fannkuchredux().run()

    var res = 0
    for (v in maxFlips) {
        res = max(res, v)
    }
    var chk = 0
    for (v in chkSums) {
        chk += v
    }

    return printResult(n, res, chk)
}
