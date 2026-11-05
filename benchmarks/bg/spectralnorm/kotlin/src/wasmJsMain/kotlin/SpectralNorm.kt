// Not on BG: Kotlin translated from BG spectralnorm Java GraalVM AOT #3 (Ziad Hatahet, after Go #4):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-graalvmaot-3.html
// One thread: aTimesTransp runs Times over all rows directly (Java started NCPU
// Thread subclasses and joined them). Kotlin/Wasm has no DecimalFormat, so
// "#.000000000" is format9 below (round to nanos, then digits). bench(n) returns
// the FNV-1a hash of the bytes the Java program prints.
import kotlin.math.abs
import kotlin.math.round
import kotlin.math.sqrt

fun spectralnorm(n: Int): Double {
    val u = DoubleArray(n)
    for (i in 0 until n) u[i] = 1.0
    val v = DoubleArray(n)
    for (i in 0 until 10) {
        aTimesTransp(v, u)
        aTimesTransp(u, v)
    }
    var vBv = 0.0
    var vv = 0.0
    for (i in 0 until n) {
        val vi = v[i]
        vBv += u[i] * vi
        vv += vi * vi
    }
    return sqrt(vBv / vv)
}

fun aTimesTransp(v: DoubleArray, u: DoubleArray) {
    val x = DoubleArray(u.size)
    Times(x, 0, v.size, u, false).run()
    Times(v, 0, v.size, x, true).run()
}

class Times(private val v: DoubleArray, private val ii: Int, private val n: Int, private val u: DoubleArray, private val transpose: Boolean) {
    fun run() {
        val ul = u.size
        for (i in ii until n) {
            var vi = 0.0
            for (j in 0 until ul) {
                if (transpose)
                    vi += u[j] / a(j, i)
                else
                    vi += u[j] / a(i, j)
            }
            v[i] = vi
        }
    }

    private fun a(i: Int, j: Int): Int = (i + j) * (i + j + 1) / 2 + i + 1
}

fun format9(x: Double): String {
    val nanos = round(abs(x) * 1e9).toLong()
    val frac = (nanos % 1_000_000_000L).toString().padStart(9, '0')
    return (if (x < 0) "-" else "") + (nanos / 1_000_000_000L).toString() + "." + frac
}

fun fnv(h0: Int, s: String): Int {
    var h = h0
    for (c in s) h = (h xor c.code) * 16777619
    return h
}

@JsExport
fun bench(n: Int): Int = fnv(2166136261.toInt(), format9(spectralnorm(n)) + "\n")
