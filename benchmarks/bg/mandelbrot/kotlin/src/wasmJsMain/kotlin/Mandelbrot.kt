// Not on BG: Kotlin translated from BG mandelbrot Java GraalVM AOT #6 (Krause,
// Whipkey, Bennett, Tran, Enotus):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-graalvmaot-6.html
// Same getByte/putLine. One thread: the rows in order (Java ran 2*NCPU threads on
// an AtomicInteger row counter). bench(n) returns the FNV-1a hash of the bytes the
// Java program writes (header, then the rows).

lateinit var out: Array<ByteArray>
lateinit var Crb: DoubleArray
lateinit var Cib: DoubleArray

fun getByte(x: Int, y: Int): Int {
    val Ci = Cib[y]
    var res = 0
    var i = 0
    while (i < 8) {
        var Zr1 = Crb[x + i]
        var Zi1 = Cib[y]

        var Zr2 = Crb[x + i + 1]
        var Zi2 = Cib[y]

        var b = 0
        var j = 49
        do {
            val nZr1 = Zr1 * Zr1 - Zi1 * Zi1 + Crb[x + i]
            val nZi1 = Zr1 * Zi1 + Zr1 * Zi1 + Cib[y]
            Zr1 = nZr1; Zi1 = nZi1

            val nZr2 = Zr2 * Zr2 - Zi2 * Zi2 + Crb[x + i + 1]
            val nZi2 = Zr2 * Zi2 + Zr2 * Zi2 + Cib[y]
            Zr2 = nZr2; Zi2 = nZi2

            if (Zr1 * Zr1 + Zi1 * Zi1 > 4) b = b or 2
            if (Zr2 * Zr2 + Zi2 * Zi2 > 4) b = b or 1
            if (b == 3) break
        } while (--j > 0)
        res = (res shl 2) + b
        i += 2
    }
    return res xor -1
}

fun putLine(y: Int, line: ByteArray) {
    for (xb in 0 until line.size)
        line[xb] = getByte(xb * 8, y).toByte()
}

fun fnv(h0: Int, s: ByteArray): Int {
    var h = h0
    for (c in s) h = (h xor (c.toInt() and 0xff)) * 16777619
    return h
}

@JsExport
fun bench(n: Int): Int {
    val N = n
    Crb = DoubleArray(N + 7); Cib = DoubleArray(N + 7)
    val invN = 2.0 / N
    for (i in 0 until N) { Cib[i] = i * invN - 1.0; Crb[i] = i * invN - 1.5 }
    out = Array(N) { ByteArray((N + 7) / 8) }

    for (y in 0 until out.size) putLine(y, out[y])

    var h = fnv(2166136261.toInt(), ("P4\n" + N + " " + N + "\n").encodeToByteArray())
    for (i in 0 until N) h = fnv(h, out[i])
    return h
}
